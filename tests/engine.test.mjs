import test from 'node:test';
import assert from 'node:assert/strict';
import {
  minutesFromTime, timeFromMinutes, expectedExit, workedMinutes, calculateOvertime,
  ticketEligible, summarize, childLeaveBalance, ageOnDate
} from '../src/engine.js';

const settings = {
  defaultMode: 'office', workMinutes: 456, pauseOffice: 30, pauseSmart: 60, pauseTravel: 30,
  overtimeEnabled: true, overtimeThreshold: 10, overtimeThresholdMode: 'activation',
  overtimeRounding: 5, overtimeRoundingMode: 'down', overtimeTreatment: 'paid', overtimeDailyLimit: 0,
  ticketOffice: true, ticketSmart: true, ticketTravel: false, ticketMinMinutes: 360,
  childPolicies: []
};

test('converte correttamente gli orari', () => {
  assert.equal(minutesFromTime('08:35'), 515);
  assert.equal(timeFromMinutes(1001), '16:41');
  assert.equal(minutesFromTime('25:00'), null);
});

test('uscita prevista ufficio replica 08:35 + 7:36 + 00:30 = 16:41', () => {
  const result = expectedExit({ start: '08:35', actualMode: 'office', breaks: [] }, settings);
  assert.equal(timeFromMinutes(result), '16:41');
});

test('uscita prevista smart replica 09:00 + 7:36 + 01:00 = 17:36', () => {
  const result = expectedExit({ start: '09:00', actualMode: 'smart', breaks: [] }, settings);
  assert.equal(timeFromMinutes(result), '17:36');
});

test('ore lavorate sottraggono la pausa', () => {
  const day = { start: '08:20', end: '17:00', breaks: [{ start: '13:00', end: '13:30' }] };
  assert.equal(workedMinutes(day), 490);
});

test('soglia di attivazione e franchigia', () => {
  assert.deepEqual(calculateOvertime(481, settings), { raw: 25, counted: 25, treatment: 'paid' });
  const franchise = { ...settings, overtimeThresholdMode: 'franchise' };
  assert.deepEqual(calculateOvertime(481, franchise), { raw: 25, counted: 15, treatment: 'paid' });
});

test('arrotondamento straordinario per difetto', () => {
  const result = calculateOvertime(478, { ...settings, overtimeThreshold: 0, overtimeRounding: 15 });
  assert.equal(result.raw, 22);
  assert.equal(result.counted, 15);
});

test('trattamento non conteggiato azzera lo straordinario utile', () => {
  const result = calculateOvertime(500, { ...settings, overtimeTreatment: 'none' });
  assert.equal(result.raw, 44);
  assert.equal(result.counted, 0);
  assert.equal(result.treatment, 'none');
});

test('ticket applica regola, minimo e override', () => {
  const office = { actualMode: 'office', start: '09:00', end: '16:00', breaks: [] };
  assert.equal(ticketEligible(office, settings, { worked: 420 }), true);
  assert.equal(ticketEligible({ ...office, ticketOverride: false }, settings, { worked: 420 }), false);
  assert.equal(ticketEligible({ ...office, actualMode: 'travel' }, settings, { worked: 420 }), false);
});

test('riepilogo separa smart pianificato ed effettivo', () => {
  const days = {
    '2026-11-02': { plannedMode: 'smart', status: 'planned' },
    '2026-11-03': { plannedMode: 'smart', actualMode: 'office', start: '09:00', end: '17:06', breaks: [] },
    '2026-11-04': { plannedMode: 'smart', actualMode: 'smart', start: '09:00', end: '17:36', breaks: [{start:'13:00',end:'14:00'}] },
    '2026-11-05': { plannedMode: 'absence', absenceType: 'vacation', status: 'confirmed' }
  };
  const result = summarize(days, settings, { year: 2026, month: 11 });
  assert.equal(result.smartPlanned, 3);
  assert.equal(result.smartActual, 1);
  assert.equal(result.office, 1);
  assert.equal(result.absences.vacation, 1);
  assert.equal(result.plannedOnly, 1);
});

test('calcola età e residuo malattia bambino da policy configurata', () => {
  const child = { id: 'c1', birthDate: '2020-10-10', usedExternal: 1, usedOtherParent: 2 };
  const childSettings = { childPolicies: [{ id: 'p1', label: '3-8', minAge: 3, maxAge: 8, limitDays: 10 }] };
  const days = {
    '2026-01-12': { absenceType: 'childSick', childId: 'c1', status: 'confirmed' },
    '2026-02-10': { absenceType: 'childSick', childId: 'c1', status: 'planned' }
  };
  assert.equal(ageOnDate(child.birthDate, '2026-11-25'), 6);
  const balance = childLeaveBalance(child, days, childSettings, '2026-11-25');
  assert.equal(balance.ownUsed, 1);
  assert.equal(balance.remaining, 6);
});
