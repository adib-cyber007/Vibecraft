export interface BrowserRuntimeOptions {
  env?: NodeJS.ProcessEnv;
  platform?: string;
  home?: string;
  playwrightExecutable?: string;
  exists?: (path: string) => boolean;
  listDirectories?: (path: string) => string[];
}
export function resolveBrowserExecutable(options?: BrowserRuntimeOptions): { executablePath: string; source: string };
