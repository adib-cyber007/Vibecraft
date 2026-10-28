import { createRoot } from 'react-dom/client';
import { lazy, Suspense } from 'react';
import { prepareImages, renderProject } from './engine/render';
import { loadFonts } from './storage';
import { parseProject } from './validation';
import type { Project } from './model';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/kalam/400.css';
import '@fontsource/kalam/700.css';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import './style.css';
const App=lazy(()=>import('./App'));
const Landing=lazy(()=>import('./Landing'));
const InformationPage=lazy(()=>import('./Landing').then(module=>({default:module.InformationPage})));

declare global { interface Window { vibecraftRender?: { setup(project:Project,width:number,height:number):Promise<void>;frame(time:number):Promise<string> }; } }
if(new URLSearchParams(location.search).has('render')){
  const canvas=document.createElement('canvas');document.body.replaceChildren(canvas);
  let project:Project,images=new Map<string,CanvasImageSource>();
  window.vibecraftRender={
    async setup(input,width,height){project=parseProject(input);canvas.width=width;canvas.height=height;await loadFonts(project);images=await prepareImages(project);},
    async frame(time){const ctx=canvas.getContext('2d')!;renderProject(ctx,project,time,{width:canvas.width,height:canvas.height,images});return canvas.toDataURL('image/png').split(',')[1];},
  };
}else {
  const route=location.pathname.replace(/\/+$/,'')||'/';
  const page=route==='/studio'?<App/>:route==='/'?<Landing/>:<InformationPage kind={route==='/privacy'?'privacy':route==='/terms'?'terms':'404'}/>;
  createRoot(document.getElementById('root')!).render(<Suspense fallback={<div className="route-loading" aria-label="Loading Vibecraft"><span/><span/><span/></div>}>{page}</Suspense>);
}
