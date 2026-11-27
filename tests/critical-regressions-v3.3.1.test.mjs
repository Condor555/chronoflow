import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, app, worker, migration] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../sw.v3.3.5.js', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/20261127_331_allocation_method.sql', import.meta.url), 'utf8')
]);

test('la Home renderizza la giornata salvata e la rilegge dal cloud a riapertura, focus e pageshow', () => {
  assert.match(app, /const savedDay = state\.days\.get\(date\) \|\| null;[\s\S]*homeModeForToday\(savedDay\)/);
  assert.match(app, /if \(name === "today"\)[\s\S]*renderToday\(\);[\s\S]*refreshTodayFromCloud/);
  assert.match(app, /addEventListener\("pageshow"[\s\S]*refreshTodayFromCloud/);
  assert.match(app, /addEventListener\("focus"[\s\S]*refreshTodayFromCloud/);
  assert.match(app, /mayReplaceTodayFromCloud\(pendingDates, date\)/);
});

test('il cambio modalità Home aggiorna con upsert la stessa giornata e non crea duplicati', () => {
  assert.match(app, /applyHomeModeToDay\(state\.days\.get\(date\)/);
  assert.match(app, /from\("work_days"\)[\s\S]*upsert\(asCloudDay\(normalized\), \{ onConflict: "user_id,work_date" \}\)/);
});

test('il Calendario personale mantiene il dettaglio editabile completo', () => {
  for (const id of ['day-dialog', 'day-form', 'day-planned-type', 'day-actual-type', 'day-absence-type', 'day-entry-time', 'day-exit-time', 'day-pause-start-time', 'day-pause-end-time', 'day-ticket', 'day-projects-field']) {
    assert.match(html, new RegExp(`id="${id}"`), `controllo mancante: ${id}`);
  }
  assert.doesNotMatch(html, /<form id="day-form"[^>]*method="dialog"/);
  assert.match(app, /button\.dataset\.workDate = key/);
  assert.match(app, /#calendar-grid[\s\S]*addEventListener\("click"[\s\S]*openDayDialog\(button\.dataset\.workDate\)/);
  assert.match(app, /function bindEvents\(\) \{\s*bindPersonalCalendarEditor\(\)/);
  assert.match(app, /if \(state\.calendarScope !== "mine"\) return;/);
  assert.match(app, /eventsFromLocalTimes\(date/);
  assert.match(app, /recalculateAutomaticAllocationsForDay\(date\)/);
  assert.match(app, /calculateTrackedDay\(day, calculationNow\(day\)\)/);
  assert.doesNotMatch(app, /lastEventTime\(/);
});

test('il Calendario condiviso resta esplicitamente in sola lettura', () => {
  assert.match(app, /includeMine: false,[\s\S]*allowSettings: false,[\s\S]*readOnly: true/);
  assert.match(app, /Il calendario condiviso è disponibile solo in lettura/);
  assert.ok(html.indexOf('id="calendar-grid"') < html.indexOf('id="calendar-shared-panel"'));
});

test('Commesse OFF nasconde ogni controllo operativo delle commesse', () => {
  assert.match(app, /function setProjectFeatureVisibility\(\)[\s\S]*element\.hidden = !enabled/);
  const featureNodes = [...html.matchAll(/<[^>]+data-project-feature[^>]*>/g)].map((match) => match[0]);
  assert.ok(featureNodes.length >= 3);
  featureNodes.forEach((node) => assert.match(node, /hidden/));
});

test('la migration additiva conserva il metodo per ricalcolare solo le ripartizioni automatiche', () => {
  assert.match(migration, /add column if not exists allocation_method/i);
  assert.match(migration, /default 'hours'/i);
  assert.match(migration, /'automatic', 'hours'/i);
  assert.doesNotMatch(migration, /drop table|truncate|delete from/i);
  assert.match(app, /allocation_method === "automatic"/);
});

test('service worker 3.3.5 carica i nuovi moduli ed elimina le cache precedenti', () => {
  assert.match(worker, /chrono-flow-v3\.3\.5-live-allocations-invitations/);
  assert.match(worker, /project-allocation-policy\.mjs/);
  assert.match(worker, /day-source-of-truth\.mjs/);
  assert.match(worker, /keys\.filter\(\(key\) => key !== CACHE\)/);
});
