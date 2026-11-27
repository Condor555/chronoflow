import test from 'node:test';
import assert from 'node:assert/strict';
import {
  reconcileSmartAutomaticExit,
  smartAutomaticExitAt,
  smartAutomaticExitEnabled
} from '../src/smart-auto-exit.mjs';

const entry = (at = '2026-11-27T07:00:00.000Z') => ({ id: 'entry', type: 'entry', at });
const smartDay = (events) => ({ work_date: '2026-11-27', planned_type: 'smart', actual_type: 'smart', events });
const settingsOff = { smart: false, travel: false };

function activeAutoExit(result) {
  return result.day.events.find((event) => event.type === 'exit' && event.auto_exit === true && !event.superseded);
}

test('Smart senza straordinario usa la pausa standard e chiude all’istante calcolato', () => {
  const at = smartAutomaticExitAt({ events: [entry()], targetMinutes: 456, standardBreakMinutes: 30, now: '2026-11-27T15:06:00.000Z' });
  assert.equal(at.toISOString(), '2026-11-27T15:06:00.000Z');
  const result = reconcileSmartAutomaticExit(smartDay([entry()]), {
    overtimeSettings: settingsOff,
    targetMinutes: 456,
    standardBreakMinutes: 30,
    now: '2026-11-27T15:06:00.000Z',
    idFactory: () => 'auto-1'
  });
  assert.equal(activeAutoExit(result).at, '2026-11-27T15:06:00.000Z');
  assert.equal(result.closed, true);
});

test('Smart senza straordinario usa la pausa effettiva quando è registrata', () => {
  const events = [
    entry(),
    { id: 'pause', type: 'pause', at: '2026-11-27T11:00:00.000Z' },
    { id: 'resume', type: 'resume', at: '2026-11-27T11:42:00.000Z' }
  ];
  const at = smartAutomaticExitAt({ events, targetMinutes: 456, standardBreakMinutes: 60, now: '2026-11-27T15:18:00.000Z' });
  assert.equal(at.toISOString(), '2026-11-27T15:18:00.000Z');
});

test('una modifica successiva ricalcola l’uscita automatica e conserva la precedente nello storico', () => {
  const previous = {
    id: 'auto-old', type: 'exit', at: '2026-11-27T15:06:00.000Z',
    auto_exit: true, source: 'smart_auto_exit'
  };
  const result = reconcileSmartAutomaticExit(smartDay([entry('2026-11-27T07:15:00.000Z'), previous]), {
    overtimeSettings: settingsOff,
    targetMinutes: 456,
    standardBreakMinutes: 30,
    now: '2026-11-27T15:21:00.000Z',
    idFactory: () => 'auto-new'
  });
  assert.equal(result.day.events.find((event) => event.id === 'auto-old').superseded, true);
  assert.equal(activeAutoExit(result).id, 'auto-new');
  assert.equal(activeAutoExit(result).at, '2026-11-27T15:21:00.000Z');
});

test('attivare lo straordinario Smart riapre il flusso con uscita manuale senza cancellare lo storico automatico', () => {
  const previous = {
    id: 'auto-old', type: 'exit', at: '2026-11-27T15:06:00.000Z',
    auto_exit: true, source: 'smart_auto_exit'
  };
  const result = reconcileSmartAutomaticExit(smartDay([entry(), previous]), {
    overtimeSettings: { smart: true }, now: '2026-11-27T15:10:00.000Z'
  });
  assert.equal(result.automatic, false);
  assert.equal(result.day.events.find((event) => event.id === 'auto-old').superseded, true);
  assert.equal(activeAutoExit(result), undefined);
});

test('la regola non si applica automaticamente a Ufficio o Trasferta', () => {
  assert.equal(smartAutomaticExitEnabled('office', settingsOff), false);
  assert.equal(smartAutomaticExitEnabled('travel', settingsOff), false);
  const office = reconcileSmartAutomaticExit({ planned_type: 'office', events: [entry()] }, {
    overtimeSettings: settingsOff,
    now: '2026-11-27T18:00:00.000Z'
  });
  assert.equal(office.changed, false);
  assert.equal(office.automatic, false);
});
