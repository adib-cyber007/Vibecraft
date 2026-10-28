import { useEffect, useRef, useState } from 'react';
import { Plus, Upload, Download, FileJson, Check, Copy, Trash2, Film, LoaderCircle } from 'lucide-react';
import type { Project } from './model';
import { makeId } from './model';
import { listProjects, deleteProject, portableProject } from './storage';
import { parseProject } from './validation';
import { templates, makeTemplate } from './templates';
import { SceneThumb, timecode } from './Timeline';
import { projectDuration } from './engine/timeline';
import { Dialog, Field } from './ui';
import { assets } from './assets';

export async function api<T>(url:string,body?:unknown):Promise<T> {
  const response=await fetch(url,body===undefined?undefined:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||'The request failed.');
  return data;
}
export function ProjectsDialog({current,onOpen,onClose,notify}:{current:Project;onOpen:(project:Project)=>void;onClose:()=>void;notify:(message:string)=>void}){
  const [projects,setProjects]=useState<Project[]>([]),[section,setSection]=useState<'projects'|'templates'>('projects');
  const [ratio,setRatio]=useState('landscape'),file=useRef<HTMLInputElement>(null);
  const reload=()=>listProjects().then(setProjects).catch(e=>notify(e.message));useEffect(()=>{reload();},[]);
  const create=(id:string)=>{const p=makeTemplate(id);if(ratio!=='landscape'){p.width=1080;p.height=ratio==='portrait'?1920:1080;for(const s of p.scenes){s.camera={x:p.width/2,y:p.height/2,zoom:1};if(id!=='blank'){for(const el of s.elements){el.x=el.x*1080/1920;el.width*=1080/1920;if(el.fontSize)el.fontSize*=0.7;el.y*=p.height/1080;}}}}onOpen(p);onClose();};
  async function importProject(file:File){
    try{if(file.size>60*1024*1024)throw new Error('Project files must be smaller than 60 MB.');const p=parseProject(JSON.parse(await file.text()));p.id=makeId();p.updatedAt=new Date().toISOString();onOpen(p);onClose();}catch(e){notify('Could not open project: '+(e as Error).message);}
  }
  return <Dialog title="Your story studio" wide onClose={onClose}><div className="project-dialog-intro"><p>Good ideas deserve to be seen.<span>Pick up a story or start something new.</span></p><button className="secondary-button" onClick={()=>file.current?.click()}><Upload size={16}/>Open project file</button><input ref={file} hidden type="file" accept=".json,.vibecraft" onChange={e=>{if(e.target.files?.[0])void importProject(e.target.files[0]);}}/></div>
    <div className="project-dialog-tabs"><button className={section==='projects'?'active':''} onClick={()=>setSection('projects')}>My projects</button><button className={section==='templates'?'active':''} onClick={()=>setSection('templates')}>Original templates</button><select aria-label="New project aspect ratio" value={ratio} onChange={e=>setRatio(e.target.value)}><option value="landscape">Landscape 16:9</option><option value="square">Square 1:1</option><option value="portrait">Portrait 9:16</option></select></div>
    <div className="project-grid"><button className="new-project-card" onClick={()=>create('blank')}><span><Plus size={30}/></span><strong>Start from a blank canvas</strong><small>Your idea. Your way.</small></button>
      {section==='projects'?projects.map(p=><article className="project-card" key={p.id}><button className="project-card-thumb" onClick={()=>{onOpen(p);onClose();}}><SceneThumb project={p} sceneId={p.scenes[0].id}/></button><div className="project-card-info"><button onClick={()=>{onOpen(p);onClose();}}><strong>{p.title}</strong><small>{p.scenes.length} scenes · {timecode(projectDuration(p))}</small></button><button title="Download portable project" onClick={()=>portableProject(p)}><Download size={15}/></button><button title="Delete saved project" onClick={async()=>{if(p.id===current.id){notify('Open a different project before deleting the current one.');return;}await deleteProject(p.id);reload();}}><Trash2 size={15}/></button></div></article>):templates.map(t=><button className="template-card" key={t.id} onClick={()=>create(t.id)}><div style={{background:t.color}}><svg viewBox="0 0 100 100">{(assets.find(a=>a.id===t.icon)||assets[0]).paths.map((p,i)=><path key={i} d={p.d} fill="none" stroke="#365448" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>)}</svg></div><small>{t.category}</small><strong>{t.name}</strong><p>{t.description}</p></button>)}
    </div><div className="dialog-footnote">Projects are saved on this computer. Download a project file to back up or move your work.</div>
  </Dialog>;
}
interface ExportJob {id:string;status:string;progress:number;error?:string;downloadUrl?:string;width:number;height:number;duration:number;format:'mp4'|'webm'|'gif'}
export function ExportDialog({project,onClose,notify}:{project:Project;onClose:()=>void;notify:(message:string)=>void}){
  const [format,setFormat]=useState('mp4'),[resolution,setResolution]=useState(1920),[fps,setFps]=useState(24),[job,setJob]=useState<ExportJob|null>(null),[error,setError]=useState(''),[starting,setStarting]=useState(false),[healthy,setHealthy]=useState<boolean|null>(null);
  const running=job&&['queued','rendering'].includes(job.status);
  const jobKey='vibecraft-export-'+project.id;
  useEffect(()=>{const id=sessionStorage.getItem(jobKey);if(id)api<ExportJob>('/api/exports/'+id).then(value=>{setJob(value);setFormat(value.format);}).catch(()=>sessionStorage.removeItem(jobKey));},[jobKey]);
  useEffect(()=>{api<{ffmpeg:boolean}>('/api/health').then(r=>setHealthy(r.ffmpeg)).catch(e=>setError(e.message));},[]);
  useEffect(()=>{if(!running||!job)return;const id=setInterval(()=>{api<ExportJob>('/api/exports/'+job.id).then(setJob).catch(e=>setError(e.message));},700);return()=>clearInterval(id);},[running,job?.id]);
  async function start(){setError('');setStarting(true);try{parseProject(project);const value=await api<ExportJob>('/api/exports',{project,format,width:resolution,fps});sessionStorage.setItem(jobKey,value.id);setJob(value);}catch(e){setError((e as Error).message);}finally{setStarting(false);}}
  async function cancel(){if(!job)return;try{await api('/api/exports/'+job.id+'/cancel',{});setJob({...job,status:'cancelled'});}catch(e){setError((e as Error).message);}}
  return <Dialog title="Give your story an audience" onClose={onClose}><div className="export-dialog"><div className="export-art"><Film size={32}/><div><strong>{project.title}</strong><span>{project.scenes.length} scenes · {timecode(projectDuration(project))} · {project.width===project.height?'Square':project.width>project.height?'Landscape':'Portrait'}</span></div></div>
    <div className="field-row"><Field label="File format"><select disabled={!!running} value={format} onChange={e=>setFormat(e.target.value)}><option value="mp4">MP4 video</option><option value="webm">WebM video</option><option value="gif">Animated GIF (no audio)</option></select></Field><Field label="Resolution"><select disabled={!!running} value={resolution} onChange={e=>setResolution(Number(e.target.value))}><option value={1920}>Full HD · 1080p</option><option value={1280}>HD · 720p</option><option value={854}>Preview · 480p</option></select></Field></div><Field label="Frame rate"><select disabled={!!running} value={fps} onChange={e=>setFps(Number(e.target.value))}><option value={24}>24 fps · cinematic</option><option value={30}>30 fps · smooth</option></select></Field>
    <p className="muted">Your drawings, camera motion and audio are rendered together on this computer. Export continues if you close this dialog.</p>
    {healthy===false&&<p className="inline-error">FFmpeg is unavailable. Install FFmpeg and add it to PATH, then restart the studio.</p>}
    {(error||job?.error)&&<p className="inline-error" role="alert">{error||job?.error}</p>}
    {job&&<div className="export-progress"><div><span>{job.status==='complete'?'Your video is ready':job.status==='cancelled'?'Export cancelled':job.status==='failed'?'Export failed':'Drawing your story…'}</span><strong>{Math.round(job.progress*100)}%</strong></div><progress value={job.progress} max={1}/>{job.width>0&&<small>{job.width} × {job.height} · {fps} fps</small>}</div>}
    <div className="dialog-actions"><button className="secondary-button" onClick={()=>portableProject(project)}><FileJson size={16}/>Project file</button>{running?<button className="secondary-button" onClick={cancel}>Cancel export</button>:job?.status==='complete'?<a className="primary-button" href={job.downloadUrl||'/api/exports/'+job.id+'/file'} download><Download size={16}/>Download {format.toUpperCase()}</a>:<button className="primary-button" onClick={start} disabled={starting||healthy===false}>{starting?<LoaderCircle className="spin" size={16}/>:<Download size={16}/>}Export video</button>}</div>
  </div></Dialog>;
}
