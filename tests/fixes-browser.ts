import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir,writeFile } from 'node:fs/promises';
import { resolveBrowserExecutable } from '../scripts/browser-runtime.mjs';
import { createApplication } from '../server/index';
import { createElement,createProject,createScene,makeId } from '../src/model';
import { parseProject } from '../src/validation';
const out='artifacts/fixes-0.1.1',report:any={date:new Date().toISOString(),checks:[]};
await mkdir(out,{recursive:true});
const app=await createApplication({port:4518});await app.listen();
const browser=await chromium.launch({headless:true,executablePath:resolveBrowserExecutable().executablePath});
const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});const page=await context.newPage();
page.on('pageerror',error=>{(report.pageErrors??=[]).push(error.message);});
await page.addInitScript(()=>{
 const target=window as any;target.audit={audioConstructions:0,imageDecodes:0,clears:0};
 const AudioOriginal=window.Audio;window.Audio=new Proxy(AudioOriginal,{construct(ctor,args){target.audit.audioConstructions++;return Reflect.construct(ctor,args);}});
 const decode=HTMLImageElement.prototype.decode;HTMLImageElement.prototype.decode=function(){target.audit.imageDecodes++;return decode.call(this);};
 const clear=CanvasRenderingContext2D.prototype.clearRect;CanvasRenderingContext2D.prototype.clearRect=function(...args){target.audit.clears++;return clear.apply(this,args);};
});
async function saved(){await page.getByText('Saved on this computer',{exact:true}).waitFor();return await page.evaluate(async()=>{const db=await new Promise<IDBDatabase>(resolve=>{const req=indexedDB.open('vibecraft-studio',1);req.onsuccess=()=>resolve(req.result);});return await new Promise<any>(resolve=>{const req=db.transaction('projects').objectStore('projects').getAll();req.onsuccess=()=>{db.close();resolve(req.result.sort((a:any,b:any)=>b.updatedAt.localeCompare(a.updatedAt))[0]);};});});}
async function open(project:any){await page.getByTitle('Open projects',{exact:true}).first().click();await page.locator('dialog input[type=file]').setInputFiles({name:'audit.vibecraft',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});await page.waitForFunction(title=>(document.querySelector('[aria-label="Project title"]')as HTMLInputElement)?.value===title,project.title);await saved();await page.waitForTimeout(200);}
function record(name:string,data:any){report.checks.push({name,...data});console.log(name,JSON.stringify(data));}
try{
 await page.goto('http://127.0.0.1:4518/studio',{waitUntil:'networkidle'});await saved();
 const dense=createProject({title:'Audit valid 150 elements',scenes:[createScene(1920,1080,{duration:8,elements:Array.from({length:150},(_,i)=>createElement('shape',{id:makeId(),x:(i%15)*100,y:Math.floor(i/15)*90,width:60,height:50,animation:{start:0,draw:0,hold:1,exit:0,entrance:'none',exitStyle:'none',emphasis:'none',hand:'none',handColor:'#deb38e'}}))})]});parseProject(dense);await open(dense);
 await page.keyboard.press('Control+a');await page.keyboard.press('Control+d');const invalid=await saved();let error='';try{parseProject(invalid);}catch(e){error=(e as Error).message;}
 assert.equal(invalid.scenes[0].elements.length,150);assert.equal(error,'');
 await page.keyboard.press('Control+c');await page.keyboard.press('Control+v');assert.equal((await saved()).scenes[0].elements.length,150);
 await page.getByTitle('Select (V)',{exact:true}).click();await page.keyboard.press('t');const paper=await page.locator('.paper').boundingBox();assert.ok(paper);await page.mouse.click(paper.x+paper.width/2,paper.y+paper.height/2);assert.equal((await saved()).scenes[0].elements.length,150);
 record('Duplicate, paste and direct canvas creation cannot exceed scene limit',{before:150,after:invalid.scenes[0].elements.length,valid:true});
 await page.reload({waitUntil:'networkidle'});await page.getByLabel('Project title').waitFor();assert.equal(await page.getByLabel('Project title').inputValue(),invalid.title);record('Last valid project reopens after rejected edits',{title:invalid.title});
 const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=32;canvas.getContext('2d')!.fillRect(0,0,32,32);return canvas.toDataURL();});
 const many=createProject({title:'Audit 25 scenes',scenes:Array.from({length:25},(_,i)=>createScene(1920,1080,{name:'Scene '+i,duration:2,elements:[createElement('image',{src:png,name:'Shared image',width:32,height:32})]}))});parseProject(many);await page.evaluate(()=>{(window as any).audit.imageDecodes=0;});await open(many);const decodes=await page.evaluate(()=>(window as any).audit.imageDecodes);
 await page.evaluate(()=>{(window as any).audit.clears=0;});await page.getByLabel('Project title').fill('Audit 25 scenes title edit');await saved();const clears=await page.evaluate(()=>(window as any).audit.clears);assert.equal(decodes,1);assert.equal(clears,1);record('Thumbnail resource fanout',{scenes:25,uniqueImages:1,imageDecodeCalls:decodes,canvasClearsForOneTitleChange:clears});
 const wav=Buffer.alloc(44+4410*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(44100,24);wav.writeUInt32LE(88200,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
 const audio=createProject({title:'Audit audio',audio:Array.from({length:50},()=>({id:makeId(),name:'Audit clip',src:'data:audio/wav;base64,'+wav.toString('base64'),kind:'voice',start:0,trimStart:0,trimEnd:0.1,volume:1,fadeIn:0,fadeOut:0}))});parseProject(audio);await open(audio);await page.evaluate(()=>{(window as any).audit.audioConstructions=0;});await page.getByLabel('Project title').fill('Audit audio renamed');await saved();assert.equal(await page.evaluate(()=>(window as any).audit.audioConstructions),0);record('Unrelated edit preserves audio nodes',{clips:50,audioConstructions:await page.evaluate(()=>(window as any).audit.audioConstructions)});
 await page.evaluate('globalThis.__name=(target)=>target');
 const bench=await page.evaluate(async()=>{
  const{renderProject}=await import('/src/engine/render.ts' as string);const{createElement,createScene,createProject}=await import('/src/model.ts' as string);const{assets}=await import('/src/assets.ts' as string);
  const canvas=document.createElement('canvas');canvas.width=1920;canvas.height=1080;const ctx=canvas.getContext('2d')!;
  const results=[];for(const count of [10,50,150]){const elements=Array.from({length:count},(_,i)=>createElement('vector',{paths:structuredClone(assets[i%assets.length].paths),x:(i%15)*110,y:Math.floor(i/15)*100,width:100,height:100}));const project=createProject({scenes:[createScene(1920,1080,{elements})]});const options={width:1920,height:1080,images:new Map(),preview:true};for(let i=0;i<5;i++)renderProject(ctx,project,1,options);const samples=[];for(let i=0;i<40;i++){const start=performance.now();renderProject(ctx,project,1,options);samples.push(performance.now()-start);}samples.sort((a,b)=>a-b);results.push({count,median:samples[20],p95:samples[38],max:samples[39]});}return results;
 });record('Renderer CPU benchmark 1080p',{samples:bench,limitation:'headless CPU timings on this PC; raster/compositing and other UI work excluded'});
}catch(error){report.error=(error as Error).stack;console.error(report.error);process.exitCode=1;}
finally{await writeFile(out+'/runtime-report.json',JSON.stringify(report,null,2));await context.close();await browser.close();await app.close();}
