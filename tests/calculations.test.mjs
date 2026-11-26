import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateDay,
  calculateDayWithOvertimePolicy,
  childSicknessEntitlement,
  canUseSundayHolidayRecovery,
  easterSunday,
  eventsFromLocalTimes,
  exitNotificationTime,
  forecastExit,
  formatTime,
  holidayRecoveryBalance,
  minutesToDuration,
  overtimeEnabledForType,
  recognizedItalianHolidays,
  sundayHolidays,
  SUNDAY_HOLIDAY_RULES,
  ticketForDay
} from "../src/calculations.mjs";

const at = (time) => `2026-11-26T${time}:00+01:00`;

test("calcola 7:36 di lavoro con pausa di 30 minuti", () => {
  const events = [
    { type: "entry", at: at("08:35") },
    { type: "pause", at: at("12:30") },
    { type: "resume", at: at("13:00") },
    { type: "exit", at: at("16:41") }
  ];
  const result = calculateDay(events, 456, 10, new Date(at("16:41")));
  assert.equal(result.workedMinutes, 456);
  assert.equal(result.pausedMinutes, 30);
  assert.equal(result.overtimeMinutes, 0);
  assert.equal(result.state, "finished");
});

test("prevede uscita alle 16:41 da ingresso 08:35", () => {
  const exit = forecastExit([{ type: "entry", at: at("08:35") }], 456, 30, new Date(at("09:00")));
  assert.equal(formatTime(exit), "16:41");
});

test("applica la soglia allo straordinario", () => {
  const events = [
    { type: "entry", at: at("08:00") },
    { type: "exit", at: at("15:45") }
  ];
  assert.equal(calculateDay(events, 456, 10, new Date(at("15:45"))).overtimeMinutes, 0);
  assert.equal(calculateDay(events, 456, 5, new Date(at("15:45"))).overtimeMinutes, 9);
});

test("straordinario Smart Working e trasferta disattivato di default", () => {
  assert.equal(overtimeEnabledForType("office", {}), true);
  assert.equal(overtimeEnabledForType("smart", {}), false);
  assert.equal(overtimeEnabledForType("travel", {}), false);
});

test("straordinario Smart Working e trasferta può essere abilitato separatamente", () => {
  assert.equal(overtimeEnabledForType("smart", { smart: true, travel: false }), true);
  assert.equal(overtimeEnabledForType("travel", { smart: true, travel: false }), false);
  assert.equal(overtimeEnabledForType("travel", { smart: false, travel: true }), true);
});

test("la policy azzera lo straordinario senza modificare le ore lavorate", () => {
  const events = [
    { type: "entry", at: at("08:00") },
    { type: "exit", at: at("16:00") }
  ];
  const disabled = calculateDayWithOvertimePolicy(events, 456, 10, "smart", {}, new Date(at("16:00")));
  const enabled = calculateDayWithOvertimePolicy(events, 456, 10, "smart", { smart: true }, new Date(at("16:00")));
  assert.equal(disabled.workedMinutes, 480);
  assert.equal(disabled.overtimeMinutes, 0);
  assert.equal(enabled.overtimeMinutes, 24);
});

test("formatta durate superiori a 24 ore", () => {
  assert.equal(minutesToDuration(1565), "26:05");
});

test("ticket: override e regole profilo", () => {
  const profile = { ticket_office: true, ticket_smart: false, ticket_travel: true };
  assert.equal(ticketForDay(profile, { actual_type: "office", ticket_override: null }), true);
  assert.equal(ticketForDay(profile, { actual_type: "smart", ticket_override: null }), false);
  assert.equal(ticketForDay(profile, { actual_type: null, planned_type: "travel", ticket_override: null }), true);
  assert.equal(ticketForDay(profile, { actual_type: "smart", ticket_override: true }), true);
  assert.equal(ticketForDay(profile, { actual_type: "absence", ticket_override: true }), false);
});

test("malattia bambino: i 30 giorni seguono l'anno di vita, non l'anno solare", () => {
  const child = { birth_date: "2024-06-10" };
  const firstLifeYear = childSicknessEntitlement(child, "2025-01-15", 4, 2);
  assert.equal(firstLifeYear.tier, "under_three");
  assert.equal(firstLifeYear.lifeYear, 1);
  assert.equal(firstLifeYear.periodEnd, "2025-06-10");
  assert.equal(firstLifeYear.remainingPaidDays, 24);

  const secondLifeYear = childSicknessEntitlement(child, "2025-06-11", 1, 0);
  assert.equal(secondLifeYear.lifeYear, 2);
  assert.equal(secondLifeYear.periodStart, "2025-06-11");
  assert.equal(secondLifeYear.remainingPaidDays, 29);
});

test("malattia bambino: dai 3 ai 14 anni applica 10 giorni per anno solare", () => {
  const result = childSicknessEntitlement({ birth_date: "2020-04-03" }, "2026-11-26", 3, 2);
  assert.equal(result.tier, "three_to_fourteen");
  assert.equal(result.periodStart, "2026-01-01");
  assert.equal(result.remainingDays, 5);
});

test("ricostruisce gli orari modificati dal calendario", () => {
  let id = 0;
  const events = eventsFromLocalTimes("2026-11-20", {
    entry: "08:30",
    pauseStart: "13:00",
    pauseEnd: "13:30",
    exit: "16:36"
  }, () => `id-${++id}`);
  assert.deepEqual(events.map((event) => event.type), ["entry", "pause", "resume", "exit"]);
  assert.equal(calculateDay(events, 456, 10, new Date(events.at(-1).at)).workedMinutes, 456);
});

test("calcola l'istante di notifica prima dell'uscita", () => {
  const notification = exitNotificationTime(new Date("2026-11-26T17:00:00+01:00"), 10);
  assert.equal(notification.toISOString(), "2026-11-26T15:50:00.000Z");
});

test("festività: calcola Pasqua e Lunedì dell’Angelo 2026", () => {
  assert.equal(easterSunday(2026).toISOString().slice(0, 10), "2026-04-05");
  assert.ok(recognizedItalianHolidays(2026).some((item) => item.date === "2026-04-06"));
});

test("festività: rileva Ognissanti come festività domenicale 2026", () => {
  assert.deepEqual(sundayHolidays(2026).map((item) => item.date), ["2026-11-01"]);
});

test("festività: non duplica il credito se la festa locale coincide con quella nazionale", () => {
  const holidays = recognizedItalianHolidays(2026, { name: "Festa locale", month: 11, day: 1 });
  assert.equal(holidays.filter((item) => item.date === "2026-11-01").length, 1);
});

test("recuperi: matura soltanto quando la festività domenicale è trascorsa", () => {
  const before = holidayRecoveryBalance({ year: 2026, rule: SUNDAY_HOLIDAY_RULES.ACCRUE_DAY, asOf: "2026-10-31" });
  const after = holidayRecoveryBalance({ year: 2026, rule: SUNDAY_HOLIDAY_RULES.ACCRUE_DAY, asOf: "2026-11-01" });
  assert.equal(before.automaticAccrued, 0);
  assert.equal(after.automaticAccrued, 1);
});

test("recuperi: utilizzati e correzione aggiornano il disponibile", () => {
  const balance = holidayRecoveryBalance({
    year: 2027,
    rule: SUNDAY_HOLIDAY_RULES.ACCRUE_DAY,
    usedDates: ["2027-05-02", "2027-05-02"],
    adjustment: 1,
    asOf: "2027-12-31"
  });
  assert.equal(balance.automaticAccrued, 3);
  assert.equal(balance.used, 1);
  assert.equal(balance.available, 3);
});

test("recuperi: compensazione economica e nessun recupero non creano saldo", () => {
  for (const rule of [SUNDAY_HOLIDAY_RULES.ECONOMIC_ONLY, SUNDAY_HOLIDAY_RULES.NONE]) {
    const balance = holidayRecoveryBalance({ year: 2026, rule, adjustment: 8, asOf: "2026-12-31" });
    assert.equal(balance.accrued, 0);
    assert.equal(balance.available, 0);
    assert.equal(canUseSundayHolidayRecovery(balance, "2026-11-10").allowed, false);
  }
});
