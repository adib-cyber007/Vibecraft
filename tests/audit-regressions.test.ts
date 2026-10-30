import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement,createProject,createScene,makeId } from '../src/model';
import { editProject } from '../src/edit-project';
import { parseProject } from '../src/validation';
import { audioVolumeAtTime,effectiveAudioFades } from '../src/engine/timeline';
import { buildAudioFilter } from '../server/exports';
import { LocalServices } from '../server/services';

test('central edits reject duplicate/paste/draw limit violations without mutating the last valid project',()=>{
 const project=createProject({scenes:[createScene(1920,1080,{elements:Array.from({length:150},()=>createElement('shape'))})]});parseProject(project);
 for(const count of [1,150])assert.throws(()=>editProject(project,p=>p.scenes[0].elements.push(...Array.from({length:count},()=>createElement('shape')))),/150/);
 assert.equal(project.scenes[0].elements.length,150);assert.doesNotThrow(()=>parseProject(project));
 assert.throws(()=>editProject(project,p=>{p.title='x'.repeat(301);}),/300/);
 assert.throws(()=>editProject(project,p=>{p.scenes[0].duration=600;p.scenes.push(createScene());}),/10 minute/);
 const large=createProject({scenes:Array.from({length:4},()=>createScene(1920,1080,{elements:Array.from({length:125},()=>createElement('shape'))}))});
 assert.throws(()=>editProject(large,p=>p.scenes.push(createScene(1920,1080,{elements:[createElement('shape')]}))),/500/);
});
test('unchanged scene, audio and vector geometry identities survive unrelated edits',()=>{
 const project=createProject({scenes:[createScene(1920,1080,{elements:[createElement('vector',{paths:[{d:'M0 0L100 100'}]})]})]});
 const renamed=editProject(project,p=>{p.title='Renamed';});assert.equal(renamed.scenes,project.scenes);assert.equal(renamed.audio,project.audio);
 const moved=editProject(renamed,p=>{p.scenes[0].elements[0].x+=5;});assert.equal(moved.audio,renamed.audio);assert.equal(moved.scenes[0].elements[0].paths,renamed.scenes[0].elements[0].paths);assert.notEqual(moved.scenes[0],renamed.scenes[0]);
 assert.throws(()=>editProject(project,p=>{p.scenes[0].elements[0].paths=[{d:'invalid<script>'}];}));
});
test('new and changed media remain validated at the edit boundary',()=>{
 const p=createProject();assert.throws(()=>editProject(p,draft=>draft.scenes[0].elements.push(createElement('image',{src:'https://example.com/pixel.png'}))),/data URL/);
 assert.throws(()=>editProject(p,draft=>{draft.audio.push({id:makeId(),name:'Bad',src:'data:audio/wav;base64,UklGRg==',kind:'voice',start:0,trimStart:1,trimEnd:0,volume:1,fadeIn:0,fadeOut:0});}));
});
test('preview, panel and export share fade lengths after short audio trims',()=>{
 const track={id:'short-audio',name:'Short',src:'data:audio/wav;base64,UklGRg==',kind:'voice' as const,start:0,trimStart:0,trimEnd:1,volume:1,fadeIn:10,fadeOut:0};const project=createProject({audio:[track]});
 assert.deepEqual(effectiveAudioFades(track),{fadeIn:1,fadeOut:0});assert.equal(audioVolumeAtTime(project,track,0.5),0.5);assert.match(buildAudioFilter(project,1).filter,/afade=t=in:st=0:d=1/);
 track.fadeIn=0;track.fadeOut=10;assert.equal(audioVolumeAtTime(project,track,0.5),0.5);assert.equal(audioVolumeAtTime(project,track,1),0);
});
test('AI status lookup reserves the busy slot and releases it on failure',async()=>{
 const original=globalThis.fetch;let calls=0,release:()=>void=()=>{};const gate=new Promise<void>(done=>{release=done;});const service=new LocalServices('.runtime');
 globalThis.fetch=async(input)=>{if(String(input).endsWith('/api/tags')){await gate;return new Response(JSON.stringify({models:[{name:'fixture'}]}));}calls++;return new Response(JSON.stringify({response:JSON.stringify({scenes:[{title:'Title',narration:'Voice',visual:'Box'}]})}));};
 try{const first=service.generateScript({brief:'Audit first',model:'fixture'});await assert.rejects(service.generateScript({brief:'Audit second',model:'fixture'}),error=>(error as {status:number}).status===409);release();await first;assert.equal(calls,1);
  globalThis.fetch=async()=>{throw new Error('Offline');};await assert.rejects(service.generateScript({brief:'Audit third',model:'fixture'}));await assert.rejects(service.generateScript({brief:'Audit fourth',model:'fixture'}),error=>(error as {status:number}).status===503);
 }finally{release();globalThis.fetch=original;service.close();}
});
