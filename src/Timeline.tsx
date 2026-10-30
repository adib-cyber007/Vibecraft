import { memo, useRef, useState, type PointerEvent } from 'react';
import { Plus, Play, Pause, SkipBack, ZoomIn, ZoomOut, List, Layers, ChevronRight, Copy, Trash2, Camera } from 'lucide-react';
import type { Project, SceneElement } from './model';
import { renderProject, prepareImages } from './engine/render';
import { loadFonts } from './storage';
import { sceneStart, sceneDuration, projectDuration, getSceneAtTime, audioTrackStart, audioTrackDuration, sortedCameraKeyframes } from './engine/timeline';
import type { Edit } from './Stage';
import { useEffect } from 'react';

export const timecode=(value:number)=>Math.floor(value/60).toString().padStart(2,'0')+':'+Math.floor(value%60).toString().padStart(2,'0');
export const SceneThumb=memo(function SceneThumb({project,sceneId}:{project:Project;sceneId:string}) {
  const canvas=useRef<HTMLCanvasElement>(null),images=useRef(new Map<string,CanvasImageSource>()),[revision,setRevision]=useState(0);
  const sourceKey=project.scenes.flatMap(scene=>scene.elements.map(element=>(element.src||'')+(element.fontFamily||''))).join('|');
  useEffect(()=>{let active=true;Promise.all([prepareImages(project),loadFonts(project)]).then(([loaded])=>{if(active){images.current=loaded;setRevision(value=>value+1);}}).catch(()=>{});return()=>{active=false;};},[sourceKey]);
  useEffect(()=>{const ctx=canvas.current?.getContext('2d');if(ctx)renderProject(ctx,project,sceneStart(project,sceneId)+0.001,{width:240,height:135,images:images.current,preview:true});},[project,sceneId,revision]);
  return <canvas ref={canvas} width={240} height={135}/>;
},(previous,next)=>{
  const a=previous.project,b=next.project;if(previous.sceneId!==next.sceneId||a.width!==b.width||a.height!==b.height||a.mode!==b.mode||a.fonts!==b.fonts)return false;
  const ai=a.scenes.findIndex(s=>s.id===previous.sceneId),bi=b.scenes.findIndex(s=>s.id===next.sceneId);
  if(a.mode==='roaming')return ai===bi&&a.scenes.slice(0,ai+1).every((scene,index)=>scene===b.scenes[index]);
  return a.scenes[ai]===b.scenes[bi];
});
interface Props {project:Project;sceneId:string;onScene:(id:string)=>void;onAdd:()=>void;onDuplicate:()=>void;onDelete:()=>void;selection:string[];onSelect:(ids:string[])=>void;time:number;onSeek:(time:number)=>void;playing:boolean;onPlay:()=>void;edit:Edit;checkpoint:()=>void;onAudio:(id:string)=>void;showSceneStrip?:boolean}
export function Timeline({project,sceneId,onScene,onAdd,onDuplicate,onDelete,selection,onSelect,time,onSeek,playing,onPlay,edit,checkpoint,onAudio,showSceneStrip=true}:Props) {
  const [advanced,setAdvanced]=useState(()=>{try{return localStorage.getItem('vibecraft-timeline')==='advanced';}catch{return false;}}),[scale,setScale]=useState(64);
  function setMode(value:boolean){setAdvanced(value);try{localStorage.setItem('vibecraft-timeline',value?'advanced':'simple');}catch{}}
  const scene=project.scenes.find(s=>s.id===sceneId)||project.scenes[0],start=sceneStart(project,scene.id),duration=sceneDuration(scene),total=projectDuration(project),scroller=useRef<HTMLDivElement>(null);
  const drag=useRef<{id:string;type:'start'|'draw'|'hold'|'exit';x:number;original:number}|null>(null);
  function begin(e:PointerEvent,el:SceneElement,type:'start'|'draw'|'hold'|'exit'){
    e.preventDefault();e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);checkpoint();onSelect([el.id]);
    drag.current={id:el.id,type,x:e.clientX,original:el.animation[type]};
  }
  function move(e:PointerEvent){
    const d=drag.current;if(!d)return;
    const value=Math.round(Math.max(d.type==='start'?0:0.05,d.original+(e.clientX-d.x)/scale)*20)/20;
    edit(p=>{p.scenes.find(s=>s.id===scene.id)!.elements.find(el=>el.id===d.id)!.animation[d.type]=value;},false);
  }
  function seek(e:PointerEvent<HTMLDivElement>){
    const r=e.currentTarget.getBoundingClientRect();onSeek(start+Math.min(duration,Math.max(0,(e.clientX-r.left)/scale)));
  }
  return <section className={'timeline '+(advanced?'advanced':'simple')} aria-label="Animation timeline">
    {showSceneStrip&&<div className="storyboard">
      <div className="storyboard-heading"><span>Scenes</span><span>{project.scenes.length}</span></div>
      <div className="scene-cards">{project.scenes.map((s,i)=><button key={s.id} draggable onDragStart={e=>e.dataTransfer.setData('scene',s.id)} onDragOver={e=>e.preventDefault()} onDrop={e=>{const id=e.dataTransfer.getData('scene');if(id&&id!==s.id)edit(p=>{const index=p.scenes.findIndex(item=>item.id===id),target=p.scenes.findIndex(item=>item.id===s.id);p.scenes.splice(target,0,p.scenes.splice(index,1)[0]);});}} className={'scene-card '+(s.id===scene.id?'active':'')} onClick={()=>onScene(s.id)} aria-label={'Open scene '+(i+1)+': '+s.name}>
        <span className="scene-number">{i+1}</span><SceneThumb project={project} sceneId={s.id}/><span className="scene-card-label">{s.name}<em>{sceneDuration(s).toFixed(1)}s</em></span>
      </button>)}<button className="add-scene" onClick={onAdd} title="Add scene"><Plus size={20}/><span>Add scene</span></button></div>
      <div className="scene-actions"><button title="Duplicate scene" onClick={onDuplicate}><Copy size={15}/></button><button title="Delete scene" onClick={onDelete} disabled={project.scenes.length===1}><Trash2 size={15}/></button></div>
    </div>}
    <div className="timeline-explanation"><span>{advanced?'Drag a colored bar to change when it starts. Drag its edge to change the duration.':'Select a card to edit its appearance and animation. Switch to Advanced for precise timing.'}</span>{advanced&&<div><i className="legend-draw"/>Entrance<i className="legend-hold"/>Hold<i className="legend-exit"/>Exit</div>}</div>
    <div className="transport">
      <div className="transport-left"><button title="Return to start" onClick={()=>onSeek(0)}><SkipBack size={16}/></button><button className="play-small" title={playing?'Pause':'Play'} onClick={onPlay}>{playing?<Pause size={15}/>:<Play size={15} fill="currentColor"/>}</button><span className="time-readout">{timecode(time)}<small> / {timecode(total)}</small></span><input aria-label="Seek animation" type="range" min={0} max={total} step={0.05} value={time} onChange={e=>onSeek(Number(e.target.value))}/></div>
      <div className="transport-right"><button className={'timeline-mode'+(!advanced?' selected':'')} onClick={()=>setMode(false)} title="Simple timeline" aria-pressed={!advanced}><List size={15}/><span>Simple</span></button><button className={'timeline-mode'+(advanced?' selected':'')} onClick={()=>setMode(true)} title="Advanced timeline" aria-pressed={advanced}><Layers size={15}/><span>Advanced</span></button><span className="divider"/><button title="Zoom timeline out" onClick={()=>setScale(v=>Math.max(24,v-16))}><ZoomOut size={15}/></button><span>{Math.round(scale/64*100)}%</span><button title="Zoom timeline in" onClick={()=>setScale(v=>Math.min(160,v+16))}><ZoomIn size={15}/></button></div>
    </div>
    {advanced?<div className="timeline-scroll" ref={scroller}>
      <div className="timeline-grid" style={{minWidth:Math.max(600,duration*scale+180)}}>
        <div className="ruler-row"><div className="track-label">Elements <ChevronRight size={12}/></div><div className="ruler" style={{width:duration*scale}} onPointerDown={seek}>{Array.from({length:Math.ceil(duration)+1},(_,i)=><span key={i} style={{left:i*scale}}>{i}s</span>)}</div></div>
        {!!scene.cameras?.length&&<div className="track-row camera-track-row"><div className="track-label"><Camera size={14}/> Cameras</div><div className="track-space" style={{width:duration*scale,backgroundSize:scale+'px 100%'}} onPointerDown={seek}>{sortedCameraKeyframes(scene).map((camera,index)=><button key={camera.id} className="camera-track-marker" title={camera.name+' at '+camera.start.toFixed(1)+'s'} style={{left:camera.start*scale,width:Math.max(30,(camera.duration+camera.pause)*scale)}} onPointerDown={event=>event.stopPropagation()} onClick={()=>onSeek(start+camera.start)}><Camera size={12}/>{index+1}</button>)}</div></div>}
        {scene.elements.map((el,i)=><div key={el.id} className={'track-row '+(selection.includes(el.id)?'active':'')} draggable onDragStart={e=>e.dataTransfer.setData('element',el.id)} onDragOver={e=>e.preventDefault()} onDrop={e=>{const id=e.dataTransfer.getData('element');if(id&&id!==el.id)edit(p=>{const els=p.scenes.find(s=>s.id===scene.id)!.elements;const source=els.findIndex(item=>item.id===id),target=els.findIndex(item=>item.id===el.id);els.splice(target,0,els.splice(source,1)[0]);});}}>
          <button className="track-label" onClick={()=>onSelect([el.id])}><span className={'track-type '+el.type}>{el.type==='text'?'T':el.type==='shape'?'◇':'✎'}</span><span>{el.name}</span></button>
          <div className="track-space" style={{width:duration*scale,backgroundSize:scale+'px 100%'}} onPointerDown={seek}>
            <div className={'animation-bar '+(el.hidden?'muted':'')} style={{left:el.animation.start*scale,width:Math.max(5,(el.animation.draw+el.animation.hold+el.animation.exit)*scale)}} onPointerDown={e=>begin(e,el,'start')} onPointerMove={move} onPointerUp={()=>drag.current=null} onPointerCancel={()=>drag.current=null}>
              <div className="bar-draw" style={{width:el.animation.draw*scale}} title={'Entrance: '+el.animation.draw+' seconds'}><span>{el.animation.entrance}</span><i onPointerDown={e=>begin(e,el,'draw')}/></div>
              <div className="bar-hold" style={{width:el.animation.hold*scale}} title={'Hold: '+el.animation.hold+' seconds'}><i onPointerDown={e=>begin(e,el,'hold')}/></div>
              {el.animation.exit>0&&<div className="bar-exit" style={{width:el.animation.exit*scale}} title={'Exit: '+el.animation.exit+' seconds'}><i onPointerDown={e=>begin(e,el,'exit')}/></div>}
            </div>
          </div>
        </div>)}
        {project.audio.filter(a=>!a.sceneId||a.sceneId===scene.id).map(a=><div className="track-row audio-track-row" key={a.id}><button className="track-label" onClick={()=>onAudio(a.id)}><span className="track-type audio">♪</span><span>{a.name}</span></button><div className="track-space" style={{width:duration*scale,backgroundSize:scale+'px 100%'}}><button className="audio-bar" onClick={()=>onAudio(a.id)} style={{left:Math.max(0,audioTrackStart(project,a)-start)*scale,width:Math.max(8,Math.min(duration,audioTrackDuration(a))*scale)}}><span className="wave-pattern"/>{a.name}</button></div></div>)}
        <div className="playhead" style={{left:180+Math.max(0,Math.min(duration,time-start))*scale}}><span/></div>
        {!scene.elements.length&&<div className="timeline-empty">Add something to your canvas. Its animation will appear here.</div>}
      </div>
    </div>:<div className="simple-elements">{scene.elements.map((el,i)=><button key={el.id} className={selection.includes(el.id)?'active':''} onClick={()=>onSelect([el.id])}><span>{i+1} · {el.type==='text'?'Text':el.type==='vector'?'Drawing':el.type==='image'?'Image':el.type==='chart'?'Chart':'Shape'}</span><strong>{el.name}</strong><small>{el.animation.draw.toFixed(1)}s draw · starts at {el.animation.start.toFixed(1)}s</small></button>)}{!scene.elements.length&&<p className="simple-empty">Your first drawing or text will appear here. Add something to the canvas to begin.</p>}</div>}
  </section>;
}
