import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

function localSpecifiers(source) {
  return [...source.matchAll(/(?:import|export)\s+(?:[^'\"]*?\sfrom\s*)?['\"]([^'\"]+)['\"]/g)]
    .map((match) => match[1])
    .filter((value) => value.startsWith('.'));
}

async function graph(entry) {
  const pending = [entry];
  const files = new Map();
  while (pending.length) {
    const relative = pending.pop();
    if (files.has(relative)) continue;
    const source = await readFile(join(root, relative), 'utf8');
    files.set(relative, source);
    for (const specifier of localSpecifiers(source)) {
      pending.push(join(dirname(relative), specifier.split(/[?#]/, 1)[0]).replaceAll('\\', '/'));
    }
  }
  return files;
}

test('bootstrap usa un entry point e un grafo Calendar immutabili', async () => {
  const index = await readFile(join(root, 'index.html'), 'utf8');
  const worker = await readFile(join(root, 'sw.v3.0.5.js'), 'utf8');
  assert.match(index, /src=["']src\/app\.v3\.0\.5\.mjs["']/);
  assert.doesNotMatch(index, /src\/app\.mjs/);
  for (const path of [
    'app.v3.0.5.mjs', 'calendar-record.v3.0.5.mjs', 'calendar-privacy.v3.0.5.mjs',
    'calendar-sharing.v3.0.5.mjs', 'calendar-sharing-view.v3.0.5.mjs', 'route-controller.v3.0.5.mjs'
  ]) assert.match(worker, new RegExp(path.replaceAll('.', '\\.')));
  assert.doesNotMatch(worker, /src\/calendar-sharing-view\.mjs['"]/);
});

test('il grafo Calendar non dereferenzia clock_in/clock_out direttamente', async () => {
  const files = await graph('src/calendar-sharing-view.v3.0.5.mjs');
  for (const [path, source] of files) {
    assert.doesNotMatch(source, /\.(?:clock_in|clock_out)\b/, `${path} usa accesso diretto a un orario giornata`);
  }
});

test('il bootstrap non torna ai moduli Supabase duplicati o a SUPABASE_ANON_KEY', async () => {
  const files = await graph('src/app.v3.0.5.mjs');
  const app = files.get('src/app.v3.0.5.mjs');
  assert.match(app, /from\s+['"]\.\/supabase-client\.v3\.0\.3\.mjs['"]/);
  assert.doesNotMatch(app, /from\s+['"]\.\/supabase-client\.mjs['"]/);
  assert.doesNotMatch(app, /^import[^\n]+calendar-sharing/m, 'Calendar non deve bloccare il bootstrap statico');
  assert.match(app, /import\(['"]\.\/calendar-sharing\.v3\.0\.5\.mjs['"]\)/);
  assert.match(app, /import\(['"]\.\/calendar-sharing-view\.v3\.0\.5\.mjs['"]\)/);
  for (const [path, source] of files) {
    if (path === 'src/config.js') continue;
    assert.doesNotMatch(source, /SUPABASE_ANON_KEY/, `${path} dipende ancora da SUPABASE_ANON_KEY`);
  }
});

test('le schermate operative Calendar non espongono gergo tecnico, Excel o versioni', async () => {
  const view = await readFile(join(root, 'src/calendar-sharing-view.v3.0.5.mjs'), 'utf8');
  assert.doesNotMatch(view, /Excel|SUPABASE_/);
  assert.match(view, /Nessuna giornata registrata/);
  assert.match(view, /Calendario temporaneamente non disponibile/);
});
