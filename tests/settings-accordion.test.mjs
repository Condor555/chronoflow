import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, app, sharingView, expectedControls] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/calendar-sharing-view.v3.0.5.mjs', import.meta.url), 'utf8'),
  readFile(new URL('./fixtures/settings-controls-3.2.0.json', import.meta.url), 'utf8').then(JSON.parse)
]);

const settings = html.slice(html.indexOf('<section id="settings-screen"'), html.indexOf('</main>'));
const tagPattern = /<(input|select|textarea)\b[^>]*\bid="([^"]+)"[^>]*>/g;
const attr = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] || '';
const currentControls = [...settings.matchAll(tagPattern)].map((match) => ({
  id: match[2], tag: match[1], type: attr(match[0], 'type'), name: attr(match[0], 'name')
}));
const byId = (items) => [...items].sort((a,b) => a.id.localeCompare(b.id));

const macroIds = [
  'profile-settings', 'work-mode-settings', 'ticket-settings', 'leave-settings',
  'family-settings', 'notification-settings', 'calendar-sharing-settings', 'account-data-settings'
];

test('Impostazioni espone soltanto le otto macro-sezioni concordate', () => {
  const macros = [...settings.matchAll(/<details id="([^"]+)" class="details-card settings-disclosure" data-settings-section/g)].map((match) => match[1]);
  assert.deepEqual(macros, macroIds);
  assert.equal((settings.match(/data-settings-section/g) || []).length, 8);
  assert.match(settings, /<strong>Giornata di lavoro<\/strong>/);
  assert.match(settings, /<strong>Modalità e straordinari<\/strong>/);
  assert.match(settings, /<strong>Ferie, festività e recuperi<\/strong>/);
  assert.match(settings, /<strong>Famiglia e congedi<\/strong>/);
  assert.match(settings, /<strong>Account e dati<\/strong>/);
});

test('single-open accordion conserva ARIA, focus e scroll mobile', () => {
  assert.match(app, /function initSettingsAccordion\(\)/);
  assert.match(app, /if \(other !== section\) other\.open = false/);
  assert.match(app, /summary\.setAttribute\("aria-expanded", String\(section\.open\)\)/);
  assert.match(app, /summary\?\.scrollIntoView\(\{ block: "start"/);
  assert.match(app, /summary\?\.focus\(\{ preventScroll: true \}\)/);
  assert.equal((settings.match(/data-settings-section[^>]*data-disclosure open/g) || []).length, 1);
  for (const id of macroIds) {
    assert.match(settings, new RegExp(`<details id="${id}"[\\s\\S]*?<summary[^>]*aria-controls="${id}-panel"`));
    assert.match(settings, new RegExp(`id="${id}-panel"`));
  }
});

test('il refactor non perde o duplica alcun controllo dati della build corrente', () => {
  assert.deepEqual(byId(currentControls), byId(expectedControls));
  assert.equal(new Set(currentControls.map((item) => item.id)).size, currentControls.length);
  assert.equal(currentControls.length, 52);
});

test('validazione apre la macro corretta prima di focalizzare un controllo invalido', () => {
  assert.match(html, /id="settings-form"[^>]*novalidate/);
  assert.match(app, /function revealInvalidSettingsControl\(form\)/);
  assert.match(app, /invalid\.closest\("details\[data-settings-section\]"\)/);
  assert.match(app, /invalid\.reportValidity\?\.\(\)/);
});

test('controlli avanzati restano presenti ma chiusi dentro la macro pertinente', () => {
  for (const id of ['absence-settings','summary-preferences','holiday-settings','security-settings','data-settings']) {
    assert.match(settings, new RegExp(`<details id="${id}" class="secondary-settings settings-advanced"`));
  }
  assert.doesNotMatch(settings, /<details id="(?:absence-settings|summary-preferences|holiday-settings|security-settings|data-settings)"[^>]*data-settings-section/);
});

test('Condivisione usa validazione inline accessibile invece del tooltip nativo', () => {
  assert.match(sharingView, /id="invite-form"[^>]*novalidate/);
  assert.match(sharingView, /id="invite-email-error"[^>]*role="alert"/);
  assert.match(sharingView, /if \(!isEmail\(email\)\)/);
  assert.match(sharingView, /setAttribute\('aria-invalid', 'true'\)/);
  assert.match(sharingView, /input\?\.focus\(\)/);
});

test('salvataggio generale e invito sono flussi indipendenti', () => {
  const settingsFormEnd = settings.indexOf('</form>');
  const sharingSectionStart = settings.indexOf('id="calendar-sharing-settings"');
  assert.ok(settingsFormEnd > 0);
  assert.ok(sharingSectionStart > settingsFormEnd, 'Condivisione non deve appartenere al form di salvataggio generale');
  assert.match(html, /id="settings-form"[^>]*novalidate/);
  assert.match(sharingView, /event\.target\.id === 'invite-form'/);
});

test('Condivisione OFF cambia label e nasconde inviti e permessi senza cancellarli', () => {
  assert.match(sharingView, /enabled \? 'Condivisione attiva' : 'Condivisione non attiva'/);
  assert.match(sharingView, /const activeControls = enabled \?/);
  assert.match(sharingView, /Inviti e permessi sospesi/);
  assert.match(sharingView, /Gli accessi e gli inviti già registrati restano conservati/);
  assert.match(sharingView, /space\?\.is_enabled !== true/);
  assert.doesNotMatch(sharingView, /deleteInvitation|deleteMember|clearInvitations/);
});
