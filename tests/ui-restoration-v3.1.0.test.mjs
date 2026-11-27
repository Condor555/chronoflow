import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, app, css, worker, sharingView] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../styles.css', import.meta.url), 'utf8'),
  readFile(new URL('../sw.v3.3.3.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/calendar-sharing-view.v3.0.5.mjs', import.meta.url), 'utf8')
]);

test('la navigazione primaria ripristina Oggi, Calendario, Riepilogo e Impostazioni', () => {
  for (const [target, label] of [['today','Oggi'], ['calendar','Calendario'], ['summary','Riepilogo'], ['settings','Impostazioni']]) {
    assert.match(html, new RegExp(`class="nav-item[^"]*"[^>]*data-target="${target}"[\\s\\S]{0,1000}<span>${label}</span>`));
  }
  assert.match(html, /id="account-button"/);
  assert.match(html, /id="account-panel"/);
  assert.match(html, /id="sign-out"/);
});

test('Oggi ripristina tile timer, selettore luogo, metriche e microcopy uscita automatica', () => {
  for (const id of ['work-timer-card','work-main-value','primary-action','exit-action','smart-auto-exit-note']) assert.match(html, new RegExp(`id="${id}"`));
  for (const mode of ['office','smart','travel']) assert.match(html, new RegExp(`data-location="${mode}"`));
  for (const id of ['worked-value','forecast-value','overtime-value','ticket-value']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(app, /Uscita automatica alle/);
  assert.match(app, /exit\.hidden\s*=\s*!isLive[\s\S]*autoExit\.automatic/);
});

test('Calendario mantiene il personale e aggiunge Condivisi senza sostituirlo', () => {
  assert.match(html, /id="calendar-personal-panel"/);
  assert.match(html, /id="calendar-grid"/);
  assert.match(html, /id="calendar-shared-panel"/);
  assert.match(html, /data-calendar-scope="mine"[^>]*>Il mio</);
  assert.match(html, /data-calendar-scope="shared"[^>]*>Condivisi</);
  assert.match(app, /import\("\.\/calendar-sharing\.v3\.0\.5\.mjs"\)/);
  assert.match(app, /import\("\.\/calendar-sharing-view\.v3\.0\.5\.mjs"\)/);
  assert.doesNotMatch(app.split('\n').slice(0, 50).join('\n'), /^import[^\n]+calendar-sharing/m);
  assert.match(sharingView, /includeMine/);
});

test('Riepilogo e Impostazioni conservano i blocchi funzionali della 2.9.4', () => {
  for (const id of [
    'summary-month-section','summary-balance-section','summary-ledger-section','summary-overtime',
    'profile-settings','work-mode-settings','leave-settings','ticket-settings','absence-settings',
    'summary-preferences','calendar-sharing-settings','notification-settings','family-settings',
    'project-settings','holiday-settings','security-settings','data-settings'
  ]) assert.match(html, new RegExp(`id="${id}"`));
});

test('service worker 3.3 mantiene network-first, preload settled e cache completa', () => {
  assert.match(app, /register\("\.\/sw\.v3\.3\.3\.js"/);
  assert.match(worker, /await event\.preloadResponse/);
  assert.match(worker, /navigationPreload\.disable/);
  assert.match(worker, /networkFirst/);
  for (const path of ['src/app.v3.3.3.mjs','src/smart-auto-exit.mjs','src/calendar-sharing-view.v3.0.5.mjs']) {
    assert.match(worker, new RegExp(path.replaceAll('.', '\\.').replace('?', '\\?')));
  }
});

test('layout mantiene mobile-first e target accessibili', () => {
  assert.match(css, /min-width:\s*320px/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(max-width:\s*520px\)/);
});
