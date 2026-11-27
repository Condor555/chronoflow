import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initialAllocationProjectIds } from '../src/project-allocation-policy.mjs';

const [html, entry, app, worker, compatWorker, pkg] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/app.v3.3.4.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../src/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../sw.v3.3.4.js', import.meta.url), 'utf8'),
  readFile(new URL('../sw.js', import.meta.url), 'utf8'),
  readFile(new URL('../package.json', import.meta.url), 'utf8')
]);

test('una nuova registrazione parte vuota e non riusa la prima commessa storica', () => {
  assert.deepEqual(initialAllocationProjectIds([]), []);
  const dialogBody = app.slice(app.indexOf('function openAllocationDialog'), app.indexOf('function minutesFromTimeRange'));
  assert.match(dialogBody, /initialAllocationProjectIds/);
  assert.doesNotMatch(dialogBody, /recentProjectIds/);
  assert.doesNotMatch(dialogBody, /defaultProjectId/);
});

test('la modifica conserva soltanto le allocazioni già salvate sulla giornata', () => {
  assert.deepEqual(initialAllocationProjectIds(['esistente', 'esistente', 'altra']), ['esistente', 'altra']);
});

test('ogni selezione svuota la ricerca, ripristina i risultati e riporta il focus', () => {
  const pickerBody = app.slice(app.indexOf('function renderAllocationProjectPicker'), app.indexOf('function openAllocationDialog'));
  assert.match(pickerBody, /state\.allocationSelectedProjects\.add\(project\.id\)/);
  assert.match(pickerBody, /searchInput\.value = ""/);
  assert.match(pickerBody, /renderAllocationProjectPicker\(\)/);
  assert.match(pickerBody, /requestAnimationFrame\(\(\) => searchInput\.focus\(\)\)/);
});

test('Modifica apre il dialogo isolato senza ricerca o aggiunta di altre commesse', () => {
  assert.match(html, /id="single-allocation-dialog"/);
  assert.match(html, /id="single-allocation-percentage"/);
  assert.match(html, /id="single-allocation-hours"/);
  assert.match(html, /id="delete-single-allocation"/);
  assert.match(app, /openSingleAllocationDialog\(allocation\.work_date, allocation\.id\)/);
  const singleDialogBody = app.slice(app.indexOf('function openSingleAllocationDialog'), app.indexOf('function minutesFromTimeRange'));
  assert.doesNotMatch(singleDialogBody, /allocation-project-search|renderAllocationProjectPicker|allocationSelectedProjects/);
});

test('salvataggio ed eliminazione della singola voce aggiornano lo stato condiviso', () => {
  assert.match(app, /percentageToMinutes\(workedMinutesForDate\(date\)/);
  assert.match(app, /hoursToMinutes\(\$\("#single-allocation-hours"\)\.value\)/);
  assert.match(app, /await saveAllocation\(\{ \.\.\.allocation, duration_minutes: durationMinutes \}\)/);
  assert.match(app, /await deleteAllocation\(id, date\)/);
});

test('shell 3.3.4 forza il caricamento della correzione anche nella PWA', () => {
  assert.match(html, /data-build="3\.3\.4"/);
  assert.match(html, /src\/app\.v3\.3\.4\.mjs/);
  assert.match(entry, /app\.js\?v=3\.3\.4/);
  assert.match(app, /sw\.v3\.3\.4\.js/);
  assert.match(worker, /chrono-flow-v3\.3\.4-complete-flows/);
  assert.match(compatWorker, /sw\.v3\.3\.4\.js/);
  assert.equal(JSON.parse(pkg).version, '3.3.4');
});
