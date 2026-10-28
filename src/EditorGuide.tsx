import { Images, WandSparkles, Play, X, ChevronRight } from 'lucide-react';
export function EditorGuide({onAdd,onAnimate,onPreview,onDismiss}:{onAdd:()=>void;onAnimate:()=>void;onPreview:()=>void;onDismiss:()=>void}){
  return <section className="editor-guide" aria-label="Getting started">
    <div><strong>Your story, step by step</strong><span>Everything on the canvas is yours to change.</span></div>
    <ol><li><button onClick={onAdd}><span>1</span><Images size={16}/>Add your content</button></li><ChevronRight size={14} aria-hidden="true"/><li><button onClick={onAnimate}><span>2</span><WandSparkles size={16}/>Set the animation</button></li><ChevronRight size={14} aria-hidden="true"/><li><button onClick={onPreview}><span>3</span><Play size={16}/>Preview your story</button></li></ol>
    <button className="guide-dismiss" aria-label="Dismiss getting started guide" onClick={onDismiss}><X size={16}/></button>
  </section>;
}
