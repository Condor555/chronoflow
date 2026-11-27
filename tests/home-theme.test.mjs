import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
const browserTest = await readFile(new URL('./home-theme.browser.html', import.meta.url), 'utf8');

const expected = {
  office: ['--office', '#d6ecff'],
  smart: ['--smart', '#d8f4e8'],
  travel: ['--travel', '#ebe2ff']
};

for (const [mode, [token, hex]] of Object.entries(expected)) {
  test(`${mode}: card e pill usano lo stesso colore pieno della baseline 2.9.4`, () => {
    assert.match(css, new RegExp(`${token}:\\s*${hex}`, 'i'));
    assert.match(css, new RegExp(`--home-${mode}-background:\\s*var\\(${token}\\)`, 'i'));
    assert.match(css, new RegExp(`\\.hero-card\\.mode-${mode}[^}]*--home-mode-background:\\s*var\\(--home-${mode}-background\\)`, 'i'));
  });
}

test('la card non reintroduce gradienti o decorazioni sovrapposte', () => {
  assert.match(css, /\.hero-card::after\s*\{\s*content:\s*none;/s);
  assert.doesNotMatch(css, /\.hero-card\.mode-smart[^}]*background-image:\s*linear-gradient/i);
});

test('il test browser copre ogni modalità, identità card/pill e contrasto WCAG', () => {
  for (const mode of ['office','smart','travel']) assert.match(browserTest, new RegExp(`['"]${mode}['"]`));
  assert.match(browserTest, /getComputedStyle\(card\)/);
  assert.match(browserTest, /contrastRatio/);
  assert.match(browserTest, />= 4\.5/);
  assert.match(browserTest, /cardStyle\.backgroundColor === pillStyle\.backgroundColor/);
});
