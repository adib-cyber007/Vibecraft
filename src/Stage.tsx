import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { renderProject, prepareImages } from './engine/render';
import { sceneStart } from './engine/timeline';
import { createElement, defaultAnimation, type Project, type SceneElement } from './model';
import { loadFonts } from './storage';

export type Edit = (fn: (project: Project) => void, record?: boolean) => void;
export type Tool = 'select' | 'pan' | 'text' | 'rectangle' | 'ellipse' | 'arrow';
interface Props {
  project: Project; sceneId: string; selection: string[]; onSelect: (ids: string[]) => void;
  time: number; playing: boolean; previewing: boolean; zoom: number; pan: {x:number;y:number};
  onPan: (pan:{x:number;y:number}) => void; tool: Tool; onTool:(tool:Tool)=>void;
  edit: Edit; checkpoint: () => void; onError:(message:string)=>void; onEditText?:(id:string)=>void; onAddContent?:()=>void; onAddText?:()=>void; showCameras?:boolean;
}
interface Gesture {
  type:'move'|'resize'|'rotate'|'marquee'|'pan'; start:{x:number;y:number}; ids:string[];
  elements:SceneElement[]; handle?:string; changed:boolean; initialPan:{x:number;y:number};
}
export function Stage(props: Props) {
  const {project,sceneId,selection,onSelect,time,playing,previewing,zoom,pan,onPan,tool,onTool,edit,checkpoint,onError} = props;
  const scene = project.scenes.find(s=>s.id===sceneId) || project.scenes[0];
  const canvas = useRef<HTMLCanvasElement>(null), frame = useRef<HTMLDivElement>(null), gesture = useRef<Gesture|null>(null);
  const images = useRef(new Map<string,CanvasImageSource>()), [revision,setRevision]=useState(0),[marquee,setMarquee]=useState<{x:number;y:number;w:number;h:number}|null>(null);
  const [space,setSpace]=useState(false), [guides,setGuides]=useState(false);
  const worktop=useRef<HTMLDivElement>(null),[paperWidth,setPaperWidth]=useState<number>();
  useEffect(()=>{if(!worktop.current)return;const observer=new ResizeObserver(entries=>{const bounds=entries[0].contentRect;setPaperWidth(Math.max(1,Math.min(bounds.width,bounds.height*project.width/project.height)));});observer.observe(worktop.current);return()=>observer.disconnect();},[project.width,project.height]);
  const imageKey=project.scenes.flatMap(s=>s.elements.map(e=>(e.src||'')+(e.fontFamily||'')+(e.fontWeight||''))).join('|')+(project.fonts||[]).map(f=>f.family).join('|');
  useEffect(()=> {
    let active=true;
    Promise.all([prepareImages(project),loadFonts(project)]).then(([map])=>{if(active){images.current=map;setRevision(v=>v+1);}}).catch(e=>onError(String(e.message||e)));
    return ()=>{active=false;};
  },[imageKey]);
  useEffect(()=> {
    const ctx=canvas.current?.getContext('2d');
    if(ctx) renderProject(ctx,project,previewing?time:sceneStart(project,scene.id)+0.001,{width:project.width,height:project.height,images:images.current,preview:!previewing});
  },[project,scene.id,time,previewing,revision]);
  useEffect(()=>{
    const down=(e:KeyboardEvent)=>{if(e.code==='Space'&&!['INPUT','TEXTAREA','SELECT'].includes((e.target as HTMLElement).tagName)){setSpace(true);}};
    const up=(e:KeyboardEvent)=>{if(e.code==='Space')setSpace(false);};
    const blur=()=>setSpace(false);
    window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);
    return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);};
  },[]);
  const world=(e:{clientX:number;clientY:number})=>{
    const r=frame.current!.getBoundingClientRect();
    return {x:((e.clientX-r.left)/r.width*project.width-project.width/2)/scene.camera.zoom+scene.camera.x,y:((e.clientY-r.top)/r.height*project.height-project.height/2)/scene.camera.zoom+scene.camera.y};
  };
  const bounds=(e:SceneElement)=>({left:((e.x-scene.camera.x)*scene.camera.zoom+project.width/2)/project.width*100,top:((e.y-scene.camera.y)*scene.camera.zoom+project.height/2)/project.height*100,width:e.width*scene.camera.zoom/project.width*100,height:e.height*scene.camera.zoom/project.height*100});
  function down(e:PointerEvent<HTMLElement>,handle?:string) {
    if(playing||previewing||e.button!==0)return;
    const point=world(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    if(tool==='pan'||space){gesture.current={type:'pan',start:{x:e.clientX,y:e.clientY},ids:[],elements:[],changed:false,initialPan:pan};return;}
    if(tool!=='select'){
      const element=createElement(tool==='text'?'text':'shape',{x:point.x,y:point.y,width:tool==='text'?650:300,height:tool==='text'?180:220,...(tool==='text'?{text:'Tell your story',name:'Tell your story',fontFamily:'Kalam'}:{shape:tool}),animation:{...defaultAnimation(),start:scene.elements.length?Math.max(...scene.elements.map(el=>el.animation.start+el.animation.draw))+0.5:0}});
      edit(p=>p.scenes.find(s=>s.id===scene.id)!.elements.push(element));onSelect([element.id]);onTool('select');return;
    }
    let ids=selection;
    if(!handle){
      const hit=[...scene.elements].reverse().find(el=>{
        if(el.hidden||el.locked)return false;
        const angle=-el.rotation*Math.PI/180,dx=point.x-(el.x+el.width/2),dy=point.y-(el.y+el.height/2);
        const x=dx*Math.cos(angle)-dy*Math.sin(angle)+el.width/2,y=dx*Math.sin(angle)+dy*Math.cos(angle)+el.height/2;
        return x>=0&&x<=el.width&&y>=0&&y<=el.height;
      });
      if(hit){ids=e.shiftKey?(selection.includes(hit.id)?selection.filter(id=>id!==hit.id):[...selection,hit.id]):selection.includes(hit.id)?selection:[hit.id];onSelect(ids);}
      else{if(!e.shiftKey)onSelect([]);gesture.current={type:'marquee',start:point,ids:e.shiftKey?selection:[],elements:[],changed:false,initialPan:pan};return;}
    }
    gesture.current={type:handle==='rotate'?'rotate':handle?'resize':'move',start:point,ids,elements:structuredClone(scene.elements.filter(el=>ids.includes(el.id)&&!el.locked)),handle,changed:false,initialPan:pan};
    e.preventDefault();
  }
  function move(e:PointerEvent<HTMLDivElement>) {
    const g=gesture.current;if(!g)return;
    if(g.type==='pan'){onPan({x:g.initialPan.x+e.clientX-g.start.x,y:g.initialPan.y+e.clientY-g.start.y});return;}
    const point=world(e),dx=point.x-g.start.x,dy=point.y-g.start.y;
    if(g.type==='marquee'){
      const box={x:Math.min(g.start.x,point.x),y:Math.min(g.start.y,point.y),w:Math.abs(dx),h:Math.abs(dy)};
      setMarquee(box);
      onSelect([...new Set([...g.ids,...scene.elements.filter(el=>!el.hidden&&!el.locked&&el.x>=box.x&&el.y>=box.y&&el.x+el.width<=box.x+box.w&&el.y+el.height<=box.y+box.h).map(el=>el.id)])]);return;
    }
    if(!g.elements.length)return;
    if(!g.changed&&Math.hypot(dx,dy)>1){checkpoint();g.changed=true;}
    if(!g.changed)return;
    setGuides(g.type==='move');
    edit(p=>{
      const target=p.scenes.find(s=>s.id===scene.id)!;
      for(const origin of g.elements){
        const el=target.elements.find(el=>el.id===origin.id)!;
        if(g.type==='move'){
          let x=origin.x+dx,y=origin.y+dy;
          if(!e.altKey){if(Math.abs(x+el.width/2-scene.camera.x)<12/scene.camera.zoom)x=scene.camera.x-el.width/2;if(Math.abs(y+el.height/2-scene.camera.y)<12/scene.camera.zoom)y=scene.camera.y-el.height/2;}
          el.x=Math.round(x);el.y=Math.round(y);
        }else if(g.type==='rotate'){
          el.rotation=Math.round(Math.atan2(point.y-(origin.y+origin.height/2),point.x-(origin.x+origin.width/2))*180/Math.PI+90);
          if(e.shiftKey)el.rotation=Math.round(el.rotation/15)*15;
        }else{
          const h=g.handle||'se';
          let w=Math.max(20,origin.width+(h.includes('w')?-dx:dx)),height=Math.max(20,origin.height+(h.includes('n')?-dy:dy));
          if(e.shiftKey)height=w*origin.height/origin.width;
          el.width=Math.round(w);el.height=Math.round(height);el.x=h.includes('w')?origin.x+origin.width-w:origin.x;el.y=h.includes('n')?origin.y+origin.height-height:origin.y;
        }
      }
    },false);
  }
  function up(){gesture.current=null;setMarquee(null);setGuides(false);}
  return <div ref={worktop} className={'worktop tool-'+tool+(space?' space-pan':'')} onPointerUp={up} onPointerCancel={up}>
    <div className="paper-label">{scene.name}<span>{project.width} × {project.height}</span></div>
    <div className="paper" ref={frame} style={{width:paperWidth?paperWidth+'px':'100%',aspectRatio:project.width+'/'+project.height,transform:'translate('+pan.x+'px,'+pan.y+'px) scale('+zoom+')',maxWidth:'1100px'}}
      onPointerDown={e=>down(e)} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onDoubleClick={e=>{if(previewing)return;const point=world(e);const el=[...scene.elements].reverse().find(el=>el.type==='text'&&!el.hidden&&!el.locked&&point.x>=el.x&&point.x<=el.x+el.width&&point.y>=el.y&&point.y<=el.y+el.height);if(el)props.onEditText?.(el.id);}} aria-label="Animation canvas">
      <canvas ref={canvas} width={project.width} height={project.height}/>
      {!previewing&&scene.cameras?.filter(camera=>camera.pinned).map(camera=><div key={camera.id} className="camera-pinned-outline" style={{left:((camera.camera.x-project.width/camera.camera.zoom/2-scene.camera.x)*scene.camera.zoom/project.width+0.5)*100+'%',top:((camera.camera.y-project.height/camera.camera.zoom/2-scene.camera.y)*scene.camera.zoom/project.height+0.5)*100+'%',width:scene.camera.zoom/camera.camera.zoom*100+'%',height:scene.camera.zoom/camera.camera.zoom*100+'%'}}><span>{camera.name}</span></div>)}
      {!previewing&&props.showCameras&&<div className="camera-outline"><span>Camera view · {scene.camera.zoom.toFixed(2)}×</span></div>}
      {!previewing&&scene.elements.filter(el=>selection.includes(el.id)&&!el.hidden).map(el=>{const b=bounds(el);return <div key={el.id} className={'selection-box'+(el.locked?' locked':'')} style={{left:b.left+'%',top:b.top+'%',width:b.width+'%',height:b.height+'%',transform:'rotate('+el.rotation+'deg)'}}>
        {selection.length===1&&!el.locked&&<><span className="selection-name">{el.name.slice(0,28)}</span>{['nw','ne','sw','se','rotate'].map(h=><button key={h} aria-label={h==='rotate'?'Rotate selection':'Resize '+h} className={'selection-handle '+h} onPointerDown={e=>{e.stopPropagation();down(e,h);}}/>)}</>}
      </div>;})}
      {guides&&<><i className="guide horizontal"/><i className="guide vertical"/></>}
      {marquee&&<div className="marquee" style={{left:((marquee.x-scene.camera.x)*scene.camera.zoom+project.width/2)/project.width*100+'%',top:((marquee.y-scene.camera.y)*scene.camera.zoom+project.height/2)/project.height*100+'%',width:marquee.w*scene.camera.zoom/project.width*100+'%',height:marquee.h*scene.camera.zoom/project.height*100+'%'}}/>}
    </div>
    {!scene.elements.length&&<div className="empty-canvas-hint"><strong>What would you like to explain?</strong><span>Add your first drawing or a few words. You can change everything later.</span><div><button className="primary-button" onClick={()=>props.onAddContent?.()}>Add an illustration</button><button className="secondary-button" onClick={()=>props.onAddText?.()}>Add text</button></div></div>}
    <div className="canvas-hint">Drag to arrange <span>Double-click text to edit</span><span>Space + drag to pan</span></div>
  </div>;
}
