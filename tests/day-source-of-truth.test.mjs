import test from 'node:test';
import assert from 'node:assert/strict';
import { applyHomeModeToDay, homeModeForToday, mayReplaceTodayFromCloud } from '../src/day-source-of-truth.mjs';

const TODAY = '2026-11-27';

test('Calendario oggi Smart: la Home riaperta resta Smart', () => {
  assert.equal(homeModeForToday({ work_date: TODAY, planned_type: 'smart', actual_type: null }), 'smart');
});

test('Calendario oggi Trasferta: il refresh resta Trasferta', () => {
  assert.equal(homeModeForToday({ work_date: TODAY, planned_type: 'travel', actual_type: 'travel' }), 'travel');
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
