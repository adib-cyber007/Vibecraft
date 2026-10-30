import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, openSync, closeSync } from 'node:fs';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { dirname, join, resolve, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const runtime=join(root,'.runtime'),stateFile=join(runtime,'portable-session.json');
const rootId=createHash('sha256').update(root.toLowerCase()).digest('hex');
const command=process.argv[2]||'start',noBrowser=process.argv.includes('--no-browser');
const portIndex=process.argv.indexOf('--port'),requestedPort=portIndex<0?undefined:Number(process.argv[portIndex+1]);
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
async function state(){try{const value=JSON.parse(await readFile(stateFile,'utf8'));return value.version===1&&Number.isInteger(value.port)&&value.port>=1024&&value.port<=65535&&value.url==='http://127.0.0.1:'+value.port&&typeof value.sessionId==='string'&&typeof value.token==='string'&&typeof value.rootId==='string'?value:undefined;}catch{return undefined;}}
async function health(url){try{const response=await fetch(url+'/api/health',{signal:AbortSignal.timeout(2500)});return response.ok?await response.json():undefined;}catch{return undefined;}}
function show(url){if(noBrowser)return;const child=spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{detached:true,windowsHide:true,stdio:'ignore'});child.on('error',()=>console.log('Open '+url+' in your browser.'));child.unref();}
function environment(){return {...process.env,PATH:[join(root,'runtime','node'),join(root,'runtime','ffmpeg','bin'),process.env.PATH||''].join(delimiter),VIBECRAFT_BROWSER_EXECUTABLE:join(root,'runtime','browser','chrome.exe')};}
function requiredFiles(){return ['runtime/node/node.exe','runtime/ffmpeg/bin/ffmpeg.exe','runtime/ffmpeg/bin/ffprobe.exe','runtime/browser/chrome.exe','server/index.mjs','server/speech.ps1','dist/index.html'].map(path=>join(root,path));}
async function stop(){
  const saved=await state();if(!saved||saved.rootId!==rootId){console.log('No studio session started from this folder.');return;}
  const live=await health(saved.url);
  if(!live){await unlink(stateFile).catch(()=>{});console.log('Vibecraft is already stopped.');return;}
  if(live.app!=='vibecraft'||live.sessionId!==saved.sessionId)throw new Error('The port now belongs to another session. Nothing was stopped.');
  const response=await fetch(saved.url+'/api/session/stop',{method:'POST',headers:{'Content-Type':'application/json',Origin:saved.url},body:JSON.stringify({token:saved.token}),signal:AbortSignal.timeout(5000)});
  if(response.status!==202)throw new Error('The server did not accept this launcher’s stop request.');
  const deadline=Date.now()+30000;
  while(Date.now()<deadline){const remaining=await health(saved.url);if(!remaining||remaining.sessionId!==saved.sessionId){const current=await state();if(current?.sessionId===saved.sessionId)await unlink(stateFile).catch(()=>{});console.log('Vibecraft stopped. Saved projects remain in your browser.');return;}await sleep(250);}
  throw new Error('The studio is still finishing a task. Try Stop-Vibecraft.cmd again.');
}
async function check(){
  const missing=requiredFiles().filter(file=>!existsSync(file));
  if(missing.length)throw new Error('Extract the complete ZIP first. Missing files:\n'+missing.join('\n'));
  const {execFileSync}=await import('node:child_process');
  for(const name of ['ffmpeg','ffprobe']){const executable=join(root,'runtime','ffmpeg','bin',name+'.exe');console.log(execFileSync(executable,['-version'],{encoding:'utf8',windowsHide:true}).split(/\r?\n/)[0]);}
  console.log('Node '+process.version+' · '+process.platform+' '+process.arch);
  console.log('Bundled browser: '+join(root,'runtime','browser','chrome.exe'));
  console.log('Ready. No Node, FFmpeg, npm or browser installation is required.');
}
async function start(){
  if(process.platform!=='win32'||process.arch!=='x64')throw new Error('This package is for 64-bit Windows 10/11. Use the source project for another operating system.');
  const missing=requiredFiles().filter(file=>!existsSync(file));
  if(missing.length)throw new Error('Extract the complete ZIP before starting Vibecraft. Missing: '+missing[0]);
  const saved=await state(),port=requestedPort??(saved?.rootId===rootId?saved.port:4310);
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Use --port with a whole number from 1024 to 65535.');
  const url='http://127.0.0.1:'+port,live=await health(url);
  if(live){
    if(saved?.rootId===rootId&&live.app==='vibecraft'&&live.sessionId===saved.sessionId){console.log('Vibecraft is ready at '+url);show(url);return;}
    throw new Error('Port '+port+' is in use. Stop the other studio, or run Start-Vibecraft.cmd --port 4311. Different ports have separate browser saves.');
  }
  await mkdir(runtime,{recursive:true});
  const sessionId=randomUUID(),token=randomUUID()+randomUUID();
  const out=openSync(join(runtime,'server.out.log'),'w'),err=openSync(join(runtime,'server.error.log'),'w');
  const child=spawn(join(root,'runtime','node','node.exe'),[join(root,'server','index.mjs'),'--production'],{cwd:root,env:{...environment(),PORT:String(port),VIBECRAFT_SESSION_ID:sessionId,VIBECRAFT_STOP_TOKEN:token},detached:true,windowsHide:true,stdio:['ignore',out,err]});
  closeSync(out);closeSync(err);
  let failed;child.on('error',error=>{failed=error;});child.unref();
  const deadline=Date.now()+30000;
  while(Date.now()<deadline){
    if(failed)throw failed;
    const result=await health(url);
    if(result?.app==='vibecraft'&&result.sessionId===sessionId){await writeFile(stateFile,JSON.stringify({version:1,rootId,port,url,pid:child.pid,sessionId,token},null,2),{mode:0o600});console.log('Vibecraft is ready at '+url);show(url);return;}
    if(child.exitCode!==null)break;
    await sleep(250);
  }
  child.kill();throw new Error('The studio could not start. See .runtime/server.error.log. The port may already be in use.');
}
try{if(command==='stop')await stop();else if(command==='check')await check();else if(command==='start')await start();else throw new Error('Use start, stop or check.');}
catch(error){console.error('\n'+error.message);process.exitCode=1;}
