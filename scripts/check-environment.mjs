import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { resolveBrowserExecutable } from './browser-runtime.mjs';
const run = promisify(execFile);
const report = { node: { version: process.version, supported: /^24\./.test(process.versions.node) && Number(process.versions.node.split('.')[1]) >= 11 || Number(process.versions.node.split('.')[0]) >= 26 }, platform: process.platform };
for (const command of ['ffmpeg', 'ffprobe']) {
  try { const result = await run(command, ['-version'], { timeout: 7000, windowsHide: true, maxBuffer: 100000 }); report[command] = { available: true, version: result.stdout.split(/\r?\n/)[0] }; }
  catch { report[command] = { available: false, action: 'Install FFmpeg and add its bin directory to PATH.' }; }
}
try { report.browser = { available: true, ...resolveBrowserExecutable() }; }
catch (error) { report.browser = { available: false, action: error.message }; }
if (process.platform === 'win32') {
  try {
    const command = resolve(process.env.SystemRoot ?? 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
    const result = await run(command, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', resolve('server/speech.ps1'), '-Mode', 'voices'], { timeout: 10000, windowsHide: true, maxBuffer: 100000 });
    const voices = JSON.parse(result.stdout.replace(/^\uFEFF/, '').trim());
    report.windowsVoices = { available: voices.length > 0, count: voices.length, voices };
  } catch { report.windowsVoices = { available: false, optional: true, action: 'Installed Windows voices could not be read. Audio import and microphone recording remain available.' }; }
} else report.windowsVoices = { available: false, optional: true, reason: 'Windows narration is only available on Windows.' };
try {
  const result = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(2500) });
  if (!result.ok) throw new Error('Unavailable');
  const data = await result.json();
  report.ollama = { available: true, optional: true, models: (data.models ?? []).map(model => model.name) };
} catch { report.ollama = { available: false, optional: true, action: 'Start local Ollama with an installed text model to use AI storyboard generation.' }; }
report.readyForVideoExport = report.node.supported && report.ffmpeg.available && report.ffprobe.available && report.browser.available;
console.log(JSON.stringify(report, null, 2));
if (!report.readyForVideoExport) process.exitCode = 1;
