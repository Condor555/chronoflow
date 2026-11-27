import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, app, calculations, sourceOfTruth, worker, compatWorker, pkg] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/calculations.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../src/day-source-of-truth.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../sw.v3.3.5.js', import.meta.url), 'utf8'),
  readFile(new URL('../sw.js', import.meta.url), 'utf8'),
  readFile(new URL('../package.json', import.meta.url), 'utf8')
]);

test('la Home espone lo stato Pausa automatica derivato dall’orario reale', () => {
  assert.match(calculations, /export function normalizeBreakStartTime/);
  assert.match(calculations, /export function calculateDayWithBreakPolicy/);
  assert.match(app, /result\.automaticPauseActive/);
  assert.match(app, /\? "Pausa automatica"/);
  assert.match(app, /Riprenderà automaticamente alle/);
});

test('Calendario personale e condiviso conservano i rispettivi contratti editabile e sola lettura', () => {
  assert.match(app, /button\.dataset\.workDate = key/);
  assert.match(app, /openDayDialog\(button\.dataset\.workDate\)/);
  assert.match(app, /eventsFromLocalTimes\(date/);
  assert.match(app, /onConflict: "user_id,work_date"/);
  assert.match(app, /state\.calendarScope !== "mine"/);
  assert.match(app, /Il calendario condiviso è disponibile solo in lettura/);
  assert.match(html, /id="day-projects-field"/);
});

test('modalità giornaliera: pianificazione e scelta Home condividono lo stesso record persistito', () => {
  assert.match(sourceOfTruth, /return planned \|\| actual \|\| "office"/);
  assert.match(sourceOfTruth, /planned_type: mode,[\s\S]*actual_type: mode/);
  assert.match(app, /await saveDay\(day, \{ silent: true \}\)/);
  assert.match(app, /refreshTodayFromCloud/);
});

test('Registra attività apre il dialogo anche con elenco vuoto e mantiene ricerca/multipla/metodo', () => {
  const functionBody = app.slice(app.indexOf('function openAllocationDialog'), app.indexOf('function minutesFromTimeRange'));
  assert.match(functionBody, /showModal\(\)/);
  assert.doesNotMatch(functionBody, /showScreen\("settings"\)/);
  assert.match(app, /renderAllocationProjectPicker\(/);
  assert.match(app, /allocationSelectedProjects: new Set\(\)/);
  assert.match(app, /buildAllocationEntries/);
  assert.match(app, /replaceDayAllocations/);
  assert.match(html, /placeholder="Scrivi codice o descrizione"/);
  assert.match(html, /name="allocation-method" value="automatic"/);
  assert.match(html, /name="allocation-method" value="hours"/);
});

test('shell resta 3.3.5 con entry point e service worker cache-safe senza modifiche Supabase', () => {
  assert.match(html, /data-build="3\.3\.5"/);
  assert.match(html, /src\/app\.v3\.3\.5\.mjs/);
  assert.match(app, /sw\.v3\.3\.5\.js/);
  assert.match(worker, /chrono-flow-v3\.3\.5-configurable-break-fix-1/);
  assert.match(compatWorker, /sw\.v3\.3\.5\.js\?hotfix=break-fix-1/);
  assert.equal(JSON.parse(pkg).version, '3.3.5');
});
