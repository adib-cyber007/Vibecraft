import { useCallback, useEffect, useRef, useState } from 'react';
import { FolderOpen, Undo2, Redo2, Play, Pause, Download, ChevronDown, Plus, Search, Trash2, Copy, Upload, Type, Shapes, Images, Music2, LayoutTemplate, Sparkles, MousePointer2, Hand, ZoomIn, ZoomOut, Maximize, HelpCircle, Camera, Check, PanelLeftClose, FileJson, X, ArrowLeft, BarChart3, Bold, Circle, ArrowUpRight, Square, LoaderCircle } from 'lucide-react';
import { createElement, createScene, defaultAnimation, makeId, type Project, type SceneElement } from './model';
import { assets, assetCategories, type VectorAsset } from './assets';
import { makeTemplate, templates } from './templates';
import { sceneDuration, sceneStart, projectDuration, getSceneAtTime, audioTrackStart, audioTrackDuration, audioVolumeAtTime } from './engine/timeline';
import { Stage, type Tool, type Edit } from './Stage';
import { Inspector } from './Inspector';
import { Timeline, timecode } from './Timeline';
import { AudioPanel } from './AudioPanel';
import { ScriptPanel } from './ScriptPanel';
import { Logo, IconButton, Dialog, Field } from './ui';
import { ProjectsDialog, ExportDialog } from './modals';
import { saveProject, listProjects, portableProject, downloadBlob, readDataURL, loadFonts } from './storage';
import { assertSafeSvg, decodeDataUrl, parseProject } from './validation';
import { parseVectorSvg } from './svg-import';
import { EditorGuide } from './EditorGuide';
import { SceneNavigator } from './SceneNavigator';
import { CameraPanel } from './CameraPanel';
import './editor-friendly.css';
import './reference-environment.css';

type Panel='scenes'|'camera'|'library'|'text'|'shapes'|'templates'|'uploads'|'audio'|'script';
function AssetPreview({asset}:{asset:VectorAsset}){return <svg viewBox="0 0 100 100" aria-hidden="true">{asset.paths.map((path,i)=><path key={i} d={path.d} fill={path.fill||'none'} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>)}</svg>;}
export default function App(){
  const [project,setProject]=useState<Project>(()=>makeTemplate()),projectRef=useRef(project);
  const [ready,setReady]=useState(false),[saveStatus,setSaveStatus]=useState('Opening studio'),[panel,setPanel]=useState<Panel>('scenes'),[sceneId,setSceneId]=useState(project.scenes[0].id),[selection,setSelection]=useState<string[]>([]);
  const [tool,setTool]=useState<Tool>('select'),[time,setTime]=useState(0),[playing,setPlaying]=useState(false),[previewing,setPreviewing]=useState(false),[zoom,setZoom]=useState(1),[pan,setPan]=useState({x:0,y:0});
  const [search,setSearch]=useState(''),[category,setCategory]=useState('All'),[modal,setModal]=useState<'projects'|'export'|'help'|null>(null),[toast,setToast]=useState(''),[historyRevision,setHistoryRevision]=useState(0),[audioId,setAudioId]=useState<string>();
  const [libraryTab,setLibraryTab]=useState<'all'|'recent'>('all'),[recentAssets,setRecentAssets]=useState<string[]>(()=>{try{const ids=JSON.parse(localStorage.getItem('vibecraft-recent-assets')||'[]');return Array.isArray(ids)?ids.filter(id=>typeof id==='string').slice(0,24):[];}catch{return [];}});
  const [panelVisible,setPanelVisible]=useState(true),[busy,setBusy]=useState(false);
  const [showGuide,setShowGuide]=useState(()=>{try{return localStorage.getItem('vibecraft-guide-dismissed')!=='yes';}catch{return true;}});
  const [animationFocus,setAnimationFocus]=useState(0),[textFocus,setTextFocus]=useState(0);
  function dismissGuide(){setShowGuide(false);try{localStorage.setItem('vibecraft-guide-dismissed','yes');}catch{}}
  function focusAnimation(){const first=currentScene.elements.find(el=>!el.hidden&&!el.locked);if(!selection.length&&first)select([first.id]);if(!first&&!selection.length){notify('Add an illustration or text first, then set its animation.');setPanel('library');setPanelVisible(true);return;}setAnimationFocus(value=>value+1);}
  function focusText(id:string){select([id]);setTextFocus(value=>value+1);}
  const past=useRef<Project[]>([]),future=useRef<Project[]>([]),clipboard=useRef<SceneElement[]>([]),toastTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const imageInput=useRef<HTMLInputElement>(null),fontInput=useRef<HTMLInputElement>(null),audioNodes=useRef<Map<string,HTMLAudioElement>>(new Map());
  const currentScene=project.scenes.find(s=>s.id===sceneId)||project.scenes[0],duration=projectDuration(project);
  const notify=useCallback((message:string)=>{setToast(message);clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(''),6500);},[]);
  const apply=useCallback((value:Project)=>{projectRef.current=value;setProject(value);setSaveStatus('Saving…');},[]);
  const checkpoint=useCallback(()=>{past.current.push(structuredClone(projectRef.current));if(past.current.length>70)past.current.shift();future.current=[];setHistoryRevision(n=>n+1);},[]);
  const edit:Edit=useCallback((fn,record=true)=>{if(record)checkpoint();const p=structuredClone(projectRef.current);fn(p);p.updatedAt=new Date().toISOString();apply(p);},[checkpoint,apply]);
  function undo(){const previous=past.current.pop();if(previous){future.current.push(projectRef.current);previous.updatedAt=new Date().toISOString();apply(previous);setHistoryRevision(n=>n+1);}}
  function redo(){const next=future.current.pop();if(next){past.current.push(projectRef.current);next.updatedAt=new Date().toISOString();apply(next);setHistoryRevision(n=>n+1);}}
  useEffect(()=>{
    document.title='Vibecraft — Animation studio';
    let active=true;
    listProjects().then(list=>{if(!active)return;if(list.length){const p=parseProject(list[0]);projectRef.current=p;setProject(p);setSceneId(p.scenes[0].id);}setReady(true);setSaveStatus('Saved on this computer');}).catch(e=>{if(active){setReady(true);notify('Could not read saved projects: '+e.message);}});
    return()=>{active=false;clearTimeout(toastTimer.current);};
  },[]);
  useEffect(()=>{
    if(!ready)return;setSaveStatus('Saving…');let cancelled=false;
    const timer=setTimeout(()=>{saveProject(project).then(()=>{if(!cancelled)setSaveStatus('Saved on this computer');}).catch(e=>{if(!cancelled){setSaveStatus('Save failed');notify('Could not save: '+e.message+'. Download a project file to keep a backup.');}});},600);
    return()=>{cancelled=true;clearTimeout(timer);};
  },[project,ready]);
  useEffect(()=>{if(!project.scenes.some(s=>s.id===sceneId)){setSceneId(project.scenes[0].id);setSelection([]);}setTime(t=>Math.min(t,projectDuration(project)));},[project]);
  useEffect(()=>{
    const nodes=new Map<string,HTMLAudioElement>();
    project.audio.forEach(track=>{const audio=new Audio(track.src);audio.preload='auto';nodes.set(track.id,audio);});audioNodes.current=nodes;
    return()=>{nodes.forEach(audio=>{audio.pause();audio.src='';});};
  },[project.audio]);
  useEffect(()=>{
    if(!playing){audioNodes.current.forEach(audio=>audio.pause());return;}
    let raf=0,last=performance.now(),current=time;
    const tick=(now:number)=>{
      current+=Math.min((now-last)/1000,0.15);last=now;
      const p=projectRef.current,total=projectDuration(p);
      if(current>=total){setTime(total);setPlaying(false);return;}
      for(const track of p.audio){
        const audio=audioNodes.current.get(track.id);if(!audio)continue;
        const elapsed=current-audioTrackStart(p,track);
        if(elapsed>=0&&elapsed<audioTrackDuration(track)){
          const target=track.trimStart+elapsed;if(Math.abs(audio.currentTime-target)>0.18)audio.currentTime=target;audio.volume=audioVolumeAtTime(p,track,current);
          if(audio.paused)void audio.play().catch(()=>{});
        }else audio.pause();
      }
      setTime(current);const state=getSceneAtTime(p,current);if(state)setSceneId(state.scene.id);
      raf=requestAnimationFrame(tick);
    };raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf);
  },[playing]);
  function chooseScene(id:string){setPlaying(false);setPreviewing(false);setSceneId(id);setSelection([]);setTime(sceneStart(projectRef.current,id));setPan({x:0,y:0});}
  function seek(value:number){setPlaying(false);setPreviewing(true);setTime(value);const state=getSceneAtTime(projectRef.current,value);if(state)setSceneId(state.scene.id);}
  function play(){
    if(playing){setPlaying(false);return;}
    setSelection([]);setPreviewing(true);if(time>=duration-0.05)setTime(0);setPlaying(true);
  }
  function select(ids:string[]){setSelection(ids);setPlaying(false);setPreviewing(false);setTool('select');}
  function addElement(element:SceneElement){
    const p=projectRef.current,s=p.scenes.find(s=>s.id===sceneId)||p.scenes[0];
    if(s.elements.length>=150){notify('A scene can contain up to 150 elements. Add another scene to keep building.');return;}
    element.x=s.camera.x-element.width/2;element.y=s.camera.y-element.height/2;
    element.animation.start=s.elements.length?Math.round(Math.max(...s.elements.map(el=>el.animation.start+el.animation.draw))*10)/10+0.3:0;
    edit(p=>p.scenes.find(item=>item.id===s.id)!.elements.push(element));select([element.id]);
  }
  function addAsset(asset:VectorAsset){addElement(createElement('vector',{name:asset.name,paths:structuredClone(asset.paths),width:360,height:360,color:'#25364a',strokeWidth:1.7}));setRecentAssets(previous=>{const next=[asset.id,...previous.filter(id=>id!==asset.id)].slice(0,24);try{localStorage.setItem('vibecraft-recent-assets',JSON.stringify(next));}catch{}return next;});}
  function addText(kind='heading'){addElement(createElement('text',{name:kind==='heading'?'Your next big idea':'A little detail goes a long way.',text:kind==='heading'?'Your next big idea':kind==='note'?'A handwritten note':'A little detail goes a long way.',fontFamily:kind==='body'?'DM Sans':'Kalam',fontSize:kind==='heading'?88:kind==='body'?44:64,fontWeight:kind==='heading'?700:400,width:850,height:220}));}
  function duplicate(){
    const originals=currentScene.elements.filter(e=>selection.includes(e.id));if(!originals.length)return;
    const copies=originals.map(e=>({...structuredClone(e),id:makeId(),x:e.x+35,y:e.y+35,name:e.name+' copy'}));edit(p=>p.scenes.find(s=>s.id===sceneId)!.elements.push(...copies));select(copies.map(e=>e.id));
  }
  function remove(){if(!selection.length)return;edit(p=>{const s=p.scenes.find(s=>s.id===sceneId)!;s.elements=s.elements.filter(e=>!selection.includes(e.id));});setSelection([]);}
  function addScene(){if(project.scenes.length>=25){notify('This project has reached 25 scenes.');return;}const s=createScene(project.width,project.height,{name:'Scene '+(project.scenes.length+1)});edit(p=>p.scenes.push(s));chooseScene(s.id);}
  function duplicateScene(){if(project.scenes.length>=25)return;const s=structuredClone(currentScene),old=s.id;s.id=makeId();s.name+=' copy';s.elements.forEach(e=>e.id=makeId());s.cameras?.forEach(camera=>camera.id=makeId());edit(p=>{p.scenes.splice(p.scenes.findIndex(s=>s.id===old)+1,0,s);p.audio.push(...p.audio.filter(a=>a.sceneId===old).map(a=>({...a,id:makeId(),sceneId:s.id})));});chooseScene(s.id);}
  function removeScene(){if(project.scenes.length<=1)return;const index=project.scenes.findIndex(s=>s.id===sceneId),next=project.scenes[index===0?1:index-1].id;edit(p=>{p.scenes=p.scenes.filter(s=>s.id!==sceneId);p.audio=p.audio.filter(a=>a.sceneId!==sceneId);});chooseScene(next);}
  async function openProject(p:Project){try{await saveProject(projectRef.current);setPlaying(false);setPreviewing(false);past.current=[];future.current=[];setHistoryRevision(n=>n+1);apply(p);setSceneId(p.scenes[0].id);setTime(0);setSelection([]);setPan({x:0,y:0});setZoom(1);}catch(e){notify('Could not save the current project before switching: '+(e as Error).message);}}
  async function importImages(files:FileList|File[]){
    setBusy(true);try{const items:SceneElement[]=[];for(const file of Array.from(files)){
      if(file.size>20*1024*1024)throw new Error('Each image must be smaller than 20 MB.');
      if(!['image/png','image/jpeg','image/webp','image/gif','image/svg+xml'].includes(file.type))throw new Error('Use SVG, PNG, JPEG, WebP or GIF files.');
      let vector:ReturnType<typeof parseVectorSvg>|undefined;
      if(file.type==='image/svg+xml')vector=parseVectorSvg(await file.text());
      const src=await readDataURL(file);decodeDataUrl(src,'image');const img=new Image();img.src=src;await img.decode();
      const width=Math.min(650,img.naturalWidth||400),height=width*(img.naturalHeight||400)/(img.naturalWidth||400);
      items.push(createElement(vector?.kind==='vector'?'vector':'image',{name:file.name,src,...(vector?.kind==='vector'?{paths:vector.paths}:{}),width,height,x:currentScene.camera.x-width/2,y:currentScene.camera.y-height/2,animation:{...defaultAnimation(),start:currentScene.elements.length?Math.max(...currentScene.elements.map(el=>el.animation.start+el.animation.draw))+0.5:0}}));
      if(vector?.kind==='image')notify(file.name+': image reveal used. '+vector.reason);
    }const next=structuredClone(projectRef.current);next.scenes.find(s=>s.id===sceneId)!.elements.push(...items);parseProject(next);edit(p=>p.scenes.find(s=>s.id===sceneId)!.elements.push(...items));select(items.map(e=>e.id));notify(items.length+' image'+(items.length>1?'s':'')+' added.');}catch(e){notify((e as Error).message);}finally{setBusy(false);if(imageInput.current)imageInput.current.value='';}
  }
  async function importFont(file:File){try{if(file.size>5*1024*1024)throw new Error('Fonts must be smaller than 5 MB.');const family=file.name.replace(/\.[^.]+$/,'').replace(/[^\p{L}\p{N} _-]/gu,'').slice(0,80)||'Custom Font';let src=await readDataURL(file);if(src.startsWith('data:;'))src=src.replace('data:;','data:application/octet-stream;');const p=structuredClone(projectRef.current);p.fonts=[...(p.fonts||[]).filter(f=>f.family!==family),{family,src}];parseProject(p);await loadFonts(p);edit(next=>{next.fonts=p.fonts;});notify(family+' is ready in the font menu.');}catch(e){notify((e as Error).message);}finally{if(fontInput.current)fontInput.current.value='';}}
  function snapshot(){const canvas=document.querySelector('.paper canvas') as HTMLCanvasElement|null;if(canvas)canvas.toBlob(blob=>{if(blob)downloadBlob(blob,project.title+'.png');});}
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{
      const typing=['INPUT','TEXTAREA','SELECT'].includes((e.target as HTMLElement).tagName)||(e.target as HTMLElement).isContentEditable;
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();if(e.shiftKey)portableProject(projectRef.current);else void saveProject(projectRef.current).then(()=>notify('Project saved on this computer.')).catch(err=>notify(err.message));return;}
      if(typing||modal)return;
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();}
      else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo();}
      else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'){e.preventDefault();duplicate();}
      else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='c'){clipboard.current=structuredClone(currentScene.elements.filter(el=>selection.includes(el.id)));}
      else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='v'&&clipboard.current.length){e.preventDefault();const copies=clipboard.current.map(el=>({...structuredClone(el),id:makeId(),x:el.x+40,y:el.y+40}));edit(p=>p.scenes.find(s=>s.id===sceneId)!.elements.push(...copies));select(copies.map(el=>el.id));}
      else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'){e.preventDefault();select(currentScene.elements.filter(el=>!el.hidden).map(el=>el.id));}
      else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();remove();}
      else if(e.key==='Escape'){setSelection([]);setPreviewing(false);setPlaying(false);setTool('select');}
      else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)&&selection.length){e.preventDefault();const d=e.shiftKey?10:1;edit(p=>p.scenes.find(s=>s.id===sceneId)!.elements.filter(el=>selection.includes(el.id)&&!el.locked).forEach(el=>{el.x+=(e.key==='ArrowRight'?d:e.key==='ArrowLeft'?-d:0);el.y+=(e.key==='ArrowDown'?d:e.key==='ArrowUp'?-d:0);}));}
      else if(e.key.toLowerCase()==='v')setTool('select');else if(e.key.toLowerCase()==='t'){setTool('text');setPreviewing(false);}else if(e.key.toLowerCase()==='h')setTool('pan');
      else if(e.code==='Enter'){e.preventDefault();play();}
    };window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
  },[project,selection,sceneId,modal,playing]);
  useEffect(()=>{const handler=(e:BeforeUnloadEvent)=>{if(saveStatus==='Saving…'||saveStatus==='Save failed'){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler);},[saveStatus]);
  const filteredAssets=(libraryTab==='recent'?recentAssets.flatMap(id=>assets.find(a=>a.id===id)||[]):assets).filter(a=>(category==='All'||a.category===category)&&(!search||(a.name+' '+a.category+' '+a.id).toLowerCase().includes(search.toLowerCase())));
  if(!ready)return <div className="loading-studio"><Logo/><LoaderCircle size={28} className="spin"/><p>Opening your story studio…</p></div>;
  return <div className="studio reference-environment" onDragOver={e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();}} onDrop={e=>{if(e.dataTransfer.files.length){e.preventDefault();void importImages(e.dataTransfer.files);}}}>
    <header className="app-header"><button className="brand-home" onClick={()=>setModal('projects')} title="Open projects"><Logo/></button><span className="header-divider"/><button className="project-menu" onClick={()=>setModal('projects')} title="Open projects"><FolderOpen size={16}/></button><div className="project-title"><input aria-label="Project title" value={project.title} onChange={e=>edit(p=>{p.title=e.target.value;})}/><span><i className={saveStatus==='Save failed'?'error-dot':'save-dot'}/>{saveStatus}</span></div><div className="header-history"><IconButton icon={Undo2} label="Undo (Ctrl+Z)" onClick={undo} disabled={!past.current.length}/><IconButton icon={Redo2} label="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!future.current.length}/></div><div className="header-right"><button className="header-projects secondary-button" onClick={()=>setModal('projects')}><FolderOpen size={16}/><span>My projects</span></button><button className="preview-button" onClick={play}>{playing?<Pause size={16}/>:<Play size={16}/>}<span>{playing?'Pause':'Preview'}</span></button><button className="primary-button export-button" onClick={()=>{setPlaying(false);setModal('export');}}><Download size={16}/><span>Export</span><ChevronDown size={14}/></button></div></header>
    {showGuide&&<EditorGuide onAdd={()=>{setPanel('library');setPanelVisible(true);setPreviewing(false);setPlaying(false);}} onAnimate={focusAnimation} onPreview={play} onDismiss={dismissGuide}/>}
    <main className={'studio-main'+(panel==='scenes'?' scene-panel':'')+(!panelVisible?' sidebar-collapsed':'')}>
      <nav className="tool-rail" aria-label="Creative tools">{([{id:'scenes',icon:LayoutTemplate,label:'Scenes'},{id:'library',icon:Images,label:'Illustrations'},{id:'text',icon:Type,label:'Text'},{id:'shapes',icon:Shapes,label:'Shapes'},{id:'uploads',icon:Upload,label:'Uploads'},{id:'audio',icon:Music2,label:'Audio'},{id:'templates',icon:LayoutTemplate,label:'Templates'},{id:'script',icon:Sparkles,label:'Script'},{id:'camera',icon:Camera,label:'Camera'}] as const).map(item=><button key={item.id} className={panel===item.id&&panelVisible?'active':''} onClick={()=>{setPanel(item.id);setPanelVisible(true);}} title={item.label}><item.icon size={21}/><span>{item.label}</span></button>)}<div className="rail-spacer"/><button onClick={()=>setModal('help')} title="Help and shortcuts"><HelpCircle size={21}/><span>Help</span></button></nav>
      {panelVisible&&<aside className="asset-panel"><div className="panel-heading"><h2>{{scenes:'Scenes',camera:'Cameras',library:'Images',text:'Add your words',shapes:'Shapes & charts',uploads:'Your uploads',audio:'Sound & voice',templates:'Start with a story',script:'Script studio'}[panel]}</h2><IconButton icon={PanelLeftClose} label="Collapse library" onClick={()=>setPanelVisible(false)}/></div><div className="asset-panel-scroll">
        {panel==='scenes'&&<SceneNavigator project={project} sceneId={sceneId} onScene={chooseScene} onAdd={addScene} onDuplicate={duplicateScene} onDelete={removeScene} edit={edit}/>}
        {(panel==='library'||panel==='uploads')&&<div className="reference-library-tabs" aria-label="Image sources"><button className={panel==='library'&&libraryTab==='all'?'active':''} onClick={()=>{setPanel('library');setLibraryTab('all');}}>Image library</button><button className={panel==='uploads'?'active':''} onClick={()=>setPanel('uploads')}>Your files</button><button className={panel==='library'&&libraryTab==='recent'?'active':''} onClick={()=>{setPanel('library');setLibraryTab('recent');setCategory('All');setSearch('');}}>Recently used</button></div>}
        {panel==='camera'&&<CameraPanel project={project} sceneId={sceneId} edit={edit} notify={notify} time={time} onSeek={value=>{setTime(value);setPlaying(false);setPreviewing(false);}} onView={()=>{setZoom(1);setPan({x:0,y:0});setPreviewing(false);setPlaying(false);}}/>}
        {panel==='library'&&<><div className="asset-search"><Search size={16}/><input aria-label="Search illustrations" placeholder="Find your next idea…" value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button title="Clear search" onClick={()=>setSearch('')}><X size={14}/></button>}</div><div className="category-pills">{['All',...assetCategories].map(c=><button className={category===c?'active':''} key={c} onClick={()=>setCategory(c)}>{c}</button>)}</div><div className="library-label"><span>{category==='All'?'The drawing room':category}</span><small>{filteredAssets.length} illustrations</small></div><div className="asset-grid">{filteredAssets.map(asset=><button className="asset-tile" key={asset.id} title={'Add '+asset.name} onClick={()=>addAsset(asset)}><AssetPreview asset={asset}/><span>{asset.name}</span><i><Plus size={12}/></i></button>)}</div>{!filteredAssets.length&&<p className="empty-panel">No drawings found. Try another word, or import your own.</p>}<p className="library-note">Original illustrations, ready to draw.<br/>Recolor and make them your own.</p></>}
        {panel==='text'&&<div className="text-presets"><p className="panel-description">Let your words do the drawing.</p><button onClick={()=>addText('heading')} className="heading-preset">Add a heading<span>A big idea starts here</span></button><button onClick={()=>addText('body')} className="body-preset">Add body text<span>Room for the details that matter.</span></button><button onClick={()=>addText('note')} className="note-preset">A handwritten note<span>For a personal touch.</span></button><div className="panel-section"><h3>Your fonts</h3><p className="muted">Kalam, DM Sans and Manrope are included locally. Bring a font of your own.</p><button className="secondary-button" onClick={()=>fontInput.current?.click()}><Upload size={15}/>Upload a font</button></div></div>}
        {panel==='shapes'&&<><p className="panel-description">A few simple shapes. Endless possibilities.</p><div className="shape-grid">{([{shape:'rectangle',icon:Square,label:'Rectangle'},{shape:'ellipse',icon:Circle,label:'Ellipse'},{shape:'line',icon:ArrowLeft,label:'Line'},{shape:'arrow',icon:ArrowUpRight,label:'Arrow'}] as const).map(s=><button key={s.shape} onClick={()=>addElement(createElement('shape',{shape:s.shape,name:s.label,width:400,height:s.shape==='line'?4:260,strokeWidth:5}))}><s.icon size={42} strokeWidth={1.2}/><span>{s.label}</span></button>)}</div><div className="panel-section"><h3>Tell it with data</h3><button className="chart-preset" onClick={()=>addElement(createElement('chart',{name:'Growth chart',chartValues:[25,45,35,70,95],width:600,height:400,color:'#42765e'}))}><BarChart3 size={46}/><span>Draw a bar chart<small>Customize values in properties</small></span></button></div></>}
        {panel==='uploads'&&<><button className="upload-area" onClick={()=>imageInput.current?.click()}><Upload size={28}/><strong>Bring your own inspiration</strong><span>Drop images here, or choose files</span><small>SVG, PNG, JPEG, WebP, GIF · up to 20 MB</small></button><div className="panel-section"><h3>In this project</h3><div className="uploaded-grid">{project.scenes.flatMap(s=>s.elements).filter(e=>(e.type==='image'||e.type==='vector')&&e.src).filter((e,i,all)=>all.findIndex(a=>a.src===e.src)===i).map(el=><button key={el.id} onClick={()=>addElement(createElement(el.type,{src:el.src,paths:el.paths?structuredClone(el.paths):undefined,name:el.name,width:el.width,height:el.height}))}><img src={el.src} alt={el.name}/><span>{el.name}</span></button>)}</div><p className="muted">Images travel with your project file. Imported GIFs use a still frame in animations.</p><button className="secondary-button" onClick={()=>fontInput.current?.click()}><Type size={15}/>Import custom font</button></div></>}
        {panel==='templates'&&<><p className="panel-description">A little inspiration goes a long way. Every part is editable.</p>{templates.map(t=><button className="sidebar-template" key={t.id} onClick={()=>{void openProject(makeTemplate(t.id));}}><div style={{background:t.color}}><AssetPreview asset={assets.find(a=>a.id===t.icon)||assets[0]}/></div><small>{t.category}</small><strong>{t.name}</strong><span>{t.description}</span></button>)}</>}
        {panel==='audio'&&<AudioPanel project={project} sceneId={sceneId} edit={edit} notify={notify} selectedId={audioId} time={time}/>}
        {panel==='script'&&<ScriptPanel project={project} sceneId={sceneId} edit={edit} notify={notify}/>}
      </div></aside>}
      <section className="editing-area"><div className="canvas-toolbar"><div className="canvas-tool-group"><IconButton icon={MousePointer2} label="Select (V)" active={tool==='select'} onClick={()=>{setTool('select');setPreviewing(false);}}/><IconButton icon={Hand} label="Pan (H)" active={tool==='pan'} onClick={()=>setTool('pan')}/><span className="divider"/><IconButton icon={Type} label="Add text (T)" onClick={()=>addText()}/><IconButton icon={Shapes} label="Add shape" onClick={()=>{setPanel('shapes');setPanelVisible(true);}}/></div><div className="canvas-mode"><button onClick={()=>{setSelection([]);setPanel('camera');setPanelVisible(true);}} title="Edit scene camera"><Camera size={14}/><span>Scene {project.scenes.findIndex(s=>s.id===sceneId)+1}</span></button><span className="mode-dot"/><select aria-label="Canvas mode" value={project.mode} onChange={e=>edit(p=>{p.mode=e.target.value as Project['mode'];})}><option value="scenes">Scenes</option><option value="roaming">Roaming canvas</option></select></div><div className="canvas-zoom"><IconButton icon={ZoomOut} label="Zoom canvas out" onClick={()=>setZoom(v=>Math.max(0.25,v-0.1))}/><span>{Math.round(zoom*100)}%</span><IconButton icon={ZoomIn} label="Zoom canvas in" onClick={()=>setZoom(v=>Math.min(3,v+0.1))}/><IconButton icon={Maximize} label="Fit canvas" onClick={()=>{setZoom(1);setPan({x:0,y:0});}}/></div></div>
        {previewing&&<div className="preview-status"><span><i/>{playing?'Preview playing':'Preview paused'} · {timecode(time)}</span><button onClick={()=>{setPreviewing(false);setPlaying(false);}}>Return to editing <X size={13}/></button></div>}
        <Stage showCameras={panel==='camera'&&panelVisible} project={project} sceneId={sceneId} selection={selection} onSelect={select} time={time} playing={playing} previewing={previewing} zoom={zoom} pan={pan} onPan={setPan} tool={tool} onTool={setTool} edit={edit} checkpoint={checkpoint} onError={notify} onEditText={focusText} onAddText={()=>addText()} onAddContent={()=>{setPanel('library');setPanelVisible(true);}}/>
      </section>
      <Inspector onCameras={()=>{setPanel('camera');setPanelVisible(true);}} project={project} sceneId={sceneId} selection={selection} edit={edit} onDuplicate={duplicate} onDelete={remove} onSelect={select} animationFocus={animationFocus} textFocus={textFocus}/>
    </main>
    <Timeline showSceneStrip={false} project={project} sceneId={sceneId} onScene={chooseScene} onAdd={addScene} onDuplicate={duplicateScene} onDelete={removeScene} selection={selection} onSelect={select} time={time} onSeek={seek} playing={playing} onPlay={play} edit={edit} checkpoint={checkpoint} onAudio={id=>{setAudioId(id);setPanel('audio');setPanelVisible(true);}}/>
    <input ref={imageInput} hidden type="file" multiple accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif" onChange={e=>{if(e.target.files)void importImages(e.target.files);}}/><input ref={fontInput} hidden type="file" accept=".ttf,.otf,.woff,.woff2" onChange={e=>{if(e.target.files?.[0])void importFont(e.target.files[0]);}}/>
    {modal==='projects'&&<ProjectsDialog current={project} onOpen={p=>{void openProject(p);}} onClose={()=>setModal(null)} notify={notify}/>}
    {modal==='export'&&<ExportDialog project={project} onClose={()=>setModal(null)} notify={notify}/>}
    {modal==='help'&&<Dialog title="Make something worth watching" onClose={()=>setModal(null)}><div className="help-content"><button className="secondary-button" onClick={()=>{setShowGuide(true);setModal(null);try{localStorage.removeItem('vibecraft-guide-dismissed');}catch{}}}>Show getting started guide</button><p>Add illustrations, text and shapes. Arrange them on the paper, then use the timeline or Animation properties to control when each one appears.</p><dl>{[['Select','V'],['Add text','T'],['Pan','H or Space + drag'],['Play / pause','Enter'],['Undo','Ctrl + Z'],['Redo','Ctrl + Shift + Z'],['Duplicate','Ctrl + D'],['Select all','Ctrl + A'],['Nudge','Arrow keys'],['Nudge 10 px','Shift + arrow'],['Save','Ctrl + S'],['Download project','Ctrl + Shift + S']].map(([label,key])=><div key={label}><dt>{label}</dt><dd>{key}</dd></div>)}</dl><div className="dialog-actions"><button className="secondary-button" onClick={()=>portableProject(project)}><FileJson size={15}/>Download project</button><button className="secondary-button" onClick={snapshot}><Download size={15}/>Canvas PNG</button></div><p className="muted">Vibecraft is an original local animation editor. Projects stay on this computer. The installed library contains {assets.length} original drawings. Native voices and local AI depend on available services.</p></div></Dialog>}
    {(toast||busy)&&<div className={'toast'+(busy?' busy':'')} role="status">{busy?<LoaderCircle className="spin" size={17}/>:<Check size={17}/>}<span>{busy?'Preparing your images…':toast}</span><button title="Dismiss notification" onClick={()=>setToast('')}><X size={15}/></button></div>}
  </div>;
}
