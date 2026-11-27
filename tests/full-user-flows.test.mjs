import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateDayWithPolicies,
  eventsFromLocalTimes
} from '../src/calculations.mjs';
import {
  applyHomeModeToDay,
  homeModeForToday
} from '../src/day-source-of-truth.mjs';
import {
  buildAllocationDurations,
  searchProjects
} from '../src/project-allocation-policy.mjs';

process.env.TZ = 'Europe/Rome';

const DATE = '2026-11-27';
const profile = {
  targetMinutes: 456,
  overtimeThreshold: 10,
  type: 'office',
  overtime: { smart: false, travel: false },
  breakMinutes: 30
};

function tracked(day, now) {
  return calculateDayWithPolicies(
    day.events || [],
    profile.targetMinutes,
    profile.overtimeThreshold,
    day.planned_type || profile.type,
    profile.overtime,
    profile.breakMinutes,
    now
  );
}

class SyncedFlowStore {
  constructor(seed = []) {
    this.remoteDays = new Map(seed.map((day) => [day.work_date, structuredClone(day)]));
    this.localDays = new Map();
    this.allocations = new Map();
  }

  sync() {
    this.localDays = new Map([...this.remoteDays].map(([date, day]) => [date, structuredClone(day)]));
  }

  reopen() {
    const serialized = JSON.stringify([...this.localDays]);
    this.localDays = new Map(JSON.parse(serialized));
  }

  upsertDay(day) {
    const saved = structuredClone(day);
    this.localDays.set(saved.work_date, saved);
    this.remoteDays.set(saved.work_date, structuredClone(saved));
    return saved;
  }

  replaceAllocations(date, rows) {
    const existingByProject = new Map((this.allocations.get(date) || []).map((row) => [row.project_id, row]));
    const saved = rows.map((row) => ({
      ...row,
      id: existingByProject.get(row.project_id)?.id || `allocation-${row.project_id}`,
      work_date: date
    }));
    this.allocations.set(date, saved);
    return saved;
  }
}

test('flusso completo Home → Calendario → modifica → Home → riapertura/sincronizzazione', () => {
  const store = new SyncedFlowStore([{
    work_date: DATE,
    planned_type: 'smart',
    actual_type: 'office',
    absence_type: null,
    events: []
  }]);

  store.sync();
  assert.equal(homeModeForToday(store.localDays.get(DATE)), 'smart', 'la pianificazione Calendario vince in Home');

  const calendarDay = structuredClone(store.localDays.get(DATE));
  calendarDay.planned_type = 'travel';
  calendarDay.actual_type = 'travel';
  calendarDay.events = eventsFromLocalTimes(DATE, {
    entry: '08:00', pauseStart: '13:00', pauseEnd: '13:30', exit: '16:06'
  }, (() => { let id = 0; return () => `event-${++id}`; })());
  store.upsertDay(calendarDay);

  assert.equal(store.remoteDays.size, 1, 'il salvataggio aggiorna la giornata esistente senza duplicarla');
  assert.equal(homeModeForToday(store.localDays.get(DATE)), 'travel', 'il ritorno dal Calendario aggiorna subito la Home');
  assert.equal(tracked(store.localDays.get(DATE), new Date('2026-11-27T16:06:00+01:00')).workedMinutes, 456);

  store.reopen();
  assert.equal(homeModeForToday(store.localDays.get(DATE)), 'travel', 'refresh/riapertura mantiene la modalità');

  store.upsertDay(applyHomeModeToDay(store.localDays.get(DATE), DATE, 'smart'));
  store.sync();
  assert.equal(store.remoteDays.size, 1, 'il cambio successivo dalla Home usa ancora lo stesso record');
  assert.equal(homeModeForToday(store.localDays.get(DATE)), 'smart', 'un altro dispositivo sincronizzato riceve la nuova modalità');
});

test('flusso completo Calendario personale modifica assenza e conserva il condiviso come proiezione non mutabile', () => {
  const store = new SyncedFlowStore([{ work_date: DATE, planned_type: 'office', actual_type: null, absence_type: null, events: [] }]);
  store.sync();
  const personal = structuredClone(store.localDays.get(DATE));
  personal.planned_type = 'absence';
  personal.actual_type = 'absence';
  personal.absence_type = 'vacation';
  personal.events = [];
  store.upsertDay(personal);

  const sharedProjection = Object.freeze({ work_date: DATE, planned_type: personal.planned_type });
  assert.equal(store.remoteDays.size, 1);
  assert.equal(store.localDays.get(DATE).absence_type, 'vacation');
  assert.throws(() => { sharedProjection.planned_type = 'smart'; }, TypeError);
  assert.equal(store.remoteDays.get(DATE).planned_type, 'absence', 'la vista condivisa non modifica il dato personale');
});

test('flusso completo Home → Registra attività → ricerca multipla → salva → Home/Calendario/Riepilogo', () => {
  const projects = [
    { id: 'p1', code: 'RITM0033003', description: 'Assistenza opere', is_active: true },
    { id: 'p2', code: 'SAL-REG', description: 'Salerno Reggio Calabria', is_active: true },
    { id: 'p3', code: 'ARCH', description: 'Commessa archiviata', is_active: false }
  ];
  assert.deepEqual(searchProjects(projects, 'ritm').map((project) => project.id), ['p1']);
  assert.deepEqual(searchProjects(projects, 'reggio').map((project) => project.id), ['p2']);

  const store = new SyncedFlowStore([{
    work_date: DATE,
    planned_type: 'office',
    actual_type: 'office',
    events: eventsFromLocalTimes(DATE, { entry: '08:00', exit: '16:06' }, (() => { let id = 0; return () => `work-${++id}`; })())
  }]);
  store.sync();
  const workedMinutes = tracked(store.localDays.get(DATE), new Date('2026-11-27T16:06:00+01:00')).ordinaryWorkedMinutes;
  assert.equal(workedMinutes, 456);

  const automatic = buildAllocationDurations({ mode: 'automatic', projectIds: ['p1', 'p2'], workedMinutes });
  const saved = store.replaceAllocations(DATE, automatic.map((item) => ({
    project_id: item.projectId,
    duration_minutes: item.durationMinutes,
    allocation_method: 'automatic'
  })));
  assert.deepEqual(saved.map((row) => row.duration_minutes), [228, 228]);

  const homeAllocated = store.allocations.get(DATE).reduce((sum, row) => sum + row.duration_minutes, 0);
  const calendarProjects = store.allocations.get(DATE).length;
  const summaryByProject = Object.fromEntries(store.allocations.get(DATE).map((row) => [row.project_id, row.duration_minutes]));
  assert.equal(homeAllocated, 456, 'Home si aggiorna con il totale allocato');
  assert.equal(calendarProjects, 2, 'Calendario mostra entrambe le commesse');
  assert.deepEqual(summaryByProject, { p1: 228, p2: 228 }, 'Riepilogo usa gli stessi dati salvati');

  const manual = buildAllocationDurations({ mode: 'hours', projectIds: ['p1', 'p2'], workedMinutes, manualHours: { p1: '5', p2: '2,6' } });
  const updated = store.replaceAllocations(DATE, manual.map((item) => ({
    project_id: item.projectId,
    duration_minutes: item.durationMinutes,
    allocation_method: 'hours'
  })));
  assert.equal(new Set(updated.map((row) => row.id)).size, 2);
  assert.deepEqual(updated.map((row) => row.duration_minutes), [300, 156]);
});

test('flusso completo 13:00 → pausa automatica → chiusura/riapertura → ripresa', () => {
  const originalDay = {
    work_date: DATE,
    planned_type: 'office',
    actual_type: 'office',
    events: [{ id: 'entry', type: 'entry', at: '2026-11-27T08:00:00+01:00' }]
  };

  const before = tracked(originalDay, new Date('2026-11-27T12:59:59+01:00'));
  const start = tracked(originalDay, new Date('2026-11-27T13:00:00+01:00'));
  const during = tracked(originalDay, new Date('2026-11-27T13:15:00+01:00'));
  assert.equal(start.automaticBreakActive, true);
  assert.equal(during.automaticBreakActive, true);
  assert.equal(during.workedSeconds, start.workedSeconds, 'il lavoro resta fermo durante la pausa');
  assert.equal(during.pausedSeconds, 900);
  assert.equal(before.workedSeconds + 1, start.workedSeconds);

  const reopenedDay = JSON.parse(JSON.stringify(originalDay));
  const reopenedDuring = tracked(reopenedDay, new Date('2026-11-27T13:20:00+01:00'));
  assert.equal(reopenedDuring.workedSeconds, start.workedSeconds, 'la riapertura ricalcola dagli orari reali senza timer in background');
  assert.equal(reopenedDuring.automaticBreakRemainingSeconds, 600);

  const resumed = tracked(reopenedDay, new Date('2026-11-27T13:30:01+01:00'));
  assert.equal(resumed.automaticBreakActive, false);
  assert.equal(resumed.workedSeconds, start.workedSeconds + 1, 'alle 13:30 il conteggio riparte automaticamente');
  assert.equal(resumed.defaultBreakAppliedSeconds, 1800);
});
