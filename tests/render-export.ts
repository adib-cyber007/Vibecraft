import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { resolveBrowserExecutable } from '../scripts/browser-runtime.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import { createApplication } from '../server/index';
import { ChildProcesses, runCommand } from '../server/process';
import { createElement, defaultAnimation, type Project } from '../src/model';
import { makeTemplate } from '../src/templates';
import { projectDuration } from '../src/engine/timeline';
import type { ExportFormat, ExportJob } from '../server/exports';

const output = resolve('artifacts', 'renderer-export');
await mkdir(output, { recursive: true });
const owner = new ChildProcesses();
const application = await createApplication({ production: true, port: 0 });
const port = await application.listen(), base = `http://127.0.0.1:${port}`;
const browser = await chromium.launch({ headless: true, executablePath: resolveBrowserExecutable().executablePath });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const browserErrors: string[] = [];
page.on('pageerror', error => browserErrors.push(error.message));
const report: Record<string, unknown> = { testedAt: new Date().toISOString(), renderer: 'Actual built dist application at /?render=1; no synthetic bridge', status: 'running', fps: 24, expectedDuration: 4, browserErrors, exports: [], comparisons: [], audioChecks: {}, limitations: ['This is functional verification of an original implementation, not a comparison against authenticated VideoScribe.', 'Drawing hand aesthetics, speech voice quality and microphone interoperability require subjective/physical-user review.', 'The test covers a four-second fixture, not the maximum admitted ten-minute workload.', 'PNG versus MP4 pixel checks allow expected H264/YUV420 compression differences.'] };
const reportFile = join(output, 'report.json');
const saveReport = () => writeFile(reportFile, JSON.stringify(report, null, 2));

function wave(frequency: number, seconds: number): Buffer {
  const rate = 48000, samples = rate * seconds, result = Buffer.alloc(44 + samples * 2);
  result.write('RIFF', 0); result.writeUInt32LE(result.length - 8, 4); result.write('WAVEfmt ', 8); result.writeUInt32LE(16, 16); result.writeUInt16LE(1, 20); result.writeUInt16LE(1, 22); result.writeUInt32LE(rate, 24); result.writeUInt32LE(rate * 2, 28); result.writeUInt16LE(2, 32); result.writeUInt16LE(16, 34); result.write('data', 36); result.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) result.writeInt16LE(Math.round(Math.sin(i / rate * frequency * 2 * Math.PI) * 0.25 * 32767), 44 + i * 2);
  return result;
}
async function setup(target: Page, project: Project, width = 1920, height = 1080): Promise<void> {
  await target.evaluate(async ({ project, width, height }) => { await window.vibecraftRender!.setup(project, width, height); }, { project, width, height });
}
async function frame(time: number, filename: string): Promise<Buffer> {
  const base64 = await page.evaluate(async time => await window.vibecraftRender!.frame(time), time);
  const bytes = Buffer.from(base64, 'base64'); await writeFile(join(output, filename), bytes); return bytes;
}
async function api(path: string, body?: unknown): Promise<Response> {
  return await fetch(base + path, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(body) });
}
async function waitForJob(id: string, predicate: (job: ExportJob) => boolean, timeout = 120000): Promise<ExportJob> {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const response = await api(`/api/exports/${id}`); assert.equal(response.status, 200);
    const job = await response.json() as ExportJob;
    if (predicate(job)) return job;
    await new Promise(done => setTimeout(done, 80));
  }
  throw new Error(`Export ${id} did not reach the expected state within ${timeout} ms.`);
}
async function exportVideo(project: Project, format: ExportFormat, preset: 1920 | 854): Promise<{ file: string; metadata: any; job: ExportJob }> {
  const started = Date.now(), admitted = await api('/api/exports', { project, format, width: preset, fps: 24 });
  assert.equal(admitted.status, 202, await admitted.clone().text());
  const admittedJob = await admitted.json() as ExportJob;
  const job = await waitForJob(admittedJob.id, job => !['queued', 'rendering'].includes(job.status));
  assert.equal(job.status, 'complete', job.error ?? 'Actual renderer export failed.');
  assert.equal(application.manager.isBusy(), false, 'Complete must release owned browser/encoder resources.');
  const download = await api(job.downloadUrl!); assert.equal(download.status, 200, download.ok ? 'Download ready' : `${job.downloadUrl}: ${await download.text()}; local=${application.manager.file(job.id)}`);
  const bytes = Buffer.from(await download.arrayBuffer()), file = join(output, `actual-renderer.${format}`);
  await writeFile(file, bytes);
  const metadata = JSON.parse(await runCommand(owner, 'ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_name,codec_type,width,height,nb_read_frames,r_frame_rate,channels,sample_rate', '-show_entries', 'format=duration,size', '-of', 'json', file]));
  const video = metadata.streams.find((stream: any) => stream.codec_type === 'video'), audio = metadata.streams.filter((stream: any) => stream.codec_type === 'audio');
  assert.equal(video.width, preset); assert.equal(video.height, preset === 1920 ? 1080 : 480);
  assert.equal(video.codec_name, format === 'mp4' ? 'h264' : format === 'webm' ? 'vp9' : 'gif');
  assert.equal(Number(video.nb_read_frames), 96, `${format} must include all deterministic frames.`);
  assert.ok(Math.abs(Number(metadata.format.duration) - 4) < 0.15, `${format} duration must match the project.`);
  assert.equal(audio.length, format === 'gif' ? 0 : 1);
  if (audio.length) assert.equal(audio[0].codec_name, format === 'mp4' ? 'aac' : 'opus');
  const record = { format, file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), elapsedMs: Date.now() - started, job, metadata };
  (report.exports as unknown[]).push(record); await saveReport();
  return { file, metadata, job };
}
async function comparePng(reference: Buffer, actual: Buffer): Promise<{ meanAbsoluteError: number; rootMeanSquareError: number; psnr: number; changedPixelFraction: number; largeErrorFraction: number }> {
  // Raw browser function avoids tsx's Node-only __name transform in nested helpers.
  const compare = `async ({ a, b }) => {
    const get = async (base64) => { const image = new Image(); image.src = 'data:image/png;base64,' + base64; await image.decode(); const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height; const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0); return { width: image.width, height: image.height, data: ctx.getImageData(0, 0, image.width, image.height).data }; };
    const expected = await get(a), actual = await get(b); if (expected.width !== actual.width || expected.height !== actual.height) throw new Error('Compared frame sizes differ.');
    let absolute = 0, squared = 0, changed = 0, large = 0;
    for (let i = 0; i < expected.data.length; i += 4) { let pixelError = 0; for (let channel = 0; channel < 3; channel++) { const difference = Math.abs(expected.data[i + channel] - actual.data[i + channel]); absolute += difference; squared += difference ** 2; pixelError = Math.max(pixelError, difference); } if (pixelError > 2) changed++; if (pixelError > 24) large++; }
    const pixels = expected.width * expected.height, mse = squared / (pixels * 3);
    return { meanAbsoluteError: absolute / (pixels * 3), rootMeanSquareError: Math.sqrt(mse), psnr: mse ? 10 * Math.log10(255 ** 2 / mse) : 100, changedPixelFraction: changed / pixels, largeErrorFraction: large / pixels };
  }`;
  return await page.evaluate('(' + compare + ')(' + JSON.stringify({ a: reference.toString('base64'), b: actual.toString('base64') }) + ')');
}
function rms(samples: Float32Array, start: number, end: number): number { let sum = 0, n = 0; for (let i = Math.floor(start * 48000); i < Math.min(samples.length, end * 48000); i++) { sum += samples[i] ** 2; n++; } return Math.sqrt(sum / Math.max(n, 1)); }
function magnitude(samples: Float32Array, frequency: number, start: number, end: number): number { let real = 0, imaginary = 0, n = 0; for (let i = Math.floor(start * 48000); i < Math.min(samples.length, end * 48000); i++) { const phase = i / 48000 * frequency * 2 * Math.PI; real += samples[i] * Math.cos(phase); imaginary += samples[i] * Math.sin(phase); n++; } return Math.hypot(real, imaginary) * 2 / Math.max(1, n); }

try {
  await page.goto(`${base}/?render=1`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.vibecraftRender));
  const raster = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 120; const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#e5b647'; ctx.fillRect(0, 0, 160, 120); ctx.fillStyle = '#25364a'; ctx.beginPath(); ctx.arc(80, 60, 34, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(72, 37, 16, 46); return canvas.toDataURL('image/png'); });
  const project = makeTemplate('idea'); project.title = 'Actual renderer verification'; project.scenes = project.scenes.slice(0, 2);
  project.scenes.forEach((scene, index) => {
    scene.name = `Verification scene ${index + 1}`; scene.duration = 2; scene.transition = index ? 'pan' : 'cut'; scene.transitionDuration = 0.5;
    scene.elements = scene.elements.slice(0, index ? 4 : 3);
    scene.elements.forEach((element, elementIndex) => { element.animation = { ...defaultAnimation(), start: elementIndex * 0.15, draw: 0.55, hold: 0.2, exit: 0, hand: elementIndex % 2 ? 'pen' : 'marker' }; if (element.type === 'text') { element.fontFamily = 'Verification Manrope'; element.fontSize = Math.min(75, element.fontSize ?? 60); } });
  });
  project.scenes[1].camera = { x: 1060, y: 560, zoom: 0.94 };
  project.scenes[0].cameras = [
    {id:'camera-start',name:'Starting view',start:0,duration:0,pause:0,camera:{...project.scenes[0].camera},easing:'none',locked:false,pinned:false},
    {id:'camera-detail',name:'Detail view',start:0.75,duration:0.75,pause:0.2,camera:{x:1020,y:565,zoom:1.12},easing:'linear',locked:true,pinned:true},
  ];
  const importedSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100"><rect x="2" y="2" width="156" height="96" rx="12" fill="#507565"/><path d="M30 50L65 78L130 25" fill="none" stroke="#ffffff" stroke-width="10"/></svg>';
  project.scenes[0].elements.push(createElement('image', { name: 'Imported verification SVG', src: `data:image/svg+xml;base64,${Buffer.from(importedSvg).toString('base64')}`, x: 1390, y: 740, width: 220, height: 138, animation: { ...defaultAnimation(), start: 0.45, draw: 0.4, hold: 0.2 } }));
  project.scenes[1].elements.push(createElement('image', { name: 'Imported verification PNG', src: raster, x: 1400, y: 740, width: 230, height: 172.5, animation: { ...defaultAnimation(), start: 0.4, draw: 0.45, hold: 0.2, entrance: 'fade', hand: 'none' } }));
  const fontFile = resolve('node_modules', '@fontsource', 'manrope', 'files', 'manrope-latin-700-normal.woff2');
  project.fonts = [{ family: 'Verification Manrope', src: `data:font/woff2;base64,${(await readFile(fontFile)).toString('base64')}` }];
  project.audio = [
    { id: 'project-tone', name: 'Known 330 Hz project PCM', src: `data:audio/wav;base64,${wave(330, 2).toString('base64')}`, kind: 'music', start: 0.25, trimStart: 0.2, trimEnd: 1.7, volume: 0.4, fadeIn: 0.15, fadeOut: 0.15 },
    { id: 'scene-tone', name: 'Known 880 Hz scene PCM', src: `data:audio/wav;base64,${wave(880, 2).toString('base64')}`, kind: 'voice', start: 0.4, trimStart: 0.3, trimEnd: 1.5, volume: 0.5, fadeIn: 0.1, fadeOut: 0.2, sceneId: project.scenes[1].id },
  ];
  assert.equal(projectDuration(project), 4); report.fixture = { scenes: 2, importedSVG: true, importedRaster: true, customEmbeddedFont: true, originalVectors: true, multilineText: true, cameraPan: true, cameraKeyframes: true, fadeVariant: true, projectAudioStart: 0.25, sceneAudioAbsoluteStart: 2.4 };
  await writeFile(join(output, 'fixture-pan.vibecraft'), JSON.stringify(project));
  await setup(page, project);
  const times = [0.25, 1.125, 1.5, 2 + 4 / 24, 3.5];
  const referenceFrames: Buffer[] = [];
  for (const [index, time] of times.entries()) referenceFrames.push(await frame(time, `preview-${index}.png`));
  const changed = await comparePng(referenceFrames[0], referenceFrames[1]); assert.ok(changed.changedPixelFraction > 0.005, 'Drawing progression must visibly change the actual canvas.'); report.drawingProgression = changed;
  const repeated = await frame(times[1], 'preview-repeat.png'); assert.equal(createHash('sha256').update(repeated).digest('hex'), createHash('sha256').update(referenceFrames[1]).digest('hex'), 'Same project/time must produce identical PNG frames.'); report.deterministicSameTime = true;
  const mp4 = await exportVideo(project, 'mp4', 1920);
  for (const [index, time] of times.entries()) {
    const decoded = join(output, `mp4-frame-${index}.png`), number = Math.round(time * 24);
    await runCommand(owner, 'ffmpeg', ['-v', 'error', '-y', '-i', mp4.file, '-vf', `select=eq(n\\,${number})`, '-fps_mode', 'passthrough', '-frames:v', '1', decoded]);
    const comparison = await comparePng(referenceFrames[index], await readFile(decoded));
    assert.ok(comparison.meanAbsoluteError < 3, `MP4 frame ${number} has excessive mean pixel error: ${comparison.meanAbsoluteError}`);
    assert.ok(comparison.psnr > 30, `MP4 frame ${number} has low PSNR: ${comparison.psnr}`);
    assert.ok(comparison.largeErrorFraction < 0.025, `MP4 frame ${number} differs strongly from preview.`);
    (report.comparisons as unknown[]).push({ frame: number, time, ...comparison });
  }
  const pcmFile = join(output, 'decoded-audio.f32le');
  await runCommand(owner, 'ffmpeg', ['-v', 'error', '-y', '-i', mp4.file, '-vn', '-ac', '1', '-ar', '48000', '-f', 'f32le', pcmFile]);
  const pcm = await readFile(pcmFile), samples = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.length / 4);
  const audioChecks = { preStartRms: rms(samples, 0.02, 0.15), projectSignalRms: rms(samples, 0.6, 1.3), projectFadeInRms: rms(samples, 0.26, 0.30), projectFadeOutRms: rms(samples, 1.69, 1.73), betweenTracksRms: rms(samples, 2.05, 2.25), sceneSignalRms: rms(samples, 2.7, 3.2), sceneFadeInRms: rms(samples, 2.41, 2.44), sceneFadeOutRms: rms(samples, 3.5, 3.56), afterTrimRms: rms(samples, 3.8, 3.95), project330: magnitude(samples, 330, 0.6, 1.3), project880: magnitude(samples, 880, 0.6, 1.3), scene330: magnitude(samples, 330, 2.7, 3.2), scene880: magnitude(samples, 880, 2.7, 3.2) };
  report.audioChecks = audioChecks;
  assert.ok(audioChecks.preStartRms < 0.002 && audioChecks.betweenTracksRms < 0.002 && audioChecks.afterTrimRms < 0.002, 'Trimmed/delayed audio must be silent outside its intervals.');
  assert.ok(audioChecks.projectSignalRms > 0.02 && audioChecks.sceneSignalRms > 0.02);
  assert.ok(audioChecks.projectFadeInRms < audioChecks.projectSignalRms * 0.5 && audioChecks.projectFadeOutRms < audioChecks.projectSignalRms * 0.5, 'Project audio must fade at its trimmed boundaries.');
  assert.ok(audioChecks.sceneFadeInRms < audioChecks.sceneSignalRms * 0.5 && audioChecks.sceneFadeOutRms < audioChecks.sceneSignalRms * 0.5, 'Scene audio must fade at its trimmed boundaries.');
  assert.ok(Math.abs(audioChecks.project330 - 0.1) < 0.01 && Math.abs(audioChecks.scene880 - 0.125) < 0.01, 'User gain must survive encoding without limiter auto gain.');
  assert.ok(audioChecks.project330 > audioChecks.project880 * 10 && audioChecks.scene880 > audioChecks.scene330 * 10, 'Scene-local audio must play the expected signal at its absolute start.'); report.audioChecks = audioChecks;
  const fadeProject = structuredClone(project); fadeProject.scenes[1].transition = 'fade';
  await writeFile(join(output, 'fixture-fade.vibecraft'), JSON.stringify(fadeProject));
  await setup(page, fadeProject, 854, 480);
  const fadeReference = await frame(2.25, 'fade-transition-preview.png');
  const gif = await exportVideo(fadeProject, 'gif', 854);
  const gifFrame = join(output, 'gif-fade-frame.png');
  await runCommand(owner, 'ffmpeg', ['-v', 'error', '-y', '-i', gif.file, '-vf', 'select=eq(n\\,54)', '-fps_mode', 'passthrough', '-frames:v', '1', gifFrame]);
  const gifComparison = await comparePng(fadeReference, await readFile(gifFrame));
  assert.ok(gifComparison.meanAbsoluteError < 5 && gifComparison.psnr > 25, 'GIF transition frame must match the actual renderer within palette quantization.');
  (report.comparisons as unknown[]).push({ format: 'gif', frame: 54, time: 2.25, ...gifComparison });
  const webm = await exportVideo(project, 'webm', 854);
  await setup(page, project, 854, 480);
  const webmReference = await frame(3.5, 'webm-preview.png'), webmFrame = join(output, 'webm-frame.png');
  await runCommand(owner, 'ffmpeg', ['-v', 'error', '-y', '-i', webm.file, '-vf', 'select=eq(n\\,84)', '-fps_mode', 'passthrough', '-frames:v', '1', webmFrame]);
  const webmComparison = await comparePng(webmReference, await readFile(webmFrame));
  assert.ok(webmComparison.meanAbsoluteError < 5 && webmComparison.psnr > 30, 'WebM frame must match the actual renderer within encoding tolerance.');
  (report.comparisons as unknown[]).push({ format: 'webm', frame: 84, time: 3.5, ...webmComparison });
  const invalid = structuredClone(project); invalid.scenes[0].elements.find(element => element.type === 'image')!.src = 'data:image/png;base64,YmFkLWltYWdl';
  const invalidAdmission = await api('/api/exports', { project: invalid, format: 'mp4', width: 854, fps: 24 }); assert.equal(invalidAdmission.status, 202);
  const invalidJob = await invalidAdmission.json() as ExportJob, failed = await waitForJob(invalidJob.id, job => job.status === 'failed');
  assert.match(failed.error ?? '', /decode|image|source/i); assert.equal((await api(`/api/exports/${failed.id}/file`)).status, 404);
  while (application.manager.isBusy()) await new Promise(done => setTimeout(done, 50));
  report.renderFailure = { status: failed.status, error: failed.error, noDownload: true };
  const longProject = structuredClone(project); longProject.scenes[1].duration = 20;
  const cancellationAdmission = await api('/api/exports', { project: longProject, format: 'mp4', width: 1920, fps: 24 }); assert.equal(cancellationAdmission.status, 202);
  const cancellationJob = await cancellationAdmission.json() as ExportJob;
  await waitForJob(cancellationJob.id, job => job.status === 'rendering' && job.progress > 0);
  assert.equal((await api('/api/exports', { project, format: 'mp4', width: 854, fps: 24 })).status, 409);
  const cancel = await api(`/api/exports/${cancellationJob.id}/cancel`, {}); assert.equal(cancel.status, 200);
  const cancelled = await waitForJob(cancellationJob.id, job => job.status === 'cancelled');
  while (application.manager.isBusy()) await new Promise(done => setTimeout(done, 50));
  assert.equal((await api(`/api/exports/${cancelled.id}/file`)).status, 404);
  report.cancellation = { status: cancelled.status, activeSlotReleased: !application.manager.isBusy(), noDownload: true };
  assert.deepEqual(browserErrors, []);
  report.status = 'passed';
  console.log(JSON.stringify({ status: 'passed', report: reportFile, formats: ['1080p H264/AAC MP4', '480p GIF', '480p VP9/Opus WebM'], deterministicPreview: true, audioTiming: true, cancellation: true }));
} catch (error) {
  report.status = 'failed'; report.error = (error as Error).stack; process.exitCode = 1; console.error((error as Error).stack);
} finally {
  await saveReport(); owner.killAll(); await browser.close(); await application.close();
}
