import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, createProject, createScene } from '../src/model';
import { assertSafeSvg, decodeDataUrl, parseProject } from '../src/validation';
import { buildAudioFilter, exportDimensions } from '../server/exports';
import { createApplication } from '../server/index';
import { LocalServices } from '../server/services';
import { request as httpRequest } from 'node:http';
import { createServer } from 'node:http';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ExportManager } from '../server/exports';
import { ChildProcesses, runCommand } from '../server/process';

const svgUrl = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

test('portable stop requests require the owning session token and retain localhost protections', async () => {
  const application=await createApplication({editor:false,port:0,session:{id:'portable-fixture',stopToken:'owned-token'}});
  const port=await application.listen(),base=`http://127.0.0.1:${port}`;
  try{
    const health=await(await fetch(base+'/api/health')).json();
    assert.equal(health.app,'vibecraft');assert.equal(health.sessionId,'portable-fixture');assert.equal('stopToken' in health,false);
    const stop=(token:string,origin=base)=>fetch(base+'/api/session/stop',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({token})});
    assert.equal((await stop('wrong-token')).status,403);
    assert.equal((await stop('owned-token','https://example.com')).status,403);
    assert.equal((await fetch(base+'/api/health')).status,200);
    const accepted=await stop('owned-token');assert.equal(accepted.status,202);assert.deepEqual(await accepted.json(),{stopping:true});
    const until=Date.now()+10000;let stopped=false;
    while(Date.now()<until){try{await fetch(base+'/api/health',{signal:AbortSignal.timeout(500)});}catch{stopped=true;break;}await new Promise(done=>setTimeout(done,75));}
    assert.equal(stopped,true,'The owned server must shut down after acknowledging stop.');
  }finally{await application.close();await application.close();}
});

test('development and source sessions do not expose the portable shutdown route',async()=>{
  const application=await createApplication({editor:false,port:0});const port=await application.listen();
  try{assert.equal((await fetch(`http://127.0.0.1:${port}/api/session/stop`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'anything'})})).status,404);}
  finally{await application.close();}
});

test('portable project validation preserves safe assets and rejects active or remote resources', () => {
  const project = createProject();
  project.scenes[0].elements.push(createElement('image', { src: svgUrl('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L10 10"/></svg>') }));
  assert.equal(parseProject(project).scenes[0].elements.length, 1);
  const invalid = structuredClone(project);
  invalid.scenes[0].elements[0].src = 'https://example.com/tracker.png';
  assert.throws(() => parseProject(invalid), /data URL/);
  invalid.scenes[0].elements[0].src = svgUrl('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><path d="M0 0"/></svg>');
  assert.throws(() => parseProject(invalid), /active content/);
  for (const svg of [
    '<svg><script>alert(1)</script></svg>',
    '<svg><foreignObject><div/></foreignObject></svg>',
    '<svg><use href="https://example.com/a.svg#x"/></svg>',
    '<svg><path fill="url(https://example.com/track)"/></svg>',
    '<svg><style>@import "https://example.com/style";</style></svg>',
    '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///C:/secret">]><svg/>',
    '<svg><use href="&#106;avascript:alert(1)"/></svg>',
    '<svg><animate attributeName="href" to="https://example.com"/></svg>',
  ]) assert.throws(() => assertSafeSvg(svg));
  assert.doesNotThrow(() => assertSafeSvg('<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="a"><stop offset="0" stop-color="#fff"/></linearGradient></defs><path d="M0 0L10 10" fill="url(#a)" transform="translate(1 2)"/></svg>'));
});

test('project validation rejects nonfinite geometry, duplicate identities, missing scenes and excessive duration', () => {
  const project = createProject();
  project.scenes[0].camera.zoom = Infinity;
  assert.throws(() => parseProject(project));
  project.scenes[0].camera.zoom = 1;
  const element = createElement('shape');
  project.scenes[0].elements = [element, structuredClone(element)];
  assert.throws(() => parseProject(project), /Duplicate/);
  project.scenes[0].elements = [];
  project.audio = [{ id: 'audio1', name: 'Missing scene', src: 'data:audio/wav;base64,UklGRg==', kind: 'voice', start: 0, trimStart: 0, trimEnd: 1, volume: 1, fadeIn: 0, fadeOut: 0, sceneId: 'missing' }];
  assert.throws(() => parseProject(project), /missing scene/);
  project.audio = [];
  project.scenes = [createScene(1920, 1080, { duration: 400 }), createScene(1920, 1080, { duration: 400 })];
  assert.throws(() => parseProject(project), /10 minute/);
});

test('asset decoder rejects invalid MIME, padding and empty resources', () => {
  for (const src of ['data:text/html;base64,PHNjcmlwdD4=', 'data:image/png;base64,', 'data:image/png;base64,AAA', 'file:///C:/image.png']) assert.throws(() => decodeDataUrl(src, 'image'));
  assert.equal(decodeDataUrl('data:audio/webm;codecs=opus;base64,UklGRg==', 'audio').bytes.byteLength, 4);
});

test('audio render timing uses scene start and source trims, without normalizing away user volume', () => {
  const project = createProject({ scenes: [createScene(1920, 1080, { id: 'first', duration: 3 }), createScene(1920, 1080, { id: 'second', duration: 5 })] });
  project.audio = [{ id: 'audio', name: 'Narration', src: 'data:audio/wav;base64,UklGRg==', kind: 'voice', start: 1.25, trimStart: 2, trimEnd: 6, volume: 0.4, fadeIn: 0.2, fadeOut: 0.5, sceneId: 'second' }];
  const mix = buildAudioFilter(project, 8);
  assert.match(mix.filter, /atrim=start=2:end=6,asetpts=PTS-STARTPTS,volume=0.4/);
  assert.match(mix.filter, /afade=t=out:st=3.5:d=0.5/);
  assert.match(mix.filter, /adelay=4250:all=1/);
  assert.match(mix.filter, /adelay=4250:all=1,asetpts=N\/SR\/TB/);
  assert.match(mix.filter, /alimiter=limit=0.95:level=0/);
  assert.match(mix.filter, /normalize=0/);
  assert.deepEqual(mix.inputs, ['[a0]']);
  assert.deepEqual(buildAudioFilter(createProject(), 8), { filter: '', inputs: [] });
});

test('resolution presets keep landscape, portrait and square below the 1080p pixel budget', () => {
  assert.deepEqual(exportDimensions(createProject(), 1920), { width: 1920, height: 1080 });
  assert.deepEqual(exportDimensions(createProject({ width: 1080, height: 1920 }), 1920), { width: 1080, height: 1920 });
  assert.deepEqual(exportDimensions(createProject({ width: 1080, height: 1080 }), 1280), { width: 720, height: 720 });
});

test('local API rejects foreign origins, DNS-rebinding hosts and unsafe content types', async () => {
  const application = await createApplication({ port: 0, editor: false });
  const port = await application.listen();
  const base = `http://127.0.0.1:${port}`;
  try {
    assert.equal((await fetch(`${base}/api/exports`, { method: 'POST', headers: { Origin: 'https://example.com', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
    const reboundStatus = await new Promise<number>(resolve => { const req = httpRequest(`${base}/api/exports`, { method: 'POST', headers: { Host: 'evil.example', 'Content-Type': 'application/json' } }, response => { response.resume(); resolve(response.statusCode!); }); req.end('{}'); });
    assert.equal(reboundStatus, 403);
    assert.equal((await fetch(`${base}/api/exports`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' })).status, 415);
    const invalid = await fetch(`${base}/api/exports`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ project: createProject(), format: 'exe', width: 1920, fps: 30 }) });
    assert.equal(invalid.status, 400);
    assert.match((await invalid.json()).error, /format/);
    assert.equal((await fetch(`${base}/api/exports/not-found`)).status, 404);
  } finally { await application.close(); }
});

test('Windows speech uses an installed voice and returns real WAV audio', { skip: process.platform !== 'win32' }, async () => {
  const services = new LocalServices('.runtime/test-speech');
  try {
    const voices = await services.voices();
    assert.ok(voices.length > 0, 'At least one installed Windows speech voice is required.');
    const wav = await services.speak({ text: 'A clear idea starts with a simple drawing.', voice: voices[0].name, rate: 0 });
    assert.equal(wav.subarray(0, 4).toString(), 'RIFF');
    assert.ok(wav.length > 1000);
  } finally { services.close(); }
});

test('real FFmpeg export accepts deterministic synthetic PNG frames and mixes trimmed audio', { timeout: 60000 }, async () => {
  const directory = resolve('.runtime', 'test-exports', randomUUID()), owner = new ChildProcesses();
  await mkdir(directory, { recursive: true });
  const renderer = createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><canvas id="canvas"></canvas><script>window.vibecraftRender={setup:async(p,w,h)=>{canvas.width=w;canvas.height=h;},frame:async(t)=>{const c=canvas.getContext("2d");c.fillStyle="white";c.fillRect(0,0,canvas.width,canvas.height);c.fillStyle="#2579aa";c.fillRect(30+t*100,30,150,150);return canvas.toDataURL("image/png").split(",")[1];}}</script>');
  });
  await new Promise<void>(done => renderer.listen(0, '127.0.0.1', done));
  const port = (renderer.address() as { port: number }).port;
  const manager = new ExportManager(directory, () => `http://127.0.0.1:${port}`);
  try {
    const wav = join(directory, 'tone.wav');
    await runCommand(owner, 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:a', 'pcm_s16le', wav]);
    const project = createProject({ scenes: [createScene(1920, 1080, { duration: 1.5 })] });
    project.audio.push({ id: 'test-audio', name: 'Synthetic tone', src: `data:audio/wav;base64,${(await readFile(wav)).toString('base64')}`, kind: 'music', start: 0.25, trimStart: 0.25, trimEnd: 1.25, volume: 0.4, fadeIn: 0.1, fadeOut: 0.1 });
    const request = { project, format: 'mp4', width: 854, fps: 24 };
    const job = await manager.admit(request);
    await assert.rejects(manager.admit(request), /already running/);
    while (['queued', 'rendering'].includes(manager.get(job.id)!.status)) await new Promise(done => setTimeout(done, 50));
    const result = manager.get(job.id)!;
    assert.equal(result.status, 'complete', result.error ?? 'Export did not complete.');
    const metadata = JSON.parse(await runCommand(owner, 'ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_name,codec_type,width,height,nb_read_frames', '-show_entries', 'format=duration', '-of', 'json', manager.file(job.id)!]));
    const video = metadata.streams.find((stream: { codec_type: string }) => stream.codec_type === 'video');
    assert.equal(video.codec_name, 'h264'); assert.equal(video.width, 854); assert.equal(video.height, 480); assert.equal(Number(video.nb_read_frames), 36);
    assert.ok(metadata.streams.some((stream: { codec_name: string }) => stream.codec_name === 'aac'));
    assert.ok(Math.abs(Number(metadata.format.duration) - 1.5) < 0.08);
    const cancelled = await manager.admit(request);
    assert.equal(await manager.cancel(cancelled.id), true);
    assert.equal(manager.get(cancelled.id)!.status, 'cancelled');
  } finally {
    await manager.close(); owner.killAll();
    await new Promise<void>(done => renderer.close(() => done()));
    await rm(directory, { recursive: true, force: true });
  }
});
