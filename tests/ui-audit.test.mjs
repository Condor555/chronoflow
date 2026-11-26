import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const [html, css, app, liveClock] = await Promise.all([
  readFile(new URL("index.html", root), "utf8"),
  readFile(new URL("styles.css", root), "utf8"),
  readFile(new URL("src/app.js", root), "utf8"),
  readFile(new URL("src/live-clock.mjs", root), "utf8")
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
    "summary-preferences", "notification-settings", "family-settings", "holiday-settings", "security-settings", "data-settings"
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
});

test("home e recuperi hanno aggiornamento immediato", () => {
  assert.match(app, /createLiveClock\(\{\s*tick:\s*renderTodayTick,\s*intervalMs:\s*1000\s*\}\)/);
  assert.match(app, /visibilitychange/);
  assert.match(app, /pageshow/);
  assert.match(app, /pagehide/);
  assert.match(liveClock, /function start[\s\S]*stop\(\)/);
  assert.match(app, /previewSundayHolidaySettings/);
  assert.match(app, /\[name='sunday-holiday-rule'\]/);
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
  assert.match(app, /Storico malattia bambino/);
  assert.doesNotMatch(app, /for \(const period of childSicknessPeriodsForYear\(child, year\)\) \{\s*const days = sorted/);
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


test("schermate operative prive di riferimenti al foglio di sviluppo e numeri di release", () => {
  assert.doesNotMatch(html, /excel|foglio excel|baseline excel|versione\s+2\./i);
  assert.doesNotMatch(app, /excel|foglio excel|baseline excel|versione\s+2\./i);
  assert.match(html, /Storico mensile dell’anno/);
  assert.match(html, /12 mesi · valori consolidati/);
});

test("tabella annuale usa solo colonne comprensibili e mantiene gli istituti distinti", () => {
  for (const label of [
    "Giorni lavorativi teorici", "Ferie", "Festività soppresse", "Recupero riposo festività",
    "Malattia", "Malattia bambino", "Maternità obbligatoria", "Paternità obbligatoria",
    "Congedo parentale", "Giorni lavorativi effettivi", "Giorni smart",
    "Buoni pasto (competenza −2 mesi)", "Ore straordinario", "Recupero maggiori prestazioni",
    "Ore straordinario nette"
  ]) assert.match(app, new RegExp(label.replace(/[()]/g, "\\$&")));
  assert.doesNotMatch(app, /\["Teorici"|Fest\. sopp\.|Rec\. riposo|Mal\. bambino|Cong\. parentale|Pat\. obbl\.|Straord\./);
});

test("genitorialità separa limite legale e quota personale configurata", () => {
  for (const id of [
    "parental-family-situation", "parental-custom-legal-role", "parental-father-three-months",
    "parental-individual-limit", "parental-couple-limit", "child-parental-quota-months"
  ]) assert.match(html, new RegExp(`id=["']${id}["']`));
  assert.match(html, /Limite legale individuale|Limiti legali applicabili/);
  assert.match(html, /Quota personale da monitorare/);
  assert.match(app, /validateParentalLeaveQuota/);
  assert.doesNotMatch(app, /parentalLeave[^\n]*60|Congedo parentale[^\n]*\/\s*60/);
});

test("ferie cambia automaticamente anno e conserva la navigazione storica", () => {
  for (const id of ["leave-previous-year", "leave-next-year", "leave-go-current-year", "leave-current-year-status"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(app, /function ensureCurrentLeaveSettingsYear\(\)/);
  assert.match(app, /visibilitychange[\s\S]*ensureCurrentLeaveSettingsYear/);
  assert.match(app, /selectLeaveSettingsYear/);
  assert.match(html, /residuo dell’anno concluso diventa il riporto/);
});
