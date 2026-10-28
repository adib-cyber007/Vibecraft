import { resolveBrowserExecutable } from '../scripts/browser-runtime.mjs';
import { chromium, type Page, type BrowserContext } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Project } from '../src/model';

const root=process.cwd(),dir=resolve(root,'artifacts/editor-browser');
await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:resolveBrowserExecutable().executablePath});
const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
const page=await context.newPage();
const pageErrors:string[]=[],checks:{name:string;passed:boolean;detail?:unknown}[]=[];
page.on('pageerror',e=>pageErrors.push(e.message));
const base=process.env.VIBECRAFT_URL||'http://127.0.0.1:4310';
async function persist(){
  await page.getByText('Saved on this computer',{exact:true}).waitFor();
  return await page.evaluate(async()=>{
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('vibecraft-studio',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    const projects=await new Promise<any[]>((resolve,reject)=>{const r=db.transaction('projects').objectStore('projects').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    return projects.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];
  }) as Project;
}
async function check(name:string,run:()=>Promise<unknown>){
  if(process.env.CHECK_ONLY&&!name.toLowerCase().includes(process.env.CHECK_ONLY.toLowerCase()))return;
  try{const detail=await run();checks.push({name,passed:true,detail});console.log('PASS '+name);}
  catch(e){checks.push({name,passed:false,detail:(e as Error).stack});await page.screenshot({path:resolve(dir,'failure-'+checks.length+'.png'),fullPage:true});console.log('FAIL '+name+' '+(e as Error).message);}
}
try{
  await page.goto(base+'/studio',{waitUntil:'networkidle'});
  await page.getByLabel('Project title').waitFor();
  await page.evaluate(()=>document.fonts.ready);
  await page.setViewportSize({width:1600,height:1000});await page.screenshot({path:resolve(dir,'marketing-editor.png'),fullPage:true});
  await copyFile(resolve(dir,'marketing-editor.png'),resolve(root,'public/images/editor-preview.png'));
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:resolve(dir,'initial-1440.png'),fullPage:true});
  console.log('Initial screenshot: '+resolve(dir,'initial-1440.png'));
  await page.getByTitle('Advanced timeline',{exact:true}).click();
  await check('Default project renders on paper with no page errors',async()=>{
    assert.equal(await page.getByLabel('Project title').inputValue(),'From spark to story');
    assert.equal(pageErrors.length,0);
    const pixels=await page.locator('.paper canvas').evaluate((canvas:any)=>{const c=canvas.getContext('2d'),data=c.getImageData(0,0,canvas.width,canvas.height).data;let ink=0;for(let i=0;i<data.length;i+=4)if(data[i]<180&&data[i+1]<190&&data[i+2]<200)ink++;return ink;});
    assert.ok(pixels>1000,'Canvas has visible drawn content');return {inkPixels:pixels};
  });
  await check('Illustration search and add',async()=>{
    const before=await persist();
    await page.getByTitle('Illustrations',{exact:true}).click();
    await page.getByLabel('Search illustrations').fill('rocket');
    await page.getByTitle('Add Ready for launch',{exact:true}).click();
    const after=await persist();assert.equal(after.scenes[0].elements.length,before.scenes[0].elements.length+1);
    assert.equal(after.scenes[0].elements.at(-1)?.name,'Ready for launch');return {elements:after.scenes[0].elements.length};
  });
  await check('Canvas drag and corner resize update world geometry',async()=>{
    const x=Number(await page.getByLabel('X',{exact:true}).inputValue()),w=Number(await page.getByLabel('Width',{exact:true}).inputValue());
    const box=await page.locator('.selection-box').boundingBox();assert.ok(box);
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+35,box.y+box.height/2+20,{steps:6});await page.mouse.up();
    assert.ok(Number(await page.getByLabel('X',{exact:true}).inputValue())>x);
    const handle=await page.getByLabel('Resize se').boundingBox();assert.ok(handle);
    await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(handle.x+handle.width/2+20,handle.y+handle.height/2+15,{steps:4});await page.mouse.up();
    assert.ok(Number(await page.getByLabel('Width',{exact:true}).inputValue())>w);
    return {x:Number(await page.getByLabel('X',{exact:true}).inputValue()),width:Number(await page.getByLabel('Width',{exact:true}).inputValue())};
  });
  await check('Undo and redo restore canvas resize',async()=>{
    const width=await page.getByLabel('Width',{exact:true}).inputValue();
    await page.getByRole('button',{name:'Undo (Ctrl+Z)',exact:true}).click();assert.notEqual(await page.getByLabel('Width',{exact:true}).inputValue(),width);
    await page.getByRole('button',{name:'Redo (Ctrl+Shift+Z)',exact:true}).click();assert.equal(await page.getByLabel('Width',{exact:true}).inputValue(),width);
  });
  await check('Text formatting, animation properties and seek preview',async()=>{
    await page.getByRole('button',{name:'Text',exact:true}).click();await page.getByRole('button',{name:'Add a heading A big idea starts here'}).click();
    await page.getByLabel('Your text',{exact:true}).fill('Browser verified story');
    await page.getByLabel('Font',{exact:true}).selectOption('DM Sans');
    await page.getByLabel('Font size',{exact:true}).fill('72');
    await page.getByRole('button',{name:'Animation',exact:true}).click();
    await page.getByLabel('Animation style',{exact:true}).selectOption('fade');
    await page.getByLabel('Start (s)',{exact:true}).fill('1');
    await page.getByLabel('Draw (s)',{exact:true}).fill('1.5');
    const p=await persist(),text=p.scenes[0].elements.at(-1)!;assert.equal(text.text,'Browser verified story');assert.equal(text.fontFamily,'DM Sans');assert.equal(text.animation.entrance,'fade');assert.equal(text.animation.draw,1.5);
    await page.getByLabel('Seek animation').fill('3');
    await page.getByText(/Preview paused/).waitFor();assert.ok(await page.locator('.preview-status').isVisible());
    await page.getByRole('button',{name:/Return to editing/}).click();return {text:text.text,animation:text.animation};
  });
  await check('Keyboard multi-select and alignment',async()=>{
    await page.getByLabel('Animation canvas').click({position:{x:5,y:5}});
    await page.keyboard.press('Control+a');
    await page.getByRole('button',{name:'Style',exact:true}).click();
    await page.getByRole('button',{name:'left',exact:true}).click();
    const p=await persist(),xs=p.scenes[0].elements.map(el=>el.x);assert.equal(new Set(xs).size,1);return {aligned:xs.length,x:xs[0]};
  });
  await check('Scene add, duplicate, reorder and delete',async()=>{
    await page.keyboard.press('Escape');
    await page.getByTitle('Scenes',{exact:true}).click();
    const before=(await persist()).scenes.length;
    await page.getByTitle('Add scene',{exact:true}).click();assert.equal((await persist()).scenes.length,before+1);
    await page.getByLabel('Scene name',{exact:true}).fill('Browser scene');
    await page.getByTitle('Duplicate scene',{exact:true}).click();let p=await persist();assert.equal(p.scenes.length,before+2);assert.equal(p.scenes.at(-1)?.name,'Browser scene copy');
    const cards=page.locator('.scene-card');await cards.nth(before+1).focus();for(let index=0;index<before+1;index++)await page.keyboard.press('Alt+ArrowUp');p=await persist();assert.equal(p.scenes[0].name,'Browser scene copy');
    await page.getByTitle('Delete scene',{exact:true}).click();p=await persist();assert.equal(p.scenes.length,before+1);return {sceneCount:p.scenes.length};
  });
  await check('Canvas mode changes persist',async()=>{await page.getByLabel('Canvas mode').selectOption('roaming');assert.equal((await persist()).mode,'roaming');await page.getByLabel('Canvas mode').selectOption('scenes');});
  await check('Timeline bars drag start time and entrance duration',async()=>{
    const before=await persist(),first=before.scenes[0].elements[0];
    const bar=await page.locator('.animation-bar').first().boundingBox();assert.ok(bar);
    await page.mouse.move(bar.x+Math.min(24,bar.width/3),bar.y+10);await page.mouse.down();await page.mouse.move(bar.x+Math.min(24,bar.width/3)+64,bar.y+10,{steps:8});await page.mouse.up();
    const moved=(await persist()).scenes[0].elements.find(e=>e.id===first.id)!;assert.ok(Math.abs(moved.animation.start-first.animation.start-1)<0.11,'Dragging a bar64px must move start by1s at64px/s');
    const handle=await page.locator('.animation-bar .bar-draw > i').first().boundingBox();assert.ok(handle);
    await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(handle.x+handle.width/2+32,handle.y+handle.height/2,{steps:6});await page.mouse.up();
    const resized=(await persist()).scenes[0].elements.find(e=>e.id===first.id)!;assert.ok(Math.abs(resized.animation.draw-moved.animation.draw-0.5)<0.11,'Dragging entrance edge32px must add0.5s at64px/s');return {start:resized.animation.start,draw:resized.animation.draw};
  });
  await check('Safe SVG import preserves drawable vector geometry and rejects active SVG',async()=>{
    await page.getByRole('button',{name:'Uploads',exact:true}).click();
    const input=page.locator('input[type=file][accept^="image/png"]');
    await input.setInputFiles({name:'browser-image.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="100"><rect x="4" y="4" width="112" height="92" fill="#e8ba59"/><path d="M20 50 L50 80 L100 20" fill="none" stroke="#246451" stroke-width="6"/></svg>')});
    await page.getByRole('status').filter({hasText:'1 image added.'}).waitFor();
    let p=await persist();const imported=p.scenes.flatMap(s=>s.elements).find(e=>e.name==='browser-image.svg');assert.ok(imported);assert.ok(imported.src?.startsWith('data:image/svg+xml'));assert.equal(imported.type,'vector');assert.ok(imported.paths&&imported.paths.length>=2);
    const renderProject=structuredClone(p),scene=renderProject.scenes.find(s=>s.elements.some(e=>e.id===imported.id))!;renderProject.scenes=[scene];renderProject.audio=[];
    scene.background='#ffffff';scene.transition='cut';scene.camera={x:p.width/2,y:p.height/2,zoom:1};scene.duration=3;
    const vector=structuredClone(imported);vector.x=460;vector.y=140;vector.width=1000;vector.height=800;vector.animation={...vector.animation,start:0,draw:2,hold:1,exit:0,exitStyle:'none',hand:'none'};scene.elements=[vector];
    const renderer=await context.newPage();try{await renderer.goto(base+'/?render=1',{waitUntil:'networkidle'});await renderer.waitForFunction(()=>Boolean(window.vibecraftRender));await renderer.evaluate(async p=>{await window.vibecraftRender!.setup(p,960,540);},renderProject);
      const early=await renderer.evaluate(async()=>{await window.vibecraftRender!.frame(.3);const c=document.querySelector('canvas')!,data=c.getContext('2d')!.getImageData(0,0,c.width,c.height).data;let ink=0;for(let i=0;i<data.length;i+=4)if(data[i]<220||data[i+1]<220||data[i+2]<220)ink++;return ink;});
      const late=await renderer.evaluate(async()=>{await window.vibecraftRender!.frame(2.3);const c=document.querySelector('canvas')!,data=c.getContext('2d')!.getImageData(0,0,c.width,c.height).data;let ink=0;for(let i=0;i<data.length;i+=4)if(data[i]<220||data[i+1]<220||data[i+2]<220)ink++;return ink;});
      assert.ok(late>early+100,'Imported SVG path animation must add visible geometry as time advances');
    }finally{await renderer.close();}
    const count=p.scenes.flatMap(s=>s.elements).length;
    await input.setInputFiles({name:'active.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')});
    await page.getByRole('status').filter({hasText:'Unsupported SVG element: script'}).waitFor();p=await persist();assert.equal(p.scenes.flatMap(s=>s.elements).length,count);return {embedded:true,type:imported.type,paths:imported.paths.length,rejectedActive:true};
  });
  await check('Custom font import becomes selectable and persists',async()=>{
    await page.getByRole('button',{name:'Text',exact:true}).click();
    const font=await readFile(resolve(root,'node_modules/@fontsource/kalam/files/kalam-latin-400-normal.woff2'));
    await page.locator('input[type=file][accept=".ttf,.otf,.woff,.woff2"]').setInputFiles({name:'BrowserFont.woff2',mimeType:'font/woff2',buffer:font});
    await page.getByRole('status').filter({hasText:'BrowserFont is ready'}).waitFor();assert.ok((await persist()).fonts?.some(f=>f.family==='BrowserFont'));
    await page.getByRole('button',{name:'Add a heading A big idea starts here'}).click();await page.getByRole('button',{name:'Style',exact:true}).click();await page.getByLabel('Font',{exact:true}).selectOption('BrowserFont');assert.ok((await persist()).scenes.flatMap(s=>s.elements).some(el=>el.fontFamily==='BrowserFont'));
  });
  await check('Original soundtrack, trim, scope and split work',async()=>{
    await page.getByRole('button',{name:'Audio',exact:true}).click();
    await page.getByRole('button',{name:'Add an original gentle soundtrack'}).click();
    await page.getByLabel('Gentle chord bed start',{exact:true}).waitFor();
    await page.getByLabel('Gentle chord bed start',{exact:true}).fill('0.5');
    await page.getByLabel('Gentle chord bed trim in',{exact:true}).fill('1');
    await page.getByLabel('Gentle chord bed trim out',{exact:true}).fill('6');
    await page.getByLabel('Gentle chord bed fade in',{exact:true}).fill('0.4');
    const scope=(await persist()).scenes[0].id;await page.getByLabel('Gentle chord bed scope',{exact:true}).selectOption(scope);
    let p=await persist();assert.equal(p.audio.length,1);assert.equal(p.audio[0].trimStart,1);assert.equal(p.audio[0].trimEnd,6);assert.equal(p.audio[0].sceneId,scope);
    await page.getByLabel('Split Gentle chord bed',{exact:true}).click();p=await persist();assert.equal(p.audio.length,2);assert.ok(p.audio.every(a=>a.trimEnd>a.trimStart));return {tracks:p.audio.length,durations:p.audio.map(a=>a.trimEnd-a.trimStart)};
  });
  await check('Script editor saves and local model status is explicit',async()=>{
    await page.getByRole('button',{name:'Script',exact:true}).click();
    await page.getByLabel('Project script',{exact:true}).fill('A browser verified narration script.');
    assert.equal((await persist()).script,'A browser verified narration script.');
    await page.getByLabel('Storyboard model').waitFor();return {modelLabel:await page.getByLabel('Storyboard model').textContent(),buttonDisabled:await page.getByRole('button',{name:'Generate storyboard',exact:true}).isDisabled()};
  });
  await check('Portable project download, open and autosave reload',async()=>{
    await page.getByLabel('Project title').fill('Browser verified project');
    await persist();const downloading=page.waitForEvent('download',{timeout:5000});await page.keyboard.press('Control+Shift+s');
    const download=await downloading;const file=resolve(dir,'portable-project.vibecraft');await download.saveAs(file);
    const p=JSON.parse(await readFile(file,'utf8')) as Project;assert.equal(p.title,'Browser verified project');assert.equal(p.audio.length,2);assert.ok(p.fonts?.length);
    await page.getByTitle('Open projects',{exact:true}).first().click();
    const projectInput=page.locator('dialog input[type=file]');
    await projectInput.setInputFiles({name:'portable-project.vibecraft',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...p,title:'Imported browser project'}))});
    await page.getByLabel('Project title').filter({visible:true}).waitFor();await page.waitForFunction(()=> (document.querySelector('input[aria-label="Project title"]') as HTMLInputElement)?.value==='Imported browser project');
    await persist();await page.reload({waitUntil:'networkidle'});assert.equal(await page.getByLabel('Project title').inputValue(),'Imported browser project');
  });
  await check('Malformed portable project shows error without replacing work',async()=>{
    await page.getByTitle('Open projects',{exact:true}).first().click();await page.locator('dialog input[type=file]').setInputFiles({name:'bad.vibecraft',mimeType:'application/json',buffer:Buffer.from('{"version":1,"scenes":[]}')});
    await page.getByRole('status').filter({hasText:'Could not open project:'}).waitFor();assert.equal(await page.getByLabel('Project title').inputValue(),'Imported browser project');await page.getByRole('button',{name:'Close dialog'}).click();
  });
  await page.setViewportSize({width:1920,height:1080});await page.screenshot({path:resolve(dir,'editor-1920.png'),fullPage:true});
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:resolve(dir,'editor-after-1440.png'),fullPage:true});
  const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const mobilePage=await mobile.newPage();
  await mobilePage.goto(base+'/studio',{waitUntil:'networkidle'});await mobilePage.getByLabel('Project title').waitFor();await mobilePage.screenshot({path:resolve(dir,'mobile-390.png'),fullPage:true});
  await check('Mobile drawer and properties can be closed by touch',async()=>{
    await mobilePage.getByLabel('Collapse library').tap();await mobilePage.screenshot({path:resolve(dir,'mobile-canvas-390.png'),fullPage:true});
    await mobilePage.getByRole('button',{name:'Text',exact:true}).tap();await mobilePage.getByRole('button',{name:'Add a heading A big idea starts here'}).tap();await mobilePage.getByRole('button',{name:'Close properties',exact:true}).waitFor();
    await mobilePage.screenshot({path:resolve(dir,'mobile-properties-390.png'),fullPage:true});await mobilePage.getByRole('button',{name:'Close properties',exact:true}).tap();assert.equal(await mobilePage.locator('.selection-box').count(),0);
  });
  await check('Mobile shell has no horizontal document overflow',async()=>{const sizes=await mobilePage.evaluate(()=>({body:document.body.scrollWidth,viewport:innerWidth}));assert.ok(sizes.body<=sizes.viewport);return sizes;});
  await mobile.close();
  assert.equal(pageErrors.length,0,'No page errors during editor workflows');
}finally{
  await writeFile(resolve(dir,process.env.CHECK_ONLY?'report-'+process.env.CHECK_ONLY+'.json':'report.json'),JSON.stringify({date:new Date().toISOString(),checks,pageErrors,passed:checks.filter(c=>c.passed).length,failed:checks.filter(c=>!c.passed).length},null,2));
  await context.close();await browser.close();
}
if(checks.some(c=>!c.passed)||pageErrors.length)process.exitCode=1;
