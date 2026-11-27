import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [index, appEntry, app, recovery, sw, oldApp, oldAppCompat, oldWorker, workerCompat] = await Promise.all([
  read('index.html'), read('src/app.v3.2.1.mjs'), read('src/app.js'), read('src/stale-shell-recovery.v3.2.1.mjs'),
  read('sw.v3.2.1.js'), read('src/app.v3.0.5.mjs'), read('src/app.mjs'), read('sw.v3.0.5.js'), read('sw.js')
]);

test('index 3.2 carica soltanto la shell completa 2.9.4 e un entry point immutabile', () => {
  assert.match(index, /data-chrono-flow-ui="2\.9\.4-restored"/);
  assert.match(index, /styles\.css\?v=3\.2\.1/);
  assert.match(index, /src\/app\.v3\.2\.1\.mjs/);
  assert.doesNotMatch(index, /id="app"\s+tabindex/);
  assert.match(appEntry, /app\.js\?v=3\.2\.1/);
  assert.match(app, /sw\.v3\.2\.1\.js/);
});

test('shell 3.0.x già in cache viene portata alla shell autorevole con navigazione cache-busted', () => {
  assert.match(oldApp, /stale-shell-recovery\.v3\.2\.1/);
  assert.match(oldAppCompat, /stale-shell-recovery\.v3\.2\.1/);
  assert.match(recovery, /location\.replace/);
  assert.match(recovery, /searchParams\.set\('ui', TARGET_BUILD\)/);
  assert.match(oldWorker, /importScripts\('\.\/sw\.v3\.2\.1\.js'\)/);
  assert.match(workerCompat, /importScripts\('\.\/sw\.v3\.2\.1\.js'\)/);
});

test('worker autorevole mantiene stabilità 3.0.5 e asset visuali 2.9.4', () => {
  assert.match(sw, /navigationPreload\.disable/);
  assert.match(sw, /await event\.preloadResponse/);
  assert.match(sw, /networkFirst/);
  for (const asset of ['styles.css?v=3.2.1','src/app.v3.2.1.mjs','src/app.js?v=3.2.1','src/smart-auto-exit.mjs','src/calendar-sharing-view.v3.0.5.mjs','icons/icon.svg']) {
    assert.match(sw, new RegExp(asset.replaceAll('.', '\\.').replaceAll('?', '\\?')));
  }
});
