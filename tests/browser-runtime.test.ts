import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { resolveBrowserExecutable } from '../scripts/browser-runtime.mjs';
const base = { env: {}, platform: 'win32', home: 'test-home', playwrightExecutable: 'bundled-browser', listDirectories: () => [] };
test('an explicit browser override is authoritative and rejects missing executables', () => {
  assert.deepEqual(resolveBrowserExecutable({ ...base, env: { VIBECRAFT_BROWSER_EXECUTABLE: 'chosen-browser' }, exists: path => path === 'chosen-browser' }), { executablePath: 'chosen-browser', source: 'VIBECRAFT_BROWSER_EXECUTABLE' });
  assert.throws(() => resolveBrowserExecutable({ ...base, env: { VIBECRAFT_BROWSER_EXECUTABLE: 'missing' }, exists: path => path === 'bundled-browser' }), /must name an existing/);
});
test('browser discovery selects a Playwright browser before cached and system choices', () => {
  assert.equal(resolveBrowserExecutable({ ...base, exists: () => true }).executablePath, 'bundled-browser');
});
test('a moved user cache is discovered without a machine-specific user or revision', () => {
  const cache = join('test-home', 'AppData', 'Local', 'ms-playwright'), expected = join(cache, 'chromium-9999', 'chrome-win64', 'chrome.exe');
  const result = resolveBrowserExecutable({ ...base, listDirectories: path => path === cache ? ['chromium-123', 'chromium-9999', 'unrelated-folder'] : [], exists: path => path === expected });
  assert.equal(result.executablePath, expected);
});
test('missing browsers produce actionable error rather than falling through to an invalid launch', () => {
  assert.throws(() => resolveBrowserExecutable({ ...base, exists: () => false }), /VIBECRAFT_BROWSER_EXECUTABLE/);
});
