import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
const browserTest = await readFile(new URL('./home-theme.browser.html', import.meta.url), 'utf8');

const expected = {
  office: ['#24364e', '#36566a'],
  smart: ['#1b334d', '#356a6c'],
  travel: ['#342c50', '#665083']
};

function luminance(hex) {
  const channels = hex.match(/[a-f\d]{2}/gi).map((value) => Number.parseInt(value, 16) / 255)
    .map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}

function contrast(left, right) {
  const values = [luminance(left), luminance(right)].sort((a,b) => b-a);
  return (values[0] + .05) / (values[1] + .05);
}

for (const [mode, [from, to]] of Object.entries(expected)) {
  test(`${mode}: Home usa una tonalità profonda coerente alla modalità`, () => {
    assert.match(css, new RegExp(`--home-${mode}-deep-from:\\s*${from}`, 'i'));
    assert.match(css, new RegExp(`--home-${mode}-deep-to:\\s*${to}`, 'i'));
    assert.match(css, new RegExp(`\\.hero-card\\.mode-${mode}[^}]*--home-mode-deep-from:\\s*var\\(--home-${mode}-deep-from\\)`, 'i'));
    assert.match(css, new RegExp(`\\.hero-card\\.mode-${mode}[^}]*--home-mode-deep-to:\\s*var\\(--home-${mode}-deep-to\\)`, 'i'));
    assert.ok(contrast(from, '#ffffff') >= 4.5, `${mode} from deve mantenere contrasto AA`);
    assert.ok(contrast(to, '#ffffff') >= 4.5, `${mode} to deve mantenere contrasto AA`);
  });
}

test('la card approvata usa gradiente ampio e decorazione circolare soft', () => {
  assert.match(css, /\.hero-card\s*\{[^}]*background-image:\s*linear-gradient\(/s);
  assert.match(css, /\.hero-card::after\s*\{[^}]*content:\s*""[^}]*border:[^}]*rgba\(255,\s*255,\s*255,\s*\.12\)[^}]*border-radius:\s*50%/s);
  assert.match(css, /\.hero-card\s*\{[^}]*min-height:\s*clamp\(280px/s);
});

test('uscita automatica e azioni sono integrate nel trattamento profondo', () => {
  assert.match(css, /\.hero-card \.hero-mode-label,\s*\.hero-card \.auto-exit-note/s);
  assert.match(css, /\.hero-card \.auto-exit-note[^}]*color:\s*#fff/s);
  assert.match(css, /\.hero-card \.action-stack \.primary[^}]*background:\s*rgba\(255,\s*255,\s*255,\s*\.97\)/s);
});

test('il test browser copre gradienti, decorazione e contrasto WCAG per ogni modalità', () => {
  for (const mode of ['office','smart','travel']) assert.match(browserTest, new RegExp(`['"]${mode}['"]`));
  assert.match(browserTest, /backgroundImage !== 'none'/);
  assert.match(browserTest, /getComputedStyle\(card, '::after'\)/);
  assert.match(browserTest, /contrastRatio/);
  assert.match(browserTest, />= 4\.5/);
});


test('pill esterna e pill interna usano gradienti coerenti ma non piatti', () => {
  assert.match(css, /\.type-badge \{[^}]*background:\s*linear-gradient/s);
  assert.match(css, /\.type-badge\.smart \{[^}]*background:\s*linear-gradient/s);
  assert.match(css, /\.type-badge\.travel \{[^}]*background:\s*linear-gradient/s);
  for (const mode of ['office','smart','travel']) {
    assert.match(css, new RegExp(`--home-${mode}-pill-from:`));
    assert.match(css, new RegExp(`--home-${mode}-pill-to:`));
  }
  assert.match(css, /\.hero-card \.hero-mode-label,[\s\S]*background:\s*linear-gradient/s);
});
