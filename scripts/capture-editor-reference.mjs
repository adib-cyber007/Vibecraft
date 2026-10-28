import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { resolveBrowserExecutable } from './browser-runtime.mjs';
const root=process.cwd(),dir=path.join(root,'artifacts','editor-reference'),endpoint='http://127.0.0.1:9334';
await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:resolveBrowserExecutable().executablePath,args:['--remote-debugging-port=9334','--remote-debugging-address=127.0.0.1']});
const ledger=[];
async function rea(args,name){
  const processRun=spawn(process.execPath,[path.join(root,'node_modules/rea-agents/scripts/rea.mjs'),...args,'--json'],{cwd:root,windowsHide:true});
  let stdout='',stderr='';processRun.stdout.on('data',d=>stdout+=d);processRun.stderr.on('data',d=>stderr+=d);
  const code=await new Promise((resolve,reject)=>{processRun.on('error',reject);processRun.on('close',resolve);});await writeFile(path.join(dir,name+'.json'),stdout);if(stderr)await writeFile(path.join(dir,name+'.stderr.txt'),stderr);
  if(code!==0)throw new Error(name+' REA failed: '+stderr.slice(-300));
  const data=JSON.parse(stdout);const ids=[];const walk=o=>{if(!o||typeof o!=='object')return;for(const[k,v]of Object.entries(o)){if((k==='id'||k==='evidence_id')&&typeof v==='string'&&v.startsWith('ev_'))ids.push(v);else if(typeof v==='object')walk(v);}};walk(data);
  return {operation:args[0],file:name+'.json',ids:[...new Set(ids)],sha256:createHash('sha256').update(stdout).digest('hex')};
}
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  for(const[name,url]of [['image-library','https://help.videoscribe.co/knowledge/finding-images-in-our-library'],['timeline','https://help.videoscribe.co/knowledge/using-the-timeline'],['cameras','https://help.videoscribe.co/knowledge/controlling-cameras']]){
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});await page.locator('h1').waitFor();
    const discovery=await rea(['list-browser-targets',endpoint],name+'-targets');
    const targets=await(await fetch(endpoint+'/json/list')).json();const selected=targets.find(t=>t.type==='page'&&t.url===page.url());if(!selected)throw new Error('Page unavailable');
    const capture=await rea(['inspect-web-page',endpoint,selected.id,'--include-accessibility-text','--observation-ms','500'],name+'-evidence');
    const screenshot=await rea(['capture-web-screenshot',endpoint,selected.id],name+'-screenshot');
    await page.screenshot({path:path.join(dir,name+'-page.png'),fullPage:true});
    const images=await page.locator('article img, main img, .kb-article img').evaluateAll(els=>els.map(el=>({src:el.currentSrc,alt:el.alt,width:el.naturalWidth,height:el.naturalHeight})));
    ledger.push({url:page.url(),title:await page.title(),discovery,capture,screenshot,images});
  }
  await writeFile(path.join(dir,'rea-ledger.json'),JSON.stringify({capturedAt:new Date().toISOString(),scope:'Official public help pages and their embedded editor demonstrations; no authenticated editor behavior',ledger},null,2));
  console.log(JSON.stringify(ledger.map(({url,capture,screenshot})=>({url,capture,screenshot}))));
}finally{await browser.close();}
