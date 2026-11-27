import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calculateDayWithBreakPolicy } from '../src/calculations.mjs';

const root = new URL('../', import.meta.url);
const read = (name) => readFile(new URL(name, root), 'utf8');
const at = (time) => {
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(2026, 10, 27, hours, minutes, 0, 0);
};

test('la pausa automatica rispetta l’orario configurato', () => {
  const events = [{ type: 'entry', at: at('08:00').toISOString() }];
  const before = calculateDayWithBreakPolicy(events, 456, 10, 30, at('12:44'), '12:45');
  const during = calculateDayWithBreakPolicy(events, 456, 10, 30, at('13:00'), '12:45');
  const after = calculateDayWithBreakPolicy(events, 456, 10, 30, at('13:20'), '12:45');
  assert.equal(before.defaultBreakAppliedSeconds, 0);
  assert.equal(during.defaultBreakAppliedSeconds, 15 * 60);
  assert.equal(after.defaultBreakAppliedSeconds, 30 * 60);
});

test('la Home mobile usa segmenti orizzontali, card compatta e safe area iOS', async () => {
  const css = await read('styles.css');
  assert.match(css, /--safe-top:\s*env\(safe-area-inset-top/);
  assert.match(css, /--safe-bottom:\s*env\(safe-area-inset-bottom/);
  assert.match(css, /@media \(max-width: 430px\)[\s\S]*#today-screen \.location-choice\s*\{[^}]*repeat\(3/);
  assert.match(css, /#today-screen \.hero-card\s*\{[^}]*min-height:\s*0/);
  assert.match(css, /main\s*\{[^}]*calc\(88px \+ var\(--safe-bottom\)\)/);
  assert.match(css, /\.bottom-nav\s*\{[^}]*var\(--safe-bottom\)/);
});

test('HTML e bootstrap puntano alla build cache-safe 3.3.6', async () => {
  const [html, app, worker, shim] = await Promise.all([
    read('index.html'),
    read('src/app.js'),
    read('sw.v3.3.6.js'),
    read('sw.js')
  ]);
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /data-build="3\.3\.6"/);
  assert.match(html, /styles\.css\?v=3\.3\.6/);
  assert.match(html, /src\/app\.v3\.3\.6\.mjs/);
  assert.match(html, /id="pause-start-time"/);
  assert.match(app, /register\("\.\/sw\.v3\.3\.6\.js"/);
  assert.match(app, /Pausa automatica in corso/);
  assert.match(app, /Pausa già applicata/);
  assert.match(worker, /chrono-flow-v3\.3\.6-mobile-safe-area/);
  assert.match(shim, /sw\.v3\.3\.6\.js/);
});
