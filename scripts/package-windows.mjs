import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { cp, mkdir, readFile, readdir, stat, writeFile, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveBrowserExecutable } from './browser-runtime.mjs';

const run=promisify(execFile),root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(process.platform!=='win32'||process.arch!=='x64')throw new Error('Build the Windows x64 package on Windows x64.');
const packageJson=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z');
const release=join(root,'artifacts','releases',stamp),name='Vibecraft-'+packageJson.version+'-Windows-x64',stage=join(release,name);
await mkdir(stage,{recursive:true});
const hash=async file=>{const digest=createHash('sha256');for await(const chunk of createReadStream(file))digest.update(chunk);return digest.digest('hex');};
const copy=async(source,target)=>{await mkdir(dirname(target),{recursive:true});await cp(source,target,{recursive:true,errorOnExist:true,force:false});};
const inputs=join(root,'.cache','portable-inputs');await mkdir(inputs,{recursive:true});
const nodeVersion=process.version.slice(1);
async function input(file,url){const target=join(inputs,file);try{await access(target);}catch{const response=await fetch(url);if(!response.ok)throw new Error('Cannot fetch '+url+': HTTP '+response.status);await writeFile(target,Buffer.from(await response.arrayBuffer()));}return target;}
console.log('Verifying the Node runtime and collecting production code...');
const sums=await input('node-'+nodeVersion+'-SHASUMS256.txt','https://nodejs.org/dist/v'+nodeVersion+'/SHASUMS256.txt');
const nodeLicense=await input('node-'+nodeVersion+'-LICENSE','https://raw.githubusercontent.com/nodejs/node/v'+nodeVersion+'/LICENSE');
const expected=(await readFile(sums,'utf8')).split(/\r?\n/).find(line=>line.endsWith('  win-x64/node.exe'))?.split(/\s+/)[0];
const nodeHash=await hash(process.execPath);if(!expected||expected!==nodeHash)throw new Error('The installed Node executable did not match its official release checksum.');
await copy(process.execPath,join(stage,'runtime','node','node.exe'));
await copy(nodeLicense,join(stage,'licenses','Node-LICENSE.txt'));
await copy(sums,join(stage,'licenses','Node-SHASUMS256.txt'));
const compiled=await build({absWorkingDir:root,entryPoints:['server/index.ts'],outfile:join(stage,'server','index.mjs'),bundle:true,packages:'external',platform:'node',target:'node24',format:'esm',metafile:true,legalComments:'eof'});
const externals=[...new Set(Object.values(compiled.metafile.outputs).flatMap(output=>output.imports.filter(entry=>entry.external&&!entry.path.startsWith('node:')).map(entry=>entry.path)))];
if(externals.some(name=>!['express','zod','playwright','vite'].includes(name)))throw new Error('Review the changed server dependencies: '+externals.join(', '));
await copy(join(root,'server','speech.ps1'),join(stage,'server','speech.ps1'));
await copy(join(root,'dist'),join(stage,'dist'));
await copy(join(root,'scripts','portable-launcher.mjs'),join(stage,'scripts','portable-launcher.mjs'));
await writeFile(join(stage,'package.json'),JSON.stringify({name:'vibecraft-portable',version:packageJson.version,private:true,type:'module'},null,2));

// Resolve the installed dependency closure. Only these package directories are copied.
const packages=new Map();
async function collect(name,from){
  const req=createRequire(join(from,'__vibecraft_resolve.cjs'));
  let directory;
  for(const location of req.resolve.paths(name)||[]){const candidate=join(location,name);try{const info=JSON.parse(await readFile(join(candidate,'package.json'),'utf8'));if(info.name===name){directory=candidate;break;}}catch{}}
  if(!directory)throw Object.assign(new Error('Cannot locate '+name),{code:'MODULE_NOT_FOUND'});
  if(packages.has(directory))return;
  const info=JSON.parse(await readFile(join(directory,'package.json'),'utf8'));
  const destination=relative(root,directory);if(!destination.startsWith('node_modules'+sep)||destination.includes('..'+sep))throw new Error('Dependency is outside the project: '+name);
  packages.set(directory,{name,version:info.version,license:info.license,path:destination.replaceAll(sep,'/')});
  for(const dependency of Object.keys(info.dependencies||{}))await collect(dependency,directory);
  for(const dependency of Object.keys(info.optionalDependencies||{})){try{await collect(dependency,directory);}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}}
}
for(const name of externals.filter(name=>name!=='vite'))await collect(name,root);
for(const [directory,info]of packages)await copy(directory,join(stage,info.path));

console.log('Collecting the bundled browser and video encoders...');
const browserInfo=resolveBrowserExecutable(),browserDirectory=dirname(browserInfo.executablePath);
const about=await readFile(join(browserDirectory,'ABOUT'),'utf8').catch(()=> '');
if(!/chromium/i.test(about))throw new Error('A Chromium distribution with its ABOUT file is required; system Chrome/Edge installations are not copied.');
await copy(browserDirectory,join(stage,'runtime','browser'));
const browser=await chromium.launch({headless:true,executablePath:browserInfo.executablePath});
let browserVersion;
try{browserVersion=browser.version();const page=await browser.newPage();await page.goto('chrome://credits/');await writeFile(join(stage,'licenses','Chromium-credits.html'),await page.content());await page.goto('chrome://terms/');await writeFile(join(stage,'licenses','Browser-terms.html'),await page.content());}finally{await browser.close();}
await copy(join(root,'node_modules','playwright-core','LICENSE'),join(stage,'licenses','Playwright-LICENSE.txt'));
await copy(join(root,'node_modules','playwright-core','NOTICE'),join(stage,'licenses','Playwright-NOTICE.txt'));
const ffmpeg=String((await run('where.exe',['ffmpeg'],{windowsHide:true})).stdout).trim().split(/\r?\n/)[0];
const ffmpegDirectory=dirname(ffmpeg),ffmpegRoot=dirname(ffmpegDirectory);
const ffmpegVersion=(await run(ffmpeg,['-version'],{windowsHide:true})).stdout.split(/\r?\n/)[0];
const ffmpegLicense=await readFile(join(ffmpegRoot,'LICENSE'),'utf8');
const ffmpegReadme=await readFile(join(ffmpegRoot,'README.txt'),'utf8');
if(!ffmpegReadme.includes('www.gyan.dev')||!ffmpegReadme.includes('Source Code: https://github.com/FFmpeg/FFmpeg/commit/')||!ffmpegLicense.includes('GNU GENERAL PUBLIC LICENSE'))throw new Error('Expected the documented Gyan FFmpeg distribution and complete license.');
if((await run(ffmpeg,['-buildconf'],{windowsHide:true})).stderr.includes('--enable-nonfree'))throw new Error('This FFmpeg build cannot be included.');
for(const file of ['ffmpeg.exe','ffprobe.exe'])await copy(join(ffmpegDirectory,file),join(stage,'runtime','ffmpeg','bin',file));
await writeFile(join(stage,'licenses','FFmpeg-GPLv3.txt'),ffmpegLicense);
await writeFile(join(stage,'licenses','FFmpeg-build-and-sources.txt'),ffmpegReadme);
await copy(join(ffmpegRoot,'doc'),join(stage,'licenses','FFmpeg-doc'));

console.log('Adding the launchers, source project and integrity manifest...');
for(const [label,action]of [['Start','start'],['Stop','stop'],['Check','check']]){
  const batch=['@echo off','setlocal','cd /d "%~dp0"','if not exist "%~dp0runtime\\node\\node.exe" (','  echo Extract the complete Vibecraft ZIP first.','  pause','  exit /b 1',')','"%~dp0runtime\\node\\node.exe" "%~dp0scripts\\portable-launcher.mjs" '+action+' %*','if errorlevel 1 (','  pause','  exit /b 1',')',...(action==='check'?['pause']:[]),''];
  await writeFile(join(stage,label+'-Vibecraft.cmd'),batch.join('\r\n'));
}
await copy(join(root,'docs','portable-start-here.txt'),join(stage,'START-HERE.txt'));
await copy(join(root,'THIRD_PARTY_NOTICES.md'),join(stage,'licenses','Application-notices.md'));
await writeFile(join(stage,'licenses','RUNTIME-SOURCES.txt'),[
  'Node '+nodeVersion+': https://nodejs.org/dist/v'+nodeVersion+'/',
  'Node source and notices: https://github.com/nodejs/node/tree/v'+nodeVersion,
  'Chromium '+browserVersion+': https://chromium.googlesource.com/chromium/src/+/refs/tags/'+browserVersion,
  'Chromium notices: Chromium-credits.html (captured from this exact bundled browser).',
  'Playwright source: https://github.com/microsoft/playwright/tree/v'+JSON.parse(await readFile(join(root,'node_modules/playwright/package.json'),'utf8')).version,
  'FFmpeg original supplier: https://www.gyan.dev/ffmpeg/builds/',
  'FFmpeg exact source revision, external-library versions and complete build configuration: FFmpeg-build-and-sources.txt.',
  'Application source and dependency notices: ../source/ and ../node_modules/.',
  'Runtime binaries are unmodified. No personal browser profile or user media is included.','',
].join('\n'));
const listed=(await run('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8',maxBuffer:4_000_000})).stdout.split('\0').filter(Boolean);
const roots=new Set(['src','server','scripts','tests','docs','public','skills']);
const files=new Set(['.gitignore','.nvmrc','AGENTS.md','README.md','Skill.md','Start-Vibecraft.cmd','THIRD_PARTY_NOTICES.md','index.html','package.json','package-lock.json','tsconfig.json','vite.config.ts']);
for(const path of new Set(listed)){
  if(!roots.has(path.split('/')[0])&&!files.has(path))throw new Error('Review this new source file before packaging: '+path);
  if(path.split('/').some(part=>['.git','.runtime','.cache','node_modules','.env'].includes(part))||/\.(pem|key|pfx)$/i.test(path))throw new Error('Sensitive or generated source path is excluded: '+path);
  await copy(join(root,path),join(stage,'source',path));
}
const manifest={product:'Vibecraft',version:packageJson.version,platform:'win32-x64',createdAt:new Date().toISOString(),sourceCommit:(await run('git',['rev-parse','HEAD'],{cwd:root})).stdout.trim(),sourceHasChanges:!!(await run('git',['status','--porcelain'],{cwd:root})).stdout.trim(),runtimes:{node:{version:nodeVersion,sha256:nodeHash},chromium:{version:browserVersion},ffmpeg:{version:ffmpegVersion}},packages:[...packages.values()],files:[]};
async function inventory(directory){for(const entry of await readdir(directory,{withFileTypes:true})){const absolute=join(directory,entry.name);if(entry.isSymbolicLink())throw new Error('Symbolic links are not allowed in the portable archive.');if(entry.isDirectory())await inventory(absolute);else{const path=relative(stage,absolute).replaceAll(sep,'/');manifest.files.push({path,bytes:(await stat(absolute)).size,sha256:await hash(absolute)});}}}
await inventory(stage);manifest.files.sort((a,b)=>a.path.localeCompare(b.path));
await writeFile(join(stage,'package-manifest.json'),JSON.stringify(manifest,null,2));
const archive=join(release,name+'.zip');
console.log('Compressing '+manifest.files.length+' files...');
await run('powershell.exe',['-NoProfile','-NonInteractive','-File',join(root,'scripts','create-archive.ps1'),'-SourceDirectory',stage,'-ArchiveFile',archive],{windowsHide:true,timeout:600000});
const checksum=await hash(archive);await writeFile(archive+'.sha256',checksum+'  '+name+'.zip\n');
const result={archive,sha256:checksum,bytes:(await stat(archive)).size,folder:stage,files:manifest.files.length};
await writeFile(join(release,'release.json'),JSON.stringify(result,null,2));
await writeFile(join(root,'artifacts','releases','latest.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
