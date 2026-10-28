import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { resolveBrowserExecutable } from './browser-runtime.mjs';

const root = process.cwd(), output = path.join(root, 'artifacts', 'rea-videoscribe');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: resolveBrowserExecutable().executablePath,
  args: ['--remote-debugging-port=9332', '--remote-debugging-address=127.0.0.1'],
});
const cli = path.join(root, 'node_modules', 'rea-agents', 'scripts', 'rea.mjs');
async function rea(args, file) {
  const child = spawn(process.execPath, [cli, ...args, '--json'], { cwd: root, windowsHide: true });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const code = await new Promise(resolve => child.on('close', resolve));
  await writeFile(path.join(output, file), stdout);
  if (stderr) await writeFile(path.join(output, file + '.stderr.txt'), stderr);
  if (code !== 0) throw new Error('REA ' + args[0] + ' failed: ' + stderr.slice(-800) + ' ' + stdout.slice(-800));
  return JSON.parse(stdout);
}
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto('https://www.videoscribe.co/app/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);
  await writeFile(path.join(output, 'public-page.html'), await page.content());
  await page.screenshot({ path: path.join(output, 'public-page.png'), fullPage: false });
  const targets = await rea(['list-browser-targets', 'http://127.0.0.1:9332'], 'targets.json');
  await writeFile(path.join(output, 'page-summary.json'), JSON.stringify({ url: page.url(), title: await page.title(), body: (await page.locator('body').innerText()).slice(0, 16000), targets }, null, 2));
  const raw = JSON.stringify(targets);
  const targetList = await (await fetch('http://127.0.0.1:9332/json/list')).json();
  const target = targetList.find(t => t.type === 'page' && t.url === page.url());
  if (!target || !raw.includes(target.id)) throw new Error('Page target not admitted by REA discovery');
  await rea(['inspect-web-page', 'http://127.0.0.1:9332', target.id, '--include-accessibility-text', '--observation-ms', '1000'], 'page-evidence.json');
  await rea(['analyze-web-bundle', 'http://127.0.0.1:9332', target.id, '--observation-ms', '1000'], 'bundle-evidence.json');
  console.log(JSON.stringify({ output, url: page.url(), title: await page.title(), result: 'REA discovery, passive page inspection and static web bundle analysis complete' }));
} finally {
  await browser.close();
}
