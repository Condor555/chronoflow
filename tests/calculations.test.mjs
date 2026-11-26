import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateDay,
  childSicknessEntitlement,
  eventsFromLocalTimes,
  exitNotificationTime,
  forecastExit,
  formatTime,
  minutesToDuration,
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
