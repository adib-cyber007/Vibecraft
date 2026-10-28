import { useEffect, useRef, useState } from 'react';
import { ArrowRight } from '@phosphor-icons/react/dist/csr/ArrowRight';
import { Play } from '@phosphor-icons/react/dist/csr/Play';
import { Pause } from '@phosphor-icons/react/dist/csr/Pause';
import { CursorClick } from '@phosphor-icons/react/dist/csr/CursorClick';
import { SlidersHorizontal } from '@phosphor-icons/react/dist/csr/SlidersHorizontal';
import { DownloadSimple } from '@phosphor-icons/react/dist/csr/DownloadSimple';
import { Plus } from '@phosphor-icons/react/dist/csr/Plus';
import { Minus } from '@phosphor-icons/react/dist/csr/Minus';
import { ArrowUpRight } from '@phosphor-icons/react/dist/csr/ArrowUpRight';
import { renderProject, prepareImages } from './engine/render';
import { loadFonts } from './storage';
import { makeTemplate } from './templates';
import { sceneDuration, sceneStart } from './engine/timeline';
import './landing.css';

const faq=[
  ['Is Vibecraft free?','Yes. This local version is free to use, with no account, subscription or payment required to open the editor.'],
  ['Where are my projects saved?','Your projects are saved in this browser on this computer. Download an editable project file whenever you want a backup or need to move your work. Clearing browser storage can remove local projects.'],
  ['Can I bring my own artwork?','Import SVG, PNG, JPEG, WebP and GIF files. Supported SVG geometry can draw along its paths. Other images use a reveal animation. Imported GIFs currently use a still frame.'],
  ['What can I export?','Export MP4 or WebM videos, animated GIFs and editable project files. Video exports can include your drawings, camera movements and mixed audio. FFmpeg needs to be installed on this computer.'],
  ['Can I add music and a voiceover?','Upload audio, record your microphone, add the original included soundtrack or generate narration with an installed Windows voice. Optional AI storyboards use a locally installed Ollama model.'],
  ['Can I create on my phone?','You can explore this page on any screen. The editor works best in a desktop browser, with enough room for the canvas, properties and timeline.'],
];
function Mark(){return <span className="lp-brand"><svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M7 7 23 10 26 25 11 22 7 7Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="m7 7 9 9m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0Zm-2 6 10-10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg><span>vibecraft.</span></span>;}
function OpenEditor({small=false}:{small?:boolean}){return <a className={'lp-cta'+(small?' small':'')} href="/studio">Open the editor<ArrowRight size={16} weight="bold"/></a>;}
function Reveal({children,className='',id}:{children:React.ReactNode;className?:string;id?:string}){
  const ref=useRef<HTMLElement>(null);
  useEffect(()=>{const element=ref.current;if(!element)return;const observer=new IntersectionObserver(entries=>{if(entries[0].isIntersecting){element.classList.add('is-visible');observer.disconnect();}},{threshold:0.12});observer.observe(element);return()=>observer.disconnect();},[]);
  return <section id={id} ref={ref} className={'lp-reveal '+className}>{children}</section>;
}
export function LiveDrawing({template='idea',scene=0,compact=false}:{template?:string;scene?:number;compact?:boolean}){
  const canvas=useRef<HTMLCanvasElement>(null),container=useRef<HTMLDivElement>(null),[playing,setPlaying]=useState(false),[time,setTime]=useState(6.8),[loaded,setLoaded]=useState(false),[error,setError]=useState('');
  const [initialProject]=useState(()=>makeTemplate(template));
  const state=useRef({project:initialProject,images:new Map<string,CanvasImageSource>(),time:6.8,visible:true});
  const reduced=useRef(false);
  useEffect(()=>{
    let active=true;const p=makeTemplate(template);state.current.project=p;state.current.time=compact?7:3.2;
    reduced.current=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    Promise.all([loadFonts(p),prepareImages(p)]).then(([,images])=>{if(active){state.current.images=images;setLoaded(true);setTime(state.current.time);if(!compact&&!reduced.current)setPlaying(true);}}).catch(e=>setError(e.message));
    const observer=new IntersectionObserver(entries=>{state.current.visible=entries[0].isIntersecting;},{threshold:0.1});if(container.current)observer.observe(container.current);
    return()=>{active=false;observer.disconnect();};
  },[template]);
  function draw(t:number){const ctx=canvas.current?.getContext('2d');if(ctx){const p=state.current.project;renderProject(ctx,p,sceneStart(p,p.scenes[scene].id)+t,{width:960,height:540,images:state.current.images,preview:compact});}}
  useEffect(()=>{if(loaded)draw(time);},[loaded,time,scene]);
  useEffect(()=>{
    if(!playing||!loaded)return;let frame=0,previous=performance.now(),lastUpdate=0;
    const tick=(now:number)=>{if(state.current.visible){const duration=sceneDuration(state.current.project.scenes[scene])+0.6;state.current.time=(state.current.time+Math.min((now-previous)/1000,0.1))%duration;draw(Math.min(state.current.time,duration-0.6));if(now-lastUpdate>120){setTime(state.current.time);lastUpdate=now;}}previous=now;frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
  },[playing,loaded,scene]);
  return <div className={'lp-demo'+(compact?' compact':'')} ref={container}>
    {!compact&&<div className="lp-demo-top"><div className="lp-window-dots"><i/><i/><i/></div><span>From spark to story</span><span className="lp-preview-label"><i/>Live rendering preview</span></div>}
    <div className="lp-demo-paper"><canvas ref={canvas} width={960} height={540} role="img" aria-label="A real Vibecraft animation showing an idea being drawn with a pen"/>{!loaded&&!error&&<div className="lp-demo-loading"><div/><span>Preparing your preview</span></div>}{error&&<p className="lp-demo-error">Preview could not load. You can still open the editor.</p>}</div>
    {!compact&&<div className="lp-demo-bottom"><button aria-label={playing?'Pause drawing preview':'Play drawing preview'} onClick={()=>setPlaying(v=>!v)} disabled={!loaded}>{playing?<Pause size={15} weight="fill"/>:<Play size={15} weight="fill"/>}</button><span>{String(Math.floor(time)).padStart(2,'0')}s</span><div className="lp-demo-progress"><i style={{transform:'scaleX('+Math.min(1,time/9)+')'}}/></div><span>Drawn with Vibecraft</span><a href="/studio" aria-label="Open this animation in the editor"><ArrowUpRight size={18}/></a></div>}
  </div>;
}
function Tagline(){
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{const words=ref.current?.querySelectorAll('[data-word]');if(!words)return;const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('word-active');observer.unobserve(entry.target);}}),{rootMargin:'0px 0px -25% 0px',threshold:1});words.forEach(word=>observer.observe(word));return()=>observer.disconnect();},[]);
  return <Reveal className="lp-tagline"><div ref={ref}><h2>{['A little less explaining.','A lot more understanding.'].map((line,i)=><span className="lp-tagline-line" key={line}>{line.split(' ').map((word,j)=><span key={j} data-word style={{transitionDelay:(j+i*4)*65+'ms'}}>{word} </span>)}</span>)}</h2></div><p>The best stories do more than tell. <br/>They help people see.</p></Reveal>;
}
export default function Landing(){
  const [menu,setMenu]=useState(false),[openFaq,setOpenFaq]=useState<number|null>(null);
  useEffect(()=>{document.title='Vibecraft — Make your ideas worth watching';document.body.classList.add('landing-body');return()=>document.body.classList.remove('landing-body');},[]);
  useEffect(()=>{document.body.style.overflow=menu?'hidden':'';return()=>{document.body.style.overflow='';};},[menu]);
  useEffect(()=>{
    if(!menu)return;
    const previous=document.activeElement as HTMLElement|null;
    const links=Array.from(document.querySelectorAll<HTMLElement>('.lp-mobile-menu a'));
    links[0]?.focus();
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){setMenu(false);return;}
      if(event.key==='Tab'&&links.length){const first=links[0],last=links[links.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
    };
    window.addEventListener('keydown',key);
    return()=>{window.removeEventListener('keydown',key);previous?.focus();};
  },[menu]);
  return <div className="landing-page"><a className="lp-skip" href="#main">Skip to content</a>
    <nav className="lp-nav" aria-label="Main navigation"><a href="/" aria-label="Vibecraft home" aria-current="page"><Mark/></a><div className="lp-nav-links"><a href="#studio">The studio</a><a href="#workflow">How it works</a><a href="#questions">Questions</a></div><OpenEditor small/><button className={'lp-menu-toggle'+(menu?' open':'')} aria-label={menu?'Close menu':'Open menu'} aria-expanded={menu} onClick={()=>setMenu(v=>!v)}><span/><span/></button></nav>
    {menu&&<div className="lp-mobile-menu" role="dialog" aria-label="Navigation menu" aria-modal="true"><div>{[['The studio','#studio'],['How it works','#workflow'],['Questions','#questions']].map(([text,link],i)=><a key={link} href={link} style={{animationDelay:i*60+'ms'}} onClick={()=>setMenu(false)}>{text}</a>)}<OpenEditor/></div></div>}
    <main id="main"><section className="lp-hero"><div className="lp-hero-copy"><span className="lp-eyebrow"><i/>A whiteboard studio for creators</span><h1>Make your ideas <br/>worth watching.</h1><p>A whiteboard animation studio for creators. Draw a story, find your rhythm, and export a video that feels like you.</p><OpenEditor/><span className="lp-proof">Free to use locally. No account. No credit card.</span></div><div className="lp-hero-demo"><LiveDrawing/></div><div className="lp-hero-caption"><span>Your next idea, brought to life.</span><span>Draw. Pace. Make it yours.</span></div></section>
      <Reveal className="lp-benefits"><div className="lp-section-intro"><span className="lp-eyebrow">From a thought to a story</span><h2>Less getting started. <br/>More creating.</h2></div><div className="lp-benefit-grid">{[{icon:CursorClick,title:'Start with a spark.',copy:'Choose an original drawing or bring your own images. Arrange your ideas on a canvas that gives them room to breathe.'},{icon:SlidersHorizontal,title:'Keep the creative control.',copy:'Set the pace. Choose the drawing hand. Shape the camera and sound. Every part of your story stays yours to change.'},{icon:DownloadSimple,title:'Take your story with you.',copy:'Export a video you can share and keep an editable project on your computer. Come back whenever the next idea arrives.'}].map(item=><article key={item.title}><span className="lp-benefit-icon"><item.icon size={24} weight="regular"/></span><h3>{item.title}</h3><p>{item.copy}</p></article>)}</div></Reveal>
      <Reveal id="studio" className="lp-studio-section"><div className="lp-section-split"><div><span className="lp-eyebrow">Meet your new drawing room</span><h2>A blank canvas. <br/>A clear path forward.</h2></div><p>Drawings, words, timing and sound, all in one place. Simple enough to explore. Precise enough to make it feel right.</p></div><div className="lp-editor-capture"><img src="/images/editor-preview.png" width="1600" height="1000" loading="lazy" alt="The real Vibecraft editor with original illustrations, a whiteboard canvas, scene controls and a multitrack animation timeline"/></div><div className="lp-studio-notes"><span>Original illustration library</span><span>Scenes and camera control</span><span>Audio and video export</span></div></Reveal>
      <Tagline/>
      <Reveal id="workflow" className="lp-workflow"><div className="lp-section-intro"><span className="lp-eyebrow">Your story, in motion</span><h2>Three steps. <br/>Room for every idea.</h2></div><div className="lp-step-grid">{[['01','Set the scene.','Start with a blank canvas or pick an original editable template. Bring your words, drawings and point of view.'],['02','Find your rhythm.','Arrange the pieces, tune the timing and add your sound. Preview as often as you need.'],['03','Make it yours.','Give it one last look, export your video and keep the project for whatever comes next.']].map(([number,title,copy])=><article key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></Reveal>
      <Reveal className="lp-templates"><div className="lp-section-split"><div><span className="lp-eyebrow">A little inspiration helps</span><h2>Your starting point. <br/>Never a limit.</h2></div><p>Original templates from the working studio. Every drawing, word and moment can become your own.</p></div><div className="lp-template-grid">{[{id:'idea',scene:0,name:'From spark to story',label:'For your next big idea'},{id:'lesson',scene:1,name:'Make learning stick',label:'For the things worth explaining'},{id:'business',scene:2,name:'A better way forward',label:'For the next chapter'}].map(item=><a href="/studio" key={item.id} className="lp-template"><LiveDrawing template={item.id} scene={item.scene} compact/><div><span><strong>{item.name}</strong><small>{item.label}</small></span><ArrowUpRight size={20}/></div></a>)}</div></Reveal>
      <Reveal id="questions" className="lp-faq"><div className="lp-section-intro"><span className="lp-eyebrow">A few things, explained</span><h2>Before your first story.</h2></div><div className="lp-faq-list">{faq.map(([question,answer],i)=><article key={question} className={openFaq===i?'open':''}><h3><button aria-expanded={openFaq===i} aria-controls={'answer-'+i} onClick={()=>setOpenFaq(openFaq===i?null:i)}>{question}{openFaq===i?<Minus size={20}/>:<Plus size={20}/>}</button></h3><div id={'answer-'+i} hidden={openFaq!==i}><p>{answer}</p></div></article>)}</div></Reveal>
      <Reveal className="lp-final"><span className="lp-eyebrow">The next story is yours</span><h2>Start with an idea. <br/>See where it takes you.</h2><p>No account. No blank page pressure. <br/>Just a little room to create.</p><OpenEditor/></Reveal>
    </main><footer className="lp-footer"><a href="/" aria-label="Vibecraft home"><Mark/></a><p>A local studio for ideas worth sharing.</p><div><a href="/privacy">Privacy</a><a href="/terms">Terms</a><span>Vibecraft, 2026</span></div></footer>
  </div>;
}

export function InformationPage({kind}:{kind:'privacy'|'terms'|'404'}){
  useEffect(()=>{document.body.classList.add('landing-body');document.title=(kind==='404'?'Page not found':kind==='privacy'?'Privacy':'Terms')+' — Vibecraft';return()=>document.body.classList.remove('landing-body');},[kind]);
  return <div className="landing-page lp-information"><nav><a href="/"><Mark/></a><a href="/">Back to Vibecraft<ArrowRight size={16}/></a></nav><main>
    <span className="lp-eyebrow">{kind==='404'?'A small detour':'Local preview · 26 October 2026'}</span><h1>{kind==='privacy'?'Your ideas stay yours.':kind==='terms'?'A few clear terms.':'This page is still a blank canvas.'}</h1>
    {kind==='privacy'?<><h2>Local project storage</h2><p>Vibecraft stores projects and embedded media in this browser on this computer. Download project files to keep backups. Clearing browser storage removes locally saved work.</p><h2>Rendering and optional services</h2><p>The local server renders exports and stores temporary output files under this project’s .runtime folder. It does not automatically upload your projects. Windows narration runs on this PC. Optional AI storyboard requests go to your local Ollama service.</p><h2>No analytics or advertising</h2><p>This local preview includes no advertising, account system, analytics service or tracking cookies. No personal information is collected through a signup form.</p><h2>Your imported media</h2><p>Images, fonts and audio you add remain embedded in local project data. Exported videos and project files contain the content you choose to include.</p></>:kind==='terms'?<><h2>Free local use</h2><p>This version is a free local tool for creating whiteboard animations. It requires no account or payment. There is no subscription to cancel and no purchase or refund process.</p><h2>Your content</h2><p>Use artwork, fonts, audio and text you have permission to use. You keep responsibility for the content you import and share. The included drawings and procedural soundtrack are original to this project.</p><h2>Availability and backups</h2><p>This is a local review build. Features may change. Keep project file backups and review exported videos before sharing them. Native voices, video export and optional local AI depend on the software available on your computer.</p><h2>Independent implementation</h2><p>Vibecraft is an independent animation editor. It is not affiliated with VideoScribe or Sparkol and does not include their licensed asset collections or hosted services.</p></>:<p>There is no page at this address. Your studio is just one click away.</p>}
    <OpenEditor/><a className="lp-back-link" href="/">Back to the landing page</a></main></div>;
}
