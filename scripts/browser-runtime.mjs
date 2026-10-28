import { statSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const regularFile = path => { try { return statSync(path).isFile(); } catch { return false; } };
const directories = path => { try { return readdirSync(path, { withFileTypes: true }).filter(item => item.isDirectory()).map(item => item.name); } catch { return []; } };

/** Resolve a locally installed browser only. This never installs, downloads or launches one. */
export function resolveBrowserExecutable(options = {}) {
  const env = options.env ?? process.env, platform = options.platform ?? process.platform, home = options.home ?? homedir();
  const exists = options.exists ?? regularFile, list = options.listDirectories ?? directories;
  const explicit = env.VIBECRAFT_BROWSER_EXECUTABLE;
  if (explicit) {
    if (!exists(explicit)) throw new Error('VIBECRAFT_BROWSER_EXECUTABLE must name an existing browser executable file.');
    return { executablePath: explicit, source: 'VIBECRAFT_BROWSER_EXECUTABLE' };
  }
  const bundled = options.playwrightExecutable ?? chromium.executablePath();
  if (exists(bundled)) return { executablePath: bundled, source: 'Playwright browser' };
  const caches = [env.PLAYWRIGHT_BROWSERS_PATH && env.PLAYWRIGHT_BROWSERS_PATH !== '0' ? env.PLAYWRIGHT_BROWSERS_PATH : undefined,
    platform === 'win32' ? env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'ms-playwright') : undefined,
    platform === 'win32' ? join(home, 'AppData', 'Local', 'ms-playwright') : platform === 'darwin' ? join(home, 'Library', 'Caches', 'ms-playwright') : join(env.XDG_CACHE_HOME ?? join(home, '.cache'), 'ms-playwright'),
  ].filter(Boolean);
  for (const cache of new Set(caches)) {
    const revisions = list(cache).filter(name => /^chromium-\d+$/.test(name)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    for (const revision of revisions) {
      const relative = platform === 'win32' ? ['chrome-win64', 'chrome.exe'] : platform === 'darwin' ? ['chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'] : ['chrome-linux', 'chrome'];
      const executablePath = join(cache, revision, ...relative);
      if (exists(executablePath)) return { executablePath, source: 'Existing Playwright cache' };
      // Current Chrome for Testing archives use a platform-qualified folder.
      const alternative = platform === 'darwin' ? join(cache, revision, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing') : platform === 'linux' ? join(cache, revision, 'chrome-linux64', 'chrome') : undefined;
      if (alternative && exists(alternative)) return { executablePath: alternative, source: 'Existing Playwright cache' };
    }
  }
  const system = platform === 'win32' ? [
    env.PROGRAMFILES && join(env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    env['PROGRAMFILES(X86)'] && join(env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    env.PROGRAMFILES && join(env.PROGRAMFILES, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    env.PROGRAMFILES && join(env.PROGRAMFILES, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
  ] : platform === 'darwin' ? [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ] : ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/opt/google/chrome/chrome'];
  for (const executablePath of system.filter(Boolean)) if (exists(executablePath)) return { executablePath, source: 'Installed system browser' };
  throw new Error('No Chromium browser is available. Install a Playwright browser with npx playwright install chromium, or set VIBECRAFT_BROWSER_EXECUTABLE to an installed Chromium, Chrome, Edge or Brave executable.');
}
