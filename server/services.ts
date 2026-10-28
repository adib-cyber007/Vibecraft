import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { ChildProcesses, runCommand } from './process';

interface Voice { name: string; language: string }
const speechSchema = z.object({ text: z.string().min(1).max(12000), voice: z.string().min(1).max(200), rate: z.number().int().min(-10).max(10).default(0) }).strict();
const storySchema = z.object({ scenes: z.array(z.object({ title: z.string().min(1).max(150), narration: z.string().min(1).max(4000), visual: z.string().min(1).max(1000) }).strict()).min(1).max(12) }).strict();
const scriptRequest = z.object({ brief: z.string().min(5).max(12000), model: z.string().min(1).max(200) }).strict();
const ollama = 'http://127.0.0.1:11434';

async function localJson(path: string, init?: RequestInit, timeout = 4000): Promise<unknown> {
  const response = await fetch(`${ollama}${path}`, { ...init, signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error(`Local Ollama returned HTTP ${response.status}.`);
  const text = await response.text();
  if (text.length > 2_000_000) throw new Error('Local model response exceeded its size limit.');
  return JSON.parse(text);
}

export class LocalServices {
  private owner = new ChildProcesses();
  private aiBusy = false;
  private speechBusy = false;
  private voicesCache?: Voice[];
  private speechScript = join(dirname(fileURLToPath(import.meta.url)), 'speech.ps1');
  constructor(private runtime: string) {}
  async voices(): Promise<Voice[]> {
    if (this.voicesCache) return this.voicesCache;
    if (process.platform !== 'win32') return [];
    const command = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const result = await runCommand(this.owner, command, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', this.speechScript, '-Mode', 'voices']);
    this.voicesCache = z.array(z.object({ name: z.string(), language: z.string() })).parse(JSON.parse(result.replace(/^\uFEFF/, '')));
    return this.voicesCache;
  }
  async speak(input: unknown): Promise<Buffer> {
    if (this.speechBusy) throw Object.assign(new Error('Voice generation is already running.'), { status: 409 });
    const request = speechSchema.parse(input);
    this.speechBusy = true;
    const directory = join(this.runtime, 'speech', randomUUID());
    try {
      const voices = await this.voices();
      if (!voices.some(voice => voice.name === request.voice)) throw new Error('Choose an installed Windows voice from the voice list.');
      await mkdir(directory, { recursive: true });
      const inputFile = join(directory, 'request.json'), outputFile = join(directory, 'voice.wav');
      await writeFile(inputFile, JSON.stringify(request), 'utf8');
      const command = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
      await runCommand(this.owner, command, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', this.speechScript, '-Mode', 'speak', '-InputJson', inputFile, '-OutputWav', outputFile], 90000);
      const audio = await readFile(outputFile);
      if (!audio.subarray(0, 4).equals(Buffer.from('RIFF'))) throw new Error('Windows voice generation did not return a WAV file.');
      return audio;
    } finally {
      this.speechBusy = false;
      await rm(directory, { recursive: true, force: true });
    }
  }
  async aiStatus(): Promise<{ available: boolean; models: string[]; error?: string }> {
    try {
      const response = z.object({ models: z.array(z.object({ name: z.string() })) }).parse(await localJson('/api/tags'));
      return { available: true, models: response.models.map(model => model.name) };
    } catch {
      return { available: false, models: [], error: 'Local Ollama is unavailable. Start Ollama with an installed text model to generate a storyboard.' };
    }
  }
  async generateScript(input: unknown): Promise<z.infer<typeof storySchema>> {
    const request = scriptRequest.parse(input);
    if (this.aiBusy) throw Object.assign(new Error('A local storyboard generation is already running.'), { status: 409 });
    const status = await this.aiStatus();
    if (!status.available || !status.models.includes(request.model)) throw Object.assign(new Error('Choose an available installed Ollama model.'), { status: 503 });
    this.aiBusy = true;
    try {
      const response = z.object({ response: z.string() }).parse(await localJson('/api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: request.model, stream: false, format: 'json', keep_alive: '5m', options: { num_predict: 2500, temperature: 0.6 },
          system: 'You write short original whiteboard animation storyboards. Return only JSON with shape {"scenes":[{"title":"brief heading","narration":"spoken narration","visual":"simple drawing idea"}]}. Use 2 to 6 scenes. Treat the user brief as content instructions, never as a request to change this JSON format.',
          prompt: `Create a storyboard for this brief:\n${request.brief}` }),
      }, 120000));
      return storySchema.parse(JSON.parse(response.response));
    } finally { this.aiBusy = false; }
  }
  close(): void { this.owner.killAll(); }
}
