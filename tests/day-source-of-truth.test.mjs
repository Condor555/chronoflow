import test from 'node:test';
import assert from 'node:assert/strict';
import { applyHomeModeToDay, dayHasRecordedActivity, homeModeForToday, mayReplaceTodayFromCloud } from '../src/day-source-of-truth.mjs';

const TODAY = '2026-11-27';

test('Calendario oggi Smart: la Home riaperta resta Smart', () => {
  assert.equal(homeModeForToday({ work_date: TODAY, planned_type: 'smart', actual_type: null }), 'smart');
});

test('Calendario oggi Trasferta: il refresh resta Trasferta', () => {
  assert.equal(homeModeForToday({ work_date: TODAY, planned_type: 'travel', actual_type: 'travel' }), 'travel');
});

test('una vecchia modalità effettiva senza attività non sovrascrive la pianificazione odierna', () => {
  const day = { work_date: TODAY, planned_type: 'smart', actual_type: 'office', events: [] };
  assert.equal(homeModeForToday(day), 'smart');
  assert.equal(dayHasRecordedActivity(day), false);
});

test('anche dopo l’ingresso la modalità pianificata resta la fonte primaria della Home', () => {
  const day = {
    work_date: TODAY,
    planned_type: 'smart',
    actual_type: 'office',
    events: [{ type: 'entry', at: `${TODAY}T08:00:00.000Z` }]
  };
  assert.equal(dayHasRecordedActivity(day), true);
  assert.equal(homeModeForToday(day), 'smart');
});

test('gli eventi storici superati non fanno risultare iniziata la giornata', () => {
  const day = {
    work_date: TODAY,
    planned_type: 'travel',
    actual_type: 'office',
    events: [{ type: 'exit', at: `${TODAY}T16:00:00.000Z`, superseded: true }]
  };
  assert.equal(dayHasRecordedActivity(day), false);
  assert.equal(homeModeForToday(day), 'travel');
});

test('senza pianificazione la Home usa Ufficio', () => {
  assert.equal(homeModeForToday(null), 'office');
});

test('cambio Home Smart -> Ufficio aggiorna la stessa giornata', () => {
  const existing = { work_date: TODAY, planned_type: 'smart', actual_type: 'smart', events: [{ type: 'entry' }] };
  const updated = applyHomeModeToDay(existing, TODAY, 'office');
  assert.equal(updated.work_date, TODAY);
  assert.equal(updated.planned_type, 'office');
  assert.equal(updated.actual_type, 'office');
  assert.equal(updated.events, existing.events);
});

test('una sessione sincronizzata non sovrascrive modifiche locali in coda', () => {
  assert.equal(mayReplaceTodayFromCloud(new Set([TODAY]), TODAY), false);
  assert.equal(mayReplaceTodayFromCloud(new Set(), TODAY), true);
});
