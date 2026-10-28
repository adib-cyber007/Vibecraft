import { spawn, type ChildProcess } from 'node:child_process';

/** Every child is directly owned; no ambient process discovery or process-name kills. */
export class ChildProcesses {
  private children = new Set<ChildProcess>();
  spawn(command: string, args: string[], options: { cwd?: string } = {}): ChildProcess {
    const child = spawn(command, args, { ...options, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    this.children.add(child);
    child.once('close', () => this.children.delete(child));
    child.once('error', () => this.children.delete(child));
    return child;
  }
  killAll(): void { for (const child of this.children) child.kill('SIGKILL'); }
}

export async function runCommand(owner: ChildProcesses, command: string, args: string[], timeoutMs = 15000): Promise<string> {
  const child = owner.spawn(command, args);
  child.stdin?.end();
  let stdout = '', stderr = '';
  child.stdout?.on('data', data => { if (stdout.length < 2_000_000) stdout += data.toString(); });
  child.stderr?.on('data', data => { stderr = (stderr + data.toString()).slice(-12000); });
  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`${command} exceeded its time limit.`)); }, timeoutMs);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('close', code => { clearTimeout(timeout); code === 0 ? resolve(stdout) : reject(new Error(stderr.trim() || `${command} exited with code ${code}.`)); });
  });
}
