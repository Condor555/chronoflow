import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const [html, css, app] = await Promise.all([
  readFile(new URL("index.html", root), "utf8"),
  readFile(new URL("styles.css", root), "utf8"),
  readFile(new URL("src/app.js", root), "utf8")
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
    "profile-settings", "leave-settings", "ticket-settings", "notification-settings", "family-settings",
    "holiday-settings", "security-settings", "data-settings"
  ];
  for (const id of expected) {
    assert.match(html, new RegExp(`<details id=["']${id}["'][^>]*settings-disclosure`));
    assert.match(html, new RegExp(`aria-controls=["']${id}-panel["']`));
    assert.match(html, new RegExp(`id=["']${id}-panel["']`));
  }
  assert.match(html, /id="profile-settings-summary"/);
  assert.match(html, /id="holiday-settings-summary"/);
});

test("riepilogo annuale espone massimali, residuo e categorie del foglio Excel", () => {
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
  assert.match(app, /setInterval\(renderTodayTick,\s*1000\)/);
  assert.match(app, /previewSundayHolidaySettings/);
  assert.match(app, /\[name='sunday-holiday-rule'\]/);
});

test("assenze mostrano dati non mappati ed empty state esplicito", () => {
  assert.match(app, /Object\.entries\(counts\)/);
  assert.match(app, /Nessuna assenza nel periodo/);
  assert.match(css, /\.empty-state/);
});
