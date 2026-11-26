import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
const browserTest = await readFile(new URL('./home-theme.browser.html', import.meta.url), 'utf8');

for (const mode of ['office','smart','travel']) {
  test(`${mode}: pill uses the card palette source token`, () => {
    assert.match(css, new RegExp(`\\.mode-pill\\.mode-${mode}[\\s\\S]{0,260}background:\\s*var\\(--${mode}-card-to\\)`, 'i'));
    assert.match(css, new RegExp(`\\.timer-card\\.mode-${mode}[\\s\\S]{0,300}linear-gradient\\([^;]+--${mode}-card-from[^;]+--${mode}-card-to`, 'i'));
  });
}

test('card gradients and decorative ring are intentionally preserved', () => {
  assert.match(css, /\.timer-card::after\s*\{[^}]*content:\s*''/s);
  assert.match(css, /\.timer-card\.mode-smart[\s\S]*background-image:\s*linear-gradient/i);
});

test('browser computed-style test covers every mode and WCAG contrast', () => {
  for (const mode of ['office','smart','travel']) assert.match(browserTest, new RegExp(`['\"]${mode}['\"]`));
  assert.match(browserTest, /getComputedStyle\(pill\)/);
  assert.match(browserTest, /contrastRatio/);
  assert.match(browserTest, />= 4\.5/);
});
