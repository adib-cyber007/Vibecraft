import express, { type Request, type Response, type NextFunction } from 'express';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { ExportManager } from './exports';
import { ChildProcesses, runCommand } from './process';
import { LocalServices } from './services';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function requireLocalOrigin(req: Request, res: Response, next: NextFunction): void {
  const host = req.headers.host ?? '';
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) { res.status(403).json({ error: 'Only localhost requests are accepted.' }); return; }
  const origin = req.headers.origin;
  if (origin && origin !== `http://${host}`) { res.status(403).json({ error: 'Cross-origin requests are not accepted.' }); return; }
  if (req.headers['sec-fetch-site'] === 'cross-site') { res.status(403).json({ error: 'Cross-site requests are not accepted.' }); return; }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !req.is('application/json')) { res.status(415).json({ error: 'API writes require application/json.' }); return; }
  next();
}

export async function createApplication(options: { production?: boolean; port?: number; editor?: boolean; session?: { id: string; stopToken: string } } = {}) {
  const app = express(), runtime = resolve(workspace, '.runtime');
  await mkdir(runtime, { recursive: true });
  let port = options.port ?? Number(process.env.PORT ?? 4310);
  const manager = new ExportManager(runtime, () => `http://127.0.0.1:${port}`);
  const services = new LocalServices(runtime), diagnostics = new ChildProcesses();
  const session = options.session ?? (process.env.VIBECRAFT_SESSION_ID && process.env.VIBECRAFT_STOP_TOKEN ? { id: process.env.VIBECRAFT_SESSION_ID, stopToken: process.env.VIBECRAFT_STOP_TOKEN } : undefined);
  app.disable('x-powered-by');
  app.use('/api', requireLocalOrigin, express.json({ limit: '60mb' }));
  let ffmpeg: boolean | undefined;
  app.get('/api/health', async (_req, res) => {
    if (ffmpeg === undefined) { try { await runCommand(diagnostics, 'ffmpeg', ['-version']); ffmpeg = true; } catch { ffmpeg = false; } }
    res.json({ app: 'vibecraft', ok: true, ffmpeg, local: true, sessionId: session?.id, exportBusy: manager.isBusy(), limits: { duration: 600, frames: 18000, maxAssetMB: 20, maxProjectAssetsMB: 40 } });
  });
  if (session) app.post('/api/session/stop', (req, res) => {
    if (req.body?.token !== session.stopToken) { res.status(403).json({ error: 'This launcher does not own the running studio session.' }); return; }
    res.once('finish', () => { setTimeout(() => { void close(); }, 50).unref(); });
    res.status(202).json({ stopping: true });
  });
  app.post('/api/exports', async (req, res) => { const job = await manager.admit(req.body); res.status(202).json(job); });
  app.get('/api/exports/:id', (req, res) => { const job = manager.get(req.params.id); job ? res.json(job) : res.status(404).json({ error: 'Export not found.' }); });
  app.get('/api/exports/:id/file', (req, res) => { const file = manager.file(req.params.id); file ? res.download(file, `vibecraft.${manager.get(req.params.id)!.format}`, { dotfiles: 'allow' }) : res.status(404).json({ error: 'Export is not complete.' }); });
  app.post('/api/exports/:id/cancel', async (req, res) => { const cancelled = await manager.cancel(req.params.id); res.status(cancelled ? 200 : 409).json({ cancelled }); });
  app.get('/api/voices', async (_req, res) => { res.json({ voices: await services.voices() }); });
  app.post('/api/speech', async (req, res) => { const audio = await services.speak(req.body); res.setHeader('Content-Type', 'audio/wav'); res.setHeader('Cache-Control', 'no-store'); res.send(audio); });
  app.get('/api/ai/status', async (_req, res) => { res.json(await services.aiStatus()); });
  app.post('/api/ai/script', async (req, res) => { res.json(await services.generateScript(req.body)); });
  app.use('/api', (_req, res) => { res.status(404).json({ error: 'API endpoint not found.' }); });
  let vite: { close(): Promise<void> } | undefined;
  if (options.editor !== false) {
    if (options.production) app.use(express.static(resolve(workspace, 'dist')));
    else {
      const { createServer: createVite } = await import('vite');
      const dev = await createVite({ root: workspace, server: { middlewareMode: true, hmr: false }, appType: 'spa' });
      vite = dev;
      app.use(dev.middlewares);
    }
    if (options.production) app.get('/{*path}', (_req, res) => { res.sendFile(resolve(workspace, 'dist', 'index.html'), { dotfiles: 'allow' }); });
  }
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return;
    const typed = error as Error & { status?: number; type?: string };
    const message = error instanceof ZodError ? error.issues.slice(0, 4).map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ') : typed.type === 'entity.too.large' ? 'Request exceeds the 60 MB limit.' : typed.message || 'Request failed.';
    res.status(typed.status ?? (error instanceof ZodError ? 400 : 400)).json({ error: message });
  });
  const server = createServer(app);
  let closing: Promise<void> | undefined;
  function close(): Promise<void> {
    return closing ??= (async () => { diagnostics.killAll(); services.close(); await manager.close(); await vite?.close(); await new Promise<void>(done => { server.close(() => done()); server.closeAllConnections(); }); })();
  }
  return {
    app, server, manager,
    async listen() {
      await new Promise<void>((done, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', done); });
      const address = server.address(); if (address && typeof address !== 'string') port = address.port;
      return port;
    },
    close,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const application = await createApplication({ production: process.argv.includes('--production') });
  const port = await application.listen();
  console.log(`Vibecraft Studio is ready at http://127.0.0.1:${port}`);
  let closing = false;
  const stop = async () => { if (closing) return; closing = true; await application.close(); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
