import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveBrowserExecutable } from '../scripts/browser-runtime.mjs';
import { createServer } from 'vite';
import { chromium, type Browser } from 'playwright';
import { multiplySvgMatrices, parseSvgTransform } from '../src/svg-import';

test('SVG transforms follow ordered composition and rotate around a centre', () => {
  assert.deepEqual(parseSvgTransform('translate(10 20) scale(2)'), [2, 0, 0, 2, 10, 20]);
  assert.deepEqual(multiplySvgMatrices([2, 0, 0, 2, 0, 0], [1, 0, 0, 1, 10, 20]), [2, 0, 0, 2, 20, 40]);
  const result = parseSvgTransform('rotate(90,10,10)');
  assert.ok(Math.abs(result[4] - 20) < 1e-8);
  assert.ok(Math.abs(result[5]) < 1e-8);
  assert.throws(() => parseSvgTransform('translate(1) ignored'), /Malformed/);
  assert.throws(() => parseSvgTransform('matrix(1,2)'), /six/);
});

test('actual browser SVG conversion preserves appearance and drawing geometry', async () => {
  const server = await createServer({ configFile: false, root: process.cwd(), cacheDir: '.cache/svg-tests', server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  server.middlewares.use('/__svg-tests', (_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><body>SVG import verification</body></html>'); });
  await server.listen();
  const address = server.httpServer!.address();
  if (!address || typeof address === 'string') throw new Error('SVG test server did not start.');
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ headless: true, executablePath: resolveBrowserExecutable().executablePath });
    const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${address.port}/__svg-tests`);
    // tsx preserves local function names using this helper when serializing evaluate callbacks.
    await page.evaluate('globalThis.__name = (target) => target');
    const results = await page.evaluate(async () => {
      const { parseVectorSvg } = await import('/src/svg-import.ts' as string);
      const { renderProject, vectorPoint } = await import('/src/engine/render.ts' as string);
      const { createProject, createScene, createElement } = await import('/src/model.ts' as string);
      const simple = parseVectorSvg('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 20 10"><g transform="translate(2 1)" fill="none" stroke="red" stroke-width="0.4"><path d="M0 0L10 0L10 5"/><circle cx="13" cy="4" r="2"/></g></svg>');
      const nested = parseVectorSvg('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><svg x="20" y="30" width="40" height="20" viewBox="0 0 20 10"><rect x="1" y="1" width="18" height="8" rx="2" fill="#abc"/></svg></svg>');
      const allShapes = parseVectorSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none" stroke="#123456"><rect x="2" y="3" width="15" height="12" rx="3"/><circle cx="30" cy="30" r="10"/><ellipse cx="60" cy="30" rx="15" ry="10"/><line x1="3" y1="80" x2="30" y2="80"/><polyline points="40,70 50,80 60,70"/><polygon points="70,70 90,80 70,90"/></svg>');
      const filled = parseVectorSvg('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><path fill="#ff0000" fill-rule="evenodd" d="M10 10H90V90H10Z M30 30H70V70H30Z"/></svg>');
      const unsupported = ['<text x="2" y="20">Hello</text>', '<defs><linearGradient id="a"><stop offset="0"/></linearGradient></defs><rect width="80" height="80" fill="url(#a)"/>', '<g opacity="0.5"><rect width="80" height="80"/></g>', '<path d="M0 0L40 40" stroke="#000" stroke-dasharray="2 2"/>', '<use href="#shape"/>', '<g transform="scale(2,1)"><path d="M0 0L20 20" stroke="#000"/></g>', '<svg width="20" height="20"><rect width="40" height="30"/></svg>'].map(content => parseVectorSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${content}</svg>`));
      let unsafe = '', malformed = '', tooMany = '';
      try { parseVectorSvg('<svg><script>alert(1)</script></svg>'); } catch (error) { unsafe = (error as Error).message; }
      try { parseVectorSvg('<svg><g></svg>'); } catch (error) { malformed = (error as Error).message; }
      try { parseVectorSvg('<svg viewBox="0 0 100 100">' + '<path d="M1 1L2 2" stroke="#000"/>'.repeat(201) + '</svg>'); } catch (error) { tooMany = (error as Error).message; }
      const canvas = document.createElement('canvas'); canvas.width = 100; canvas.height = 100; const ctx = canvas.getContext('2d')!;
      const filledElement = createElement('vector', { x: 0, y: 0, width: 100, height: 100, paths: filled.paths, animation: { start: 0, draw: 2, hold: 1, exit: 0, entrance: 'draw', exitStyle: 'none', emphasis: 'none', hand: 'none', handColor: '#deb38e' } });
      const project = createProject({ width: 100, height: 100, scenes: [createScene(100, 100, { duration: 4, elements: [filledElement] })] });
      renderProject(ctx, project, 3, { width: 100, height: 100, images: new Map(), preview: false });
      const pixel = (x: number, y: number) => [...ctx.getImageData(x, y, 1, 1).data];
      const fillPixels = { inside: pixel(20, 20), hole: pixel(50, 50), outside: pixel(8, 50) };
      const line = createElement('shape', { shape: 'line', x: 10, y: 49, width: 80, height: 2, strokeWidth: 8, color: '#000000' });
      project.scenes[0].elements = [line];
      renderProject(ctx, project, 3, { width: 100, height: 100, images: new Map(), preview: true });
      let linePixels = 0; for (let y = 0; y < 100; y++) if (pixel(50, y)[0] < 100) linePixels++;
      const handPoint = vectorPoint([{ d: 'M0 0L100 0M100 0L100 100' }], 0.75, 200, 100);
      return { simple, nested, allShapes, filled, unsupported, unsafe, malformed, tooMany, fillPixels, linePixels, handPoint };
    });
    assert.equal(results.simple.kind, 'vector'); assert.equal(results.simple.pathCount, 2);
    assert.equal(results.simple.paths[0].stroke, '#ff0000'); assert.equal(results.simple.paths[0].strokeWidth, 2);
    assert.match(results.simple.paths[0].d, /^M10 10/);
    assert.equal(results.nested.kind, 'vector'); assert.equal(results.nested.paths.length, 1); assert.match(results.nested.paths[0].d, /^M2[0-9]/);
    assert.equal(results.allShapes.pathCount, 6);
    assert.equal(results.filled.paths[0].stroke, 'none');
    assert.ok(results.unsupported.every((entry: { kind: string; reason?: string }) => entry.kind === 'image' && !!entry.reason));
    assert.match(results.unsafe, /Unsupported SVG element/); assert.match(results.malformed, /malformed/); assert.match(results.tooMany, /200 paths/);
    assert.deepEqual(results.fillPixels.inside, [255, 0, 0, 255]); assert.deepEqual(results.fillPixels.hole, [255, 255, 255, 255]); assert.deepEqual(results.fillPixels.outside, [255, 255, 255, 255]);
    assert.ok(results.linePixels >= 7 && results.linePixels <= 9, `A 2-unit-high line keeps its 8px stroke; got ${results.linePixels}px`);
    assert.ok(Math.abs(results.handPoint.x - 200) < 1e-6); assert.ok(Math.abs(results.handPoint.y - 25) < 1e-6);
  } finally { await browser?.close(); await server.close(); }
});
