import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, app, css, sql, worker, pkg] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../styles.css', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/20261127_330_projects_allocations.sql', import.meta.url), 'utf8'),
  readFile(new URL('../sw.v3.3.0.js', import.meta.url), 'utf8'),
  readFile(new URL('../package.json', import.meta.url), 'utf8')
]);

test('la funzione commesse è opt-in e invisibile nelle viste operative quando disattiva', () => {
  assert.match(app, /projects_enabled:\s*false/);
  assert.match(app, /projects_enabled:\s*input\.projects_enabled === true/);
  assert.match(app, /function setProjectFeatureVisibility\(\)/);
  const featureNodes = [...html.matchAll(/<[^>]+data-project-feature[^>]*>/g)].map((match) => match[0]);
  assert.ok(featureNodes.length >= 3, 'Home, Calendario/giornata e Riepilogo devono essere condizionati');
  featureNodes.forEach((node) => assert.match(node, /hidden/, `manca hidden su ${node}`));
});

test('Home, Calendario, Riepilogo e Impostazioni espongono la progressive disclosure richiesta', () => {
  for (const id of [
    'today-projects', 'add-today-allocation', 'day-projects-field', 'add-day-allocation',
    'summary-projects', 'project-settings', 'projects-enabled', 'project-list',
    'default-project', 'allocation-dialog', 'allocation-project', 'allocation-start',
    'allocation-end', 'allocation-duration'
  ]) assert.match(html, new RegExp(`id="${id}"`), `controllo mancante: ${id}`);
  assert.match(html, /Registra attività/);
  assert.match(html, /Commesse di oggi/);
  assert.match(html, /Andamento mensile/);
  assert.match(html, /Commessa predefinita/);
});

test('il modello dati usa entità separate e allocazioni multiple, senza project_id sulla giornata', () => {
  assert.match(sql, /create table if not exists public\.work_projects/i);
  assert.match(sql, /create table if not exists public\.work_allocations/i);
  assert.match(sql, /project_id uuid not null/i);
  assert.match(sql, /work_date date not null/i);
  assert.match(sql, /duration_minutes integer not null/i);
  assert.doesNotMatch(sql, /alter table public\.work_days[\s\S]*add[\s\S]*project_id/i);
  assert.match(app, /state\.allocations = new Map\(\)|allocations:\s*new Map\(\)/);
  assert.match(app, /function allocationsForDate/);
});

test('migration additiva, RLS e ownership impediscono accessi incrociati', () => {
  assert.match(sql, /begin;/i);
  assert.match(sql, /commit;/i);
  assert.match(sql, /foreign key \(project_id, user_id\)/i);
  assert.match(sql, /enable row level security/i);
  assert.ok((sql.match(/auth\.uid\(\) = user_id/g) || []).length >= 8);
  assert.doesNotMatch(sql, /drop table|truncate table|delete from public\.(profiles|work_days)/i);
});

test('archiviazione, predefinita, recenti, inserimento rapido e controlli non bloccanti sono implementati', () => {
  assert.match(app, /setProjectActive/);
  assert.match(app, /default_project_id/);
  assert.match(app, /recentProjectIds/);
  assert.match(html, /data-quick-minutes="30"/);
  assert.match(html, /data-quick-minutes="60"/);
  assert.match(app, /Puoi completare la giornata comunque/);
  assert.match(app, /intervalsOverlap/);
});

test('backup ed offline queue includono commesse e allocazioni senza toccare config.js', () => {
  assert.match(app, /projectQueueKey/);
  assert.match(app, /flushProjectQueue/);
  assert.match(app, /projects:\s*projectsResult\.data/);
  assert.match(app, /allocations:\s*allocationsResult\.data/);
  assert.match(worker, /chrono-flow-v3\.3\.0-projects/);
  assert.match(worker, /app\.v3\.3\.0\.mjs/);
  assert.equal(JSON.parse(pkg).version, '3.3.0');
});

test('stili mobile-first e focus/accessibilità sono presenti', () => {
  assert.match(css, /\.project-day-card/);
  assert.match(css, /\.project-trend/);
  assert.match(css, /@media \(max-width: 620px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(html, /role="progressbar"/);
  assert.match(html, /role="status"/);
  assert.match(html, /aria-labelledby="allocation-dialog-title"/);
});
