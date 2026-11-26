import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateDay,
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
});
