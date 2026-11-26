import test from "node:test";
import assert from "node:assert/strict";
import { clearMigratedLegacyData, detectLegacyData } from "../src/migration.mjs";

class MemoryStorage {
  constructor(entries = {}) { this.values = new Map(Object.entries(entries)); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

test("converts the original anonymous MVP state", () => {
  const storage = new MemoryStorage({
    "orari-mobile-mvp-v1": JSON.stringify({
      version: 1,
      settings: {
        workMinutes: 480,
        pauseOffice: 45,
        pauseSmart: 60,
        pauseTravel: 30,
        overtimeThreshold: 30,
        ticketOffice: true,
        ticketSmart: false,
        ticketTravel: true,
        children: [{ id: "child-1", name: "Luca", birthDate: "2022-06-04", usedExternal: 1 }],
        childPolicies: []
      },
      days: {
        "2026-11-20": {
          plannedMode: "office",
          actualMode: "office",
          start: "08:30",
          breaks: [{ start: "12:30", end: "13:00" }],
          end: "17:00",
          ticketOverride: true,
          notes: "Prova"
        },
        "2026-11-21": {
          plannedMode: "absence",
          actualMode: "absence",
          absenceType: "childSick",
          childId: "child-1",
          status: "confirmed",
          breaks: []
        }
      }
    })
  });

  const found = detectLegacyData(storage);
  assert.equal(found.hasData, true);
  assert.equal(found.days.length, 2);
  assert.deepEqual(found.days[0].events.map((event) => event.type), ["entry", "pause", "resume", "exit"]);
  assert.equal(found.days[0].ticket_override, true);
  assert.equal(found.days[1].absence_type, "child_sickness");
  assert.equal(found.days[1].child_id, "child-1");
  assert.equal(found.profilePatch.target_minutes, 480);
  assert.equal(found.profilePatch.office_break_minutes, 45);
  assert.equal(found.profilePatch.family_settings.children[0].birth_date, "2022-06-04");
});

test("merges anonymous v2 caches and applies queued operations in order", () => {
  const storage = new MemoryStorage({
    "orari:v2:days:anonymous": JSON.stringify([
      { work_date: "2026-11-01", planned_type: "office", events: [], notes: "old" },
      { work_date: "2026-11-02", planned_type: "smart", events: [] }
    ]),
    "orari:v2:queue:anonymous": JSON.stringify([
      { op: "delete", work_date: "2026-11-02" },
      { op: "upsert", work_date: "2026-11-03", payload: { work_date: "2026-11-03", planned_type: "travel", events: [] } }
    ]),
    "chrono-flow:v2:days:anonymous": JSON.stringify([
      { work_date: "2026-11-01", planned_type: "smart", events: [], notes: "new" }
    ])
  });

  const found = detectLegacyData(storage);
  assert.deepEqual(found.days.map((day) => day.work_date), ["2026-11-01", "2026-11-03"]);
  assert.equal(found.days[0].planned_type, "smart");
  assert.equal(found.days[0].notes, "new");
  assert.equal(found.days[1].planned_type, "travel");
});

test("does not delete malformed data and clears only confirmed source keys", () => {
  const storage = new MemoryStorage({
    "orari-mobile-mvp-v1": "{not-json",
    "chrono-flow:v2:days:anonymous": JSON.stringify([{ work_date: "2026-11-05", planned_type: "office" }]),
    unrelated: "keep"
  });
  const found = detectLegacyData(storage);
  assert.deepEqual(found.invalidKeys, ["orari-mobile-mvp-v1"]);
  assert.deepEqual(found.sourceKeys, ["chrono-flow:v2:days:anonymous"]);

  clearMigratedLegacyData(storage, found.sourceKeys);
  assert.equal(storage.getItem("chrono-flow:v2:days:anonymous"), null);
  assert.equal(storage.getItem("orari-mobile-mvp-v1"), "{not-json");
  assert.equal(storage.getItem("unrelated"), "keep");
});

test("preserva le nuove tipologie di congedo e il collegamento al figlio", () => {
  const storage = new MemoryStorage({
    "chrono-flow:v2:days:anonymous": JSON.stringify([
      { work_date: "2026-04-01", planned_type: "absence", actual_type: "absence", absence_type: "parental_leave", child_id: "child-1" },
      { work_date: "2026-04-02", planned_type: "absence", actual_type: "absence", absence_type: "paternity_mandatory", child_id: "child-1" },
      { work_date: "2026-04-03", planned_type: "absence", actual_type: "absence", absence_type: "marriage_leave" },
      { work_date: "2026-04-04", planned_type: "absence", actual_type: "absence", absence_type: "sunday_holiday_recovery" }
    ])
  });
  const found = detectLegacyData(storage);
  assert.deepEqual(found.days.map((day) => day.absence_type), [
    "parental_leave", "paternity_mandatory", "marriage_leave", "sunday_holiday_recovery"
  ]);
  assert.equal(found.days[0].child_id, "child-1");
  assert.equal(found.days[1].child_id, "child-1");
  assert.equal(found.days[2].child_id, null);
});
