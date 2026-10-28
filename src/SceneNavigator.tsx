import { Plus, Copy, Trash2, GripVertical } from 'lucide-react';
import type { Project } from './model';
import type { Edit } from './Stage';
import { SceneThumb, timecode } from './Timeline';
import { sceneDuration } from './engine/timeline';

interface Props { project:Project;sceneId:string;onScene:(id:string)=>void;onAdd:()=>void;onDuplicate:()=>void;onDelete:()=>void;edit:Edit }
export function SceneNavigator({project,sceneId,onScene,onAdd,onDuplicate,onDelete,edit}:Props){
  const moveScene=(id:string,offset:number)=>edit(p=>{const from=p.scenes.findIndex(scene=>scene.id===id),to=from+offset;if(from>=0&&to>=0&&to<p.scenes.length)p.scenes.splice(to,0,p.scenes.splice(from,1)[0]);});
  return <div className="scene-navigator">
    <div className="scene-nav-intro"><span>{project.scenes.length} {project.scenes.length===1?'scene':'scenes'}</span><button onClick={onAdd} title="Add scene"><Plus size={16}/>Add scene</button></div>
    <div className="scene-cards">{project.scenes.map((scene,index)=><button key={scene.id} className={'scene-card '+(scene.id===sceneId?'active':'')} data-scene-id={scene.id} draggable onDragStart={event=>event.dataTransfer.setData('scene',scene.id)} onDragOver={event=>event.preventDefault()} onDrop={event=>{const id=event.dataTransfer.getData('scene');if(id&&id!==scene.id)edit(p=>{const from=p.scenes.findIndex(s=>s.id===id),to=p.scenes.findIndex(s=>s.id===scene.id);if(from>=0&&to>=0)p.scenes.splice(to,0,p.scenes.splice(from,1)[0]);});}} onKeyDown={event=>{if(event.altKey&&(event.key==='ArrowUp'||event.key==='ArrowDown')){event.preventDefault();moveScene(scene.id,event.key==='ArrowUp'?-1:1);}}} onClick={()=>onScene(scene.id)} aria-label={'Open scene '+(index+1)+': '+scene.name} aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown" aria-current={scene.id===sceneId?'true':undefined}>
      <div className="scene-preview"><SceneThumb project={project} sceneId={scene.id}/><span className="scene-number">Scene {index+1}</span></div>
      <span className="scene-card-label">{scene.name}</span><span className="scene-nav-duration">{timecode(sceneDuration(scene))}<GripVertical size={12}/></span>
    </button>)}</div>
    <div className="scene-actions"><button title="Duplicate scene" onClick={onDuplicate}><Copy size={16}/><span>Duplicate</span></button><button title="Delete scene" onClick={onDelete} disabled={project.scenes.length===1}><Trash2 size={16}/><span>Delete</span></button></div>
    <p className="scene-nav-tip">Drag scenes to reorder your story. With a scene focused, use Alt + ↑ or ↓.</p>
  </div>;
}
