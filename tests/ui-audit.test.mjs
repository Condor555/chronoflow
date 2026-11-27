import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const [html, css, app, liveClock, sw, homeDisplay] = await Promise.all([
  readFile(new URL("index.html", root), "utf8"),
  readFile(new URL("styles.css", root), "utf8"),
  readFile(new URL("src/app.js", root), "utf8"),
  readFile(new URL("src/live-clock.mjs", root), "utf8"),
  readFile(new URL("sw.v3.1.0.js", root), "utf8"),
  readFile(new URL("src/home-display.mjs", root), "utf8")
]);

test("MonthSelector Chrono Flow sostituisce i controlli month nativi", () => {
  assert.doesNotMatch(html, /type=["']month["']/i);
  for (const id of ["calendar-month-select", "calendar-year-select", "summary-month-select", "summary-year-select"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(css, /\.month-selector-shell/);
  assert.match(app, /selectMonth\("calendar"/);
  assert.match(app, /selectMonth\("summary"/);
});

test("tutte le card Impostazioni usano progressive disclosure con riepilogo", () => {
  const expected = [
    "profile-settings", "work-mode-settings", "leave-settings", "ticket-settings", "absence-settings",
    "summary-preferences", "calendar-sharing-settings", "notification-settings", "family-settings", "holiday-settings", "security-settings", "data-settings"
  ];
  for (const id of expected) {
    assert.match(html, new RegExp(`<details id=["']${id}["'][^>]*settings-disclosure`));
    assert.match(html, new RegExp(`aria-controls=["']${id}-panel["']`));
    assert.match(html, new RegExp(`id=["']${id}-panel["']`));
  }
  assert.match(html, /id="profile-settings-summary"/);
  assert.match(html, /id="holiday-settings-summary"/);
});

test("riepilogo annuale espone massimali, residuo e categorie consolidate", () => {
  for (const id of [
    "annual-vacation-usage", "annual-vacation-remaining", "annual-vacation-previous",
    "annual-vacation-current", "annual-suppressed-holidays", "annual-holiday-recovery"
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /Ferie anno precedente/);
  assert.match(html, /Festività soppresse/);
  assert.match(html, /Recupero riposo festività/);
  assert.match(css, /\.annual-entitlement-list/);
  assert.match(app, /annualLeaveBalanceForYear/);
  for (const id of ["month-detail-metrics", "annual-monthly-table-body", "family-limit-metrics", "meal-competence-note"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /Sabati lavorativi|Sabato lavorativo/);
  assert.match(css, /\.annual-monthly-table/);
});

test("icone, focus, touch target e movimento ridotto seguono il design system", () => {
  assert.doesNotMatch(html, />\s*[×‹›^]\s*</);
  assert.match(html, /class="icon-button ghost"[^>]*>\s*<svg/);
  assert.match(css, /\.icon-button[^\{]*\{[^}]*width:\s*44px[^}]*height:\s*44px/s);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(app, /prefers-reduced-motion:\s*reduce/);
});

test("layout contiene regole responsive per smartphone e desktop", () => {
  assert.match(css, /@media \(max-width:\s*680px\)/);
  assert.match(css, /@media \(max-width:\s*430px\)/);
  assert.match(css, /@media \(max-width:\s*340px\)/);
  assert.match(css, /width:\s*min\(100%,\s*880px\)/);
  assert.match(css, /\.month-selector-fields\s*\{[^}]*grid-template-columns/s);
  assert.match(css, /select\[id\$="-year-select"\][^\{]*\{[^}]*min-width:\s*(?:88|96)px/s);
});

test("home e recuperi hanno aggiornamento immediato", () => {
  assert.match(app, /createLiveClock\(\{\s*tick:\s*renderTodayTick,\s*intervalMs:\s*1000\s*\}\)/);
  assert.match(app, /visibilitychange/);
  assert.match(app, /pageshow/);
  assert.match(app, /pagehide/);
  assert.match(liveClock, /function start[\s\S]*stop\(\)/);
  assert.match(app, /previewSundayHolidaySettings/);
  assert.match(app, /\[name='sunday-holiday-rule'\]/);
  assert.match(app, /Orario completato/);
  assert.match(app, /secondsToDuration\(result\.overtimeSeconds\)/);
  assert.match(app, /result\.ordinaryWorkedSeconds/);
});

test("card timer usa esattamente i colori delle pill per Ufficio, Casa e Trasferta", () => {
  assert.match(html, /id="work-mode-label"/);
  assert.match(html, /id="work-timer-card"[^>]*class="hero-card mode-office"[^>]*data-mode="office"/);
  assert.match(app, /function updateHeroMode/);
  assert.match(app, /applyHomeModePresentation\(\$\("#work-timer-card"\), \$\("#work-mode-label"\), effectiveType, document\)/);
  assert.match(homeDisplay, /card\.classList\.remove\(\.\.\.HOME_MODE_CLASSES\)/);
  assert.match(homeDisplay, /card\.classList\.add\(presentation\.className\)/);
  assert.match(app, /updateHeroMode\(button\.dataset\.location\)[\s\S]*updateLocationChoice\(button\.dataset\.location\)[\s\S]*await saveDay/);
  for (const token of [
    "home-office-background", "home-office-foreground", "home-office-accent",
    "home-smart-background", "home-smart-foreground", "home-smart-accent",
    "home-travel-background", "home-travel-foreground", "home-travel-accent"
  ]) assert.match(css, new RegExp(`--${token}:`));
  for (const mode of ["office", "smart", "travel"]) {
    assert.match(css, new RegExp(`--home-${mode}-background:\\s*var\\(--${mode}\\);`));
    assert.match(css, new RegExp(`--home-${mode}-foreground:\\s*var\\(--${mode}-ink\\)`));
    assert.match(css, new RegExp(`--home-${mode}-accent:\\s*var\\(--${mode}-ink\\)`));
  }
  assert.match(css, /\.type-badge\s*\{[^}]*background:\s*var\(--office\)/);
  assert.match(css, /\.type-badge\.smart\s*\{[^}]*background:\s*var\(--smart\)/);
  assert.match(css, /\.type-badge\.travel\s*\{[^}]*background:\s*var\(--travel\)/);
  assert.match(css, /\.hero-card::after\s*\{\s*content:\s*none;/);
  assert.match(css, /\.hero-card\.mode-office/);
  assert.match(css, /\.hero-card\.mode-smart/);
  assert.match(css, /\.hero-card\.mode-travel/);
  assert.match(homeDisplay, /mode-office/);
  assert.match(homeDisplay, /mode-smart/);
  assert.match(homeDisplay, /mode-travel/);
  assert.match(sw, /\.\/styles\.css/);
  assert.match(sw, /\.\/src\/home-display\.mjs/);
  assert.match(sw, /isCodeOrStyle|codeOrStyle/);

  const luminance = (hex) => {
    const channels = hex.match(/[a-f\d]{2}/gi).map((value) => Number.parseInt(value, 16) / 255)
      .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  for (const [foreground, background] of [
    ["#124d7b", "#d6ecff"],
    ["#12624e", "#d8f4e8"],
    ["#56389a", "#ebe2ff"]
  ]) {
    const lighter = Math.max(luminance(foreground), luminance(background));
    const darker = Math.min(luminance(foreground), luminance(background));
    const ratio = (lighter + 0.05) / (darker + 0.05);
    assert.ok(ratio >= 4.5, `${foreground} su ${background} deve mantenere contrasto AA`);
  }
  assert.match(css, /\.action-stack \.primary[^}]*color:\s*var\(--home-mode-foreground\)[^}]*border-color:\s*var\(--home-mode-foreground\)/);
  assert.match(css, /\.action-stack \.secondary[^}]*color:\s*var\(--home-mode-foreground\)[^}]*border-color:\s*var\(--home-mode-foreground\)/);
});

test("assenze mostrano dati non mappati ed empty state esplicito", () => {
  assert.match(app, /Object\.entries\(counts\)/);
  assert.match(app, /Nessuna assenza nel periodo/);
  assert.match(css, /\.empty-state/);
});


test("riepilogo tracciabile e impostazioni evento mantengono causali e plafond separati", () => {
  for (const id of ["traceability-list", "child-expected-date", "child-event-type", "child-maternity-mode", "child-multiple-birth"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /2\+3 · ordinaria/);
  assert.match(html, /1\+4 · flessibile/);
  assert.match(html, /0\+5 · dopo il parto/);
  assert.match(app, /paternityMandatoryEntitlement/);
  assert.match(app, /maternityMandatoryEntitlement/);
  assert.match(css, /\.traceability-list/);
});

test("riepilogo usa una gerarchia mobile-first e mantiene il dettaglio su richiesta", () => {
  for (const id of ["summary-month-section", "summary-balance-section", "summary-ledger-section"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
    assert.match(html, new RegExp(`href=["']#${id}["']`));
  }
  for (const panel of [
    "summary-recovery-panel", "summary-overtime-panel", "summary-meal-panel", "traceability-panel",
    "legacy-history-panel", "family-limits-panel", "month-detail-panel", "annual-monthly-table-panel"
  ]) {
    assert.match(html, new RegExp(`aria-controls=["']${panel}["']`));
    assert.match(html, new RegExp(`id=["']${panel}["']`));
  }
  assert.doesNotMatch(html, /Rett\. maturati|Rett\. accredito|Straordinario lordo maturato|Straordinario netto\/residuo/);
  assert.match(html, /Maturato, compensato e residuo/);
  assert.match(html, /Verifica tecnica e storico rettifiche/);
  assert.match(css, /\.summary-jump-nav/);
  assert.match(css, /\.summary-card-primary/);
  assert.match(css, /\.reconciliation-metrics/);
  assert.match(app, /\["Buoni pasto", selected\.mealVouchers/);
  assert.match(app, /renderReconciliationDetails/);
});

test("malattia bambino mostra il solo periodo attivo e riconcilia lo storico in modo non distruttivo", () => {
  assert.match(app, /const activeSickness = childSicknessEntitlement\(child, new Date\(\)\)/);
  assert.match(app, /reconcileChildSicknessDays\(yearDays, familyChildren\(\)\)/);
  assert.match(app, /periodo teorico/);
  assert.match(html, /id="family-history-disclosure"/);
  assert.match(html, /Storico periodi conclusi/);
  assert.doesNotMatch(app, /for \(const period of childSicknessPeriodsForYear\(child, year\)\) \{\s*const days = sorted/);
});

test("Dati da sistemare consente riclassificazione sicura, associazione e undo", () => {
  for (const id of [
    "legacy-history-disclosure", "legacy-history-count", "classification-dialog", "classification-days",
    "classification-absence-type", "classification-child-id", "classification-confirm", "apply-classification"
  ]) assert.match(html, new RegExp(`id=["']${id}["']`));
  assert.match(html, /Dati da sistemare/);
  assert.match(app, /function unresolvedHistoryGroups/);
  assert.match(app, /function classificationCompatibilityErrors/);
  assert.match(app, /renderHistoricalUnclassified\(yearDays\)/);
  assert.match(app, /paternityMandatoryEntitlement\(child, day\.work_date/);
  assert.match(app, /showToast\(`\$\{updates\.length\}/);
  assert.match(app, /Riclassificazione annullata/);
});

test("quote parentali e periodi attivi restano separati per figlio", () => {
  for (const id of [
    "child-parental-settings", "child-parental-quota-months", "child-parental-single-parent",
    "child-parental-father-three", "child-parental-other-months", "child-parental-limit-preview"
  ]) assert.match(html, new RegExp(`id=["']${id}["']`));
  assert.match(app, /parentalLeaveMonitoringQuota/);
  assert.match(app, /Quota personale/);
  assert.doesNotMatch(app, /Congedo parentale[^\n]*60/);
});

test("Riepilogo operativo non espone Excel, baseline o versioni", () => {
  assert.doesNotMatch(html, /Excel|foglio Excel|Baseline Excel|versione\s+2\./i);
  assert.match(html, /Riepilogo mensile dell’anno/);
  assert.match(html, /Andamento mese per mese dell’anno selezionato/);
  assert.doesNotMatch(app, /\["Teorici"/);
  assert.match(app, /Giorni lavorativi teorici/);
  assert.match(app, /Maternità obbligatoria/);
  assert.match(app, /Paternità obbligatoria/);
  assert.match(app, /Congedo facoltativo \/ parentale/);
  const annualColumns = app.match(/const ANNUAL_TABLE_METRICS = \[([\s\S]*?)\n\];/)?.[1] || "";
  for (const label of [
    "Giorni lavorativi teorici", "Ferie", "Festività soppresse", "Recupero riposo festività",
    "Malattia", "Malattia bambino", "Maternità obbligatoria", "Paternità obbligatoria",
    "Congedo facoltativo / parentale", "Giorni lavorativi effettivi", "Giorni smart",
    "Buoni pasto (competenza -2 mesi)", "Ore straordinario", "Recupero maggiori prestazioni",
    "Ore straordinario nette"
  ]) assert.match(annualColumns, new RegExp(label.replace(/[()]/g, "\\$&")));
  assert.doesNotMatch(annualColumns, /Rettifiche|plafond|Paternità alternativa|Congedo matrimoniale|Sabati lavorativi/);
  assert.match(app, /return used \|\| \(\(role === "mother"/);
  assert.match(app, /return used \|\| \(\(role === "father"/);
});

test("rollover annuale aggiorna le Impostazioni alla riapertura senza perdere gli anni passati", () => {
  assert.match(html, /riporto automatico/);
  assert.match(html, /consultare e modificare gli anni passati/);
  assert.match(app, /function syncAnnualSettingsYearAfterRollover/);
  assert.match(app, /visibilitychange[\s\S]*syncAnnualSettingsYearAfterRollover/);
  assert.match(app, /pageshow[\s\S]*syncAnnualSettingsYearAfterRollover/);
});


test("Impostazioni governano applicabilità e preferenze senza eliminare lo storico", () => {
  for (const id of [
    "mode-office", "mode-smart", "mode-travel", "mode-saturday", "feature-sickness", "feature-marriage",
    "feature-performance-recovery", "parental-role", "summary-show-distribution", "summary-show-annual-table"
  ]) assert.match(html, new RegExp(`id=["']${id}["']`));
  assert.match(app, /function applyApplicabilityToUi\(\)/);
  assert.match(app, /function childInstitutes\(child\)/);
  assert.match(app, /absence_features/);
  assert.match(app, /summary_preferences/);
  assert.match(app, /causeHasUsage\(type\)/);
});
