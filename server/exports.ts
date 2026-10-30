import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { once } from 'node:events';
import { z } from 'zod';
import type { Browser, BrowserContext } from 'playwright';
import type { Project } from '../src/model';
import { audioTrackDuration, audioTrackStart, projectDuration, effectiveAudioFades } from '../src/engine/timeline';
import { decodeDataUrl, parseProject } from '../src/validation';
import { ChildProcesses, runCommand } from './process';
import { resolveBrowserExecutable } from '../scripts/browser-runtime.mjs';

export type ExportFormat = 'mp4' | 'webm' | 'gif';
export interface ExportJob { id: string; status: 'queued' | 'rendering' | 'complete' | 'failed' | 'cancelled'; progress: number; error?: string; downloadUrl?: string; width: number; height: number; duration: number; format: ExportFormat; }
interface InternalJob extends ExportJob { directory: string; file: string; owner: ChildProcesses; browser?: Browser; context?: BrowserContext; cancel: boolean; }
async function withTimeout<T>(operation: Promise<T>, milliseconds: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([operation, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); })]); }
  finally { clearTimeout(timer); }
}
const exportSchema = z.object({ project: z.unknown(), format: z.enum(['mp4', 'webm', 'gif']), width: z.union([z.literal(1920), z.literal(1280), z.literal(854)]), fps: z.union([z.literal(24), z.literal(30)]) }).strict();
export function exportDimensions(project: Project, preset: number): { width: number; height: number } {
  const short = preset === 1920 ? 1080 : preset === 1280 ? 720 : 480;
  return project.width === project.height ? { width: short, height: short } : project.width > project.height ? { width: preset, height: short } : { width: short, height: preset };
}

/** Input zero is the deterministic PNG stream; audio inputs begin at one. */
export function buildAudioFilter(project: Project, duration: number): { filter: string; inputs: string[] } {
  const filters: string[] = [], inputs: string[] = [];
  project.audio.forEach((track, index) => {
    const length = audioTrackDuration(track), {fadeIn,fadeOut} = effectiveAudioFades(track);
    const stages = [`atrim=start=${track.trimStart}:end=${track.trimEnd}`, 'asetpts=PTS-STARTPTS', `volume=${track.volume}`];
    if (fadeIn > 0) stages.push(`afade=t=in:st=0:d=${fadeIn}`);
    if (fadeOut > 0) stages.push(`afade=t=out:st=${Math.max(0, length - fadeOut)}:d=${fadeOut}`);
    const delay = Math.round(audioTrackStart(project, track) * 1000);
    // adelay inserts samples; regenerate timestamps from the emitted sample
    // count so amix cannot align a delayed stream using stale trimmed PTS.
    stages.push(`adelay=${delay}:all=1`, 'asetpts=N/SR/TB', 'apad', `atrim=duration=${duration}`);
    filters.push(`[${index + 1}:a]${stages.join(',')}[a${index}]`);
    inputs.push(`[a${index}]`);
  });
  if (inputs.length) filters.push(`${inputs.join('')}amix=inputs=${inputs.length}:duration=longest:dropout_transition=0:normalize=0,alimiter=limit=0.95:level=0:latency=1[mixed]`);
  return { filter: filters.join(';'), inputs };
}

export class ExportManager {
  private jobs = new Map<string, InternalJob>();
  private active?: InternalJob;
  private tasks = new Set<Promise<void>>();
  private stopping = false;
  constructor(private root: string, private baseUrl: () => string) {}
  get(id: string): ExportJob | undefined {
    const job = this.jobs.get(id);
    if (!job) return;
    const { directory: _directory, file: _file, owner: _owner, browser: _browser, context: _context, cancel: _cancel, ...visible } = job;
    return visible;
  }
  file(id: string): string | undefined { const job = this.jobs.get(id); return job?.status === 'complete' ? job.file : undefined; }
  isBusy(): boolean { return Boolean(this.active) || this.stopping; }
  async admit(input: unknown): Promise<ExportJob> {
    if (this.isBusy()) throw Object.assign(new Error('An export is already running. Wait or cancel it first.'), { status: 409 });
    const request = exportSchema.parse(input), project = parseProject(request.project);
    const duration = projectDuration(project), frames = Math.ceil(duration * request.fps), dimensions = exportDimensions(project, request.width);
    if (frames > 18000 || dimensions.width * dimensions.height > 1920 * 1080) throw new Error('Export exceeds the frame or resolution limit.');
    const id = randomUUID(), directory = join(this.root, 'exports', id);
    const job: InternalJob = { id, status: 'queued', progress: 0, ...dimensions, duration, format: request.format, directory, file: join(directory, `video.${request.format}`), owner: new ChildProcesses(), cancel: false };
    // Reserve before awaiting filesystem work: concurrent admission cannot race.
    this.active = job;
    this.jobs.set(id, job);
    try { await mkdir(directory, { recursive: true }); } catch (error) { this.active = undefined; this.jobs.delete(id); throw error; }
    const task = this.render(job, project, request.fps).finally(() => this.tasks.delete(task));
    this.tasks.add(task);
    return this.get(id)!;
  }
  async cancel(id: string): Promise<boolean> {
    const job = this.jobs.get(id);
    if (!job || !['queued', 'rendering'].includes(job.status)) return false;
    job.cancel = true;
    job.status = 'cancelled';
    job.owner.killAll();
    await job.context?.close().catch(() => {});
    await job.browser?.close().catch(() => {});
    return true;
  }
  async close(): Promise<void> {
    this.stopping = true;
    if (this.active) await this.cancel(this.active.id);
    await Promise.allSettled(this.tasks);
  }
  private async render(job: InternalJob, project: Project, fps: number): Promise<void> {
    let stderr = '';
    let outputReady = false;
    const timeout = setTimeout(() => { job.error = 'Export exceeded its 15 minute time limit.'; job.owner.killAll(); void job.browser?.close(); }, 15 * 60 * 1000);
    try {
      await runCommand(job.owner, 'ffmpeg', ['-version']);
      if (job.cancel) return;
      job.status = 'rendering';
      const { chromium } = await import('playwright');
      job.browser = await chromium.launch({ headless: true, executablePath: resolveBrowserExecutable().executablePath });
      if (job.cancel) return;
      job.context = await job.browser.newContext({ viewport: { width: job.width, height: job.height }, deviceScaleFactor: 1 });
      const origin = new URL(this.baseUrl()).origin;
      await job.context.route('**/*', route => { const url = new URL(route.request().url()); return url.origin === origin || ['data:', 'blob:'].includes(url.protocol) ? route.continue() : route.abort(); });
      const page = await job.context.newPage();
      page.setDefaultTimeout(30000);
      await page.goto(`${origin}/?render=1`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => Boolean((window as unknown as { vibecraftRender?: unknown }).vibecraftRender), undefined, { timeout: 60000 });
      await page.evaluate(async ({ project, width, height }) => {
        const bridge = (window as unknown as { vibecraftRender: { setup(p: unknown, w: number, h: number): Promise<void> } }).vibecraftRender;
        await bridge.setup(project, width, height);
      }, { project, width: job.width, height: job.height });
      const args = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-vcodec', 'png', '-framerate', String(fps), '-i', 'pipe:0'];
      if (job.format !== 'gif') {
        for (let index = 0; index < project.audio.length; index++) {
          const audio = decodeDataUrl(project.audio[index].src, 'audio');
          const file = join(job.directory, `audio-${index}.bin`);
          await writeFile(file, audio.bytes);
          args.push('-i', file);
        }
        const audio = buildAudioFilter(project, job.duration);
        if (audio.filter) args.push('-filter_complex', audio.filter, '-map', '0:v:0', '-map', '[mixed]');
        else args.push('-map', '0:v:0', '-an');
      }
      if (job.format === 'mp4') args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart');
      if (job.format === 'webm') args.push('-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '6', '-crf', '28', '-b:v', '0', '-pix_fmt', 'yuv420p', '-c:a', 'libopus');
      // Per-frame palettes keep the PNG pipe streaming instead of retaining every
      // frame until a whole-video palette becomes available at end of input.
      if (job.format === 'gif') args.push('-vf', 'split[a][b];[a]palettegen=max_colors=128:stats_mode=single[p];[b][p]paletteuse=new=1:dither=bayer', '-loop', '0');
      args.push('-t', String(job.duration), job.file);
      const child = job.owner.spawn('ffmpeg', args);
      child.stdout?.resume();
      child.stderr?.on('data', data => { stderr = (stderr + data.toString()).slice(-12000); });
      const completion = new Promise<void>((resolve, reject) => {
        child.once('error', reject);
        child.once('close', code => code === 0 ? resolve() : reject(new Error(stderr || `FFmpeg exited with code ${code}.`)));
      });
      // Register a handler immediately; rejection is still awaited after frame feeding.
      void completion.catch(() => {});
      child.stdin?.on('error', () => {});
      const frameCount = Math.ceil(job.duration * fps);
      for (let index = 0; index < frameCount; index++) {
        if (job.cancel) throw new Error('Export cancelled.');
        const base64 = await withTimeout(page.evaluate(async time => await (window as unknown as { vibecraftRender: { frame(t: number): Promise<string> } }).vibecraftRender.frame(time), index / fps), 30000, 'A render frame exceeded 30 seconds.');
        if (typeof base64 !== 'string' || base64.length > 30_000_000) throw new Error('Renderer returned an invalid frame.');
        const bytes = Buffer.from(base64.replace(/^data:image\/png;base64,/, ''), 'base64');
        if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Renderer frame is not a PNG.');
        if (!child.stdin || child.stdin.destroyed) throw new Error(stderr || 'Video encoder stopped accepting frames.');
        if (!child.stdin.write(bytes)) await Promise.race([once(child.stdin, 'drain'), completion.then(() => { throw new Error('Video encoder ended before all frames.'); })]);
        job.progress = Math.min(0.98, (index + 1) / frameCount * 0.98);
      }
      child.stdin?.end();
      await completion;
      if (job.cancel) return;
      const output = await stat(job.file);
      if (!output.size) throw new Error('The video encoder produced an empty file.');
      outputReady = true;
    } catch (error) {
      if (!job.cancel) { job.status = 'failed'; job.error = job.error ?? (error as Error).message; }
      await rm(job.file, { force: true }).catch(() => {});
    } finally {
      clearTimeout(timeout);
      job.owner.killAll();
      await job.context?.close().catch(() => {});
      await job.browser?.close().catch(() => {});
      for (let index = 0; index < project.audio.length; index++) await rm(join(job.directory, `audio-${index}.bin`), { force: true }).catch(() => {});
      if (job.cancel || !outputReady) await rm(job.file, { force: true }).catch(() => {});
      if (this.active === job) this.active = undefined;
      // Completion promises both a usable file and a released encoder/browser slot.
      if (outputReady && !job.cancel) { job.status = 'complete'; job.progress = 1; job.downloadUrl = `/api/exports/${job.id}/file`; }
    }
  }
}
