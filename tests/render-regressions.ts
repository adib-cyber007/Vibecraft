import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir,writeFile } from 'node:fs/promises';
import { resolveBrowserExecutable } from '../scripts/browser-runtime.mjs';
import { createApplication } from '../server/index';
await mkdir('artifacts/fixes-0.1.1',{recursive:true});
const app=await createApplication({port:4518});await app.listen();const browser=await chromium.launch({headless:true,executablePath:resolveBrowserExecutable().executablePath});
try{const page=await browser.newPage();await page.goto('http://127.0.0.1:4518/?render=1',{waitUntil:'networkidle'});await page.evaluate('globalThis.__name=(target)=>target');
const result=await page.evaluate(async()=>{
 const{renderProject}=await import('/src/engine/render.ts' as string);const{createElement,createScene,createProject}=await import('/src/model.ts' as string);const{parseProject}=await import('/src/validation.ts' as string);
 const canvas=document.createElement('canvas');canvas.width=1920;canvas.height=1080;const ctx=canvas.getContext('2d')!;const options={width:1920,height:1080,images:new Map()};
 const rectangle=()=>createElement('shape',{shape:'rectangle',fill:'#000000',color:'#000000',x:860,y:440,width:200,height:200,animation:{start:0,draw:0,hold:1,exit:0,entrance:'none',exitStyle:'none',emphasis:'none',hand:'none',handColor:'#deb38e'}});
 const p=createProject({scenes:[createScene(1920,1080,{duration:1,transition:'cut',elements:[rectangle()]}),createScene(1920,1080,{duration:1,transition:'fade',transitionDuration:1,elements:[rectangle()]})]});
 renderProject(ctx,p,0.5,options);const before=Array.from(ctx.getImageData(960,540,1,1).data);renderProject(ctx,p,1.5,options);const middle=Array.from(ctx.getImageData(960,540,1,1).data);
 const benchmark=[];for(const count of [1,10,25]){const paths=Array.from({length:40},(_,j)=>({d:'M0 '+j+' '+Array.from({length:100},(_,i)=>'L'+i+' '+((i*17+j*3)%100)).join(' ')}));const elements=Array.from({length:count},(_,i)=>createElement('vector',{x:(i%5)*250,y:Math.floor(i/5)*180,width:220,height:150,paths}));const project=createProject({scenes:[createScene(1920,1080,{duration:8,elements})]});parseProject(project);const staticOptions={...options,preview:true};renderProject(ctx,project,1,staticOptions);const samples=[];for(let i=0;i<7;i++){const start=performance.now();renderProject(ctx,project,1,staticOptions);samples.push(performance.now()-start);}samples.sort((a,b)=>a-b);benchmark.push({count,pathsPerElement:40,segmentsPerPath:100,medianMs:samples[3],p95Ms:samples[6]});}
 return {fade:{identicalScenes:true,beforePixel:before,midpointPixel:middle,expectedMidpointPixel:before},complexVectors:benchmark,limit:'CPU-only headless timings, not actual interactive FPS'};
});assert.deepEqual(result.fade.midpointPixel,result.fade.expectedMidpointPixel);console.log(JSON.stringify(result));await writeFile('artifacts/fixes-0.1.1/render-report.json',JSON.stringify(result,null,2));}finally{await browser.close();await app.close();}
