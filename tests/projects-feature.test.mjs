import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, app, css, sql, methodSql, worker, pkg] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../styles.css', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/20261127_330_projects_allocations.sql', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/20261127_331_allocation_method.sql', import.meta.url), 'utf8'),
  readFile(new URL('../sw.v3.3.3.js', import.meta.url), 'utf8'),
  readFile(new URL('../package.json', import.meta.url), 'utf8')
]);

test('la funzione commesse è opt-in e invisibile nelle viste operative quando disattiva', () => {
  assert.match(app, /projects_enabled:\s*false/);
  assert.match(app, /projects_enabled:\s*input\.projects_enabled === true/);
  assert.match(app, /function setProjectFeatureVisibility\(\)/);
  const featureNodes = [...html.matchAll(/<[^>]+data-project-feature[^>]*>/g)].map((match) => match[0]);
  assert.ok(featureNodes.length >= 3);
  featureNodes.forEach((node) => assert.match(node, /hidden/));
});

test('Registra attività supporta ricerca, selezione multipla e percentuali oppure ore', () => {
  for (const id of [
    'today-projects', 'add-today-allocation', 'day-projects-field', 'add-day-allocation',
    'summary-projects', 'project-settings', 'projects-enabled', 'project-list',
    'default-project', 'allocation-dialog', 'allocation-project-search',
    'allocation-project-options', 'allocation-hours-list', 'allocation-worked-summary'
  ]) assert.match(html, new RegExp(`id="${id}"`), `controllo mancante: ${id}`);
  assert.match(html, /name="allocation-method" value="automatic"/);
  assert.match(html, /name="allocation-method" value="hours"/);
  assert.match(html, /Seleziona una o più commesse/);
  assert.doesNotMatch(html, /Intervallo della giornata/);
  assert.doesNotMatch(html, /id="allocation-start"|id="allocation-end"/);
  assert.match(app, /allocationSelectedProjects: new Set\(\)/);
  assert.match(app, /buildAllocationDurations/);
  assert.match(app, /replaceDayAllocations/);
});

test('il modello dati resta separato e la migration 3.3.1 è solo additiva', () => {
  assert.match(sql, /create table if not exists public\.work_projects/i);
  assert.match(sql, /create table if not exists public\.work_allocations/i);
  assert.doesNotMatch(sql, /alter table public\.work_days[\s\S]*add[\s\S]*project_id/i);
  assert.match(methodSql, /alter table public\.work_allocations[\s\S]*add column if not exists allocation_method/i);
  assert.doesNotMatch(methodSql, /drop table|truncate|delete from/i);
});

test('salvataggio multiplo evita duplicati logici per commessa e giornata', () => {
  assert.match(app, /const existingByProject = new Map\(allocationsForDate\(date\)\.map/);
  assert.match(app, /existingByProject\.get\(projectId\)\?\.id \|\| crypto\.randomUUID\(\)/);
  assert.match(app, /state\.allocations\.set\(date, normalized\)/);
});

test('le allocazioni automatiche vengono ricalcolate dopo modifiche di orari o modalità', () => {
  assert.match(app, /function recalculateAutomaticAllocationsForDay/);
  assert.match(app, /splitEvenMinutes\(workedMinutes, automatic\.length\)/);
  assert.ok((app.match(/recalculateAutomaticAllocationsForDay\(date\)/g) || []).length >= 4);
});

test('backup, offline queue e cache-safe worker includono le nuove entità e policy', () => {
  assert.match(app, /projectQueueKey/);
  assert.match(app, /flushProjectQueue/);
  assert.match(worker, /chrono-flow-v3\.3\.3-complete-flows/);
  assert.match(worker, /app\.v3\.3\.3\.mjs/);
  assert.equal(JSON.parse(pkg).version, '3.3.3');
});

test('stili mobile-first e focus/accessibilità sono presenti', () => {
  assert.match(css, /\.project-picker-options/);
  assert.match(css, /\.allocation-hours-row/);
  assert.match(css, /@media \(max-width: 620px\)/);
  assert.match(html, /aria-controls="allocation-project-options"/);
  assert.match(html, /aria-labelledby="allocation-dialog-title"/);
});
