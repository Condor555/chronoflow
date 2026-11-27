import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [html, app, calculations, sharing, sharingView, autoExit, migration, pwa, sw, uiTests, calcTests] = await Promise.all([
  read('index.html'), read('src/app.js'), read('src/calculations.mjs'),
  read('src/calendar-sharing.v3.0.5.mjs'), read('src/calendar-sharing-view.v3.0.5.mjs'),
  read('src/smart-auto-exit.mjs'), read('src/migration.mjs'), read('src/pwa-install.mjs'),
  read('sw.v3.2.1.js'), read('tests/ui-audit.test.mjs'), read('tests/calculations.test.mjs')
]);

const contracts = [
  ['navigazione e profilo', html, [/data-target="today"/, /data-target="calendar"/, /data-target="summary"/, /data-target="settings"/, /id="account-panel"/, /id="sign-out"/]],
  ['Home 2.9.4 completa', html, [/id="work-timer-card"/, /id="primary-action"/, /id="exit-action"/, /id="worked-value"/, /id="forecast-value"/, /id="overtime-value"/, /id="ticket-value"/]],
  ['Smart uscita automatica', app + autoExit, [/reconcileSmartAutomaticExit/, /Uscita automatica alle/, /standardBreakMinutes/, /superseded/]],
  ['Smart straordinario realtime', calculations + calcTests, [/overtimeEnabledForType/, /ordinaryWorkedSeconds/, /straordinario attivo separa timer ordinario/]],
  ['condivisione completa', sharing + sharingView, [/invite\(/, /revoke\(/, /updateSettings/, /renderShared/, /renderCompare/, /privacy-form/]],
  ['calendario personale preservato', html + app, [/id="calendar-personal-panel"/, /id="calendar-grid"/, /id="bulk-plan-form"/, /openDayDialog/]],
  ['Riepilogo e filtri', html + app, [/id="summary-screen"/, /summary_preferences/, /renderSummary/, /renderTraceabilityLedger/]],
  ['genitorialità e congedi', calculations + app + html, [/childSickness/, /maternity/, /paternity/, /parental_leave/, /children/]],
  ['ferie, recuperi e festività', calculations + app, [/annualLeaveBalance/, /holidayRecoveryBalance/, /suppressed/, /carryover/]],
  ['buoni pasto e mensili', calculations + app, [/ticketForDay/, /workbookMonthlySummary/, /meal|ticket/i]],
  ['storico e riclassificazione', app + migration + html, [/classification/, /reconcileChildSicknessDays/, /Dati da sistemare/]],
  ['notifiche e PWA', app + pwa + sw, [/showNotification/, /installBannerKind/, /preloadResponse/, /networkFirst/]],
  ['record null Calendar', sharingView, [/normalizeCalendarRecord/, /normalizeCalendarRows/, /safeRender/]],
  ['progressive disclosure', html + uiTests, [/settings-disclosure/, /summary-disclosure/, /data-disclosure/]]
];

for (const [name, source, patterns] of contracts) {
  test(`non regressione post-2.9.4: ${name}`, () => {
    for (const pattern of patterns) assert.match(source, pattern);
  });
}

test('la condivisione è un’estensione nativa: niente pulsante flottante o shell fallback', () => {
  assert.match(html, /data-calendar-scope="mine"[^>]*>Il mio</);
  assert.match(html, /data-calendar-scope="shared"[^>]*>Condivisi</);
  assert.match(html, /id="calendar-sharing-settings"[^>]*settings-disclosure/);
  assert.match(html, /id="calendar-sharing-settings-root"/);
  assert.doesNotMatch(html, /floating-settings/);
  assert.doesNotMatch(sharingView, /floating-settings/);
  assert.match(sharingView, /embeddedSettings/);
});
