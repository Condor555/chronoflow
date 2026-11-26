import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SHARING_SETTINGS, isEmail, normalizeEmail, sanitizeCalendarEntry } from '../src/calendar-privacy.mjs';
import { enumerateDays, monthRange, startOfIsoWeek, toIsoDate, weekRange } from '../src/calendar-date.mjs';
import { mapChronoDaysToProjection } from '../src/calendar-sharing.mjs';

test('privacy defaults expose only the work mode', () => {
  const input = {
    work_date: '2026-11-26', mode: 'smart', is_absent: true, clock_in: '08:00', clock_out: '17:00',
    overtime_minutes: 42, meal_voucher: true, leave_balance_days: 9, absence_type: 'Malattia bambino',
    personal_notes: 'dato riservato', children_info: { name: 'Non condividere' }
  };
  assert.deepEqual(sanitizeCalendarEntry(input), {
    work_date: '2026-11-26', mode: 'smart', is_absent: false, generic_absence_label: null,
    clock_in: null, clock_out: null, overtime_minutes: null, meal_voucher: null,
    leave_balance_days: null, absence_type: null, personal_notes: null, children_info: null
  });
});

test('generic absence never reveals the detailed cause', () => {
  const result = sanitizeCalendarEntry({ work_date: '2026-11-27', is_absent: true, absence_type: 'Dato sanitario' }, {
    ...DEFAULT_SHARING_SETTINGS, share_generic_absence: true
  });
  assert.equal(result.is_absent, true);
  assert.equal(result.generic_absence_label, 'Assente');
  assert.equal(result.absence_type, null);
});

test('sensitive fields require independent opt-ins', () => {
  const input = { work_date: '2026-11-28', personal_notes: 'nota', children_info: { count: 1 }, overtime_minutes: 15 };
  const result = sanitizeCalendarEntry(input, { ...DEFAULT_SHARING_SETTINGS, share_personal_notes: true });
  assert.equal(result.personal_notes, 'nota');
  assert.equal(result.children_info, null);
  assert.equal(result.overtime_minutes, null);
});

test('email invitation normalization is strict', () => {
  assert.equal(normalizeEmail('  Nome@ESEMPIO.IT '), 'nome@esempio.it');
  assert.equal(isEmail('nome@esempio.it'), true);
  assert.equal(isEmail('nome esempio.it'), false);
});

test('month and ISO week ranges have inclusive boundaries', () => {
  assert.deepEqual(monthRange(2026, 1), { start: '2026-02-01', end: '2026-02-28' });
  assert.equal(toIsoDate(startOfIsoWeek('2026-11-26')), '2026-11-23');
  assert.deepEqual(weekRange('2026-11-26'), { start: '2026-11-23', end: '2026-11-29' });
  assert.equal(enumerateDays('2026-11-23', '2026-11-29').length, 7);
});

test('2.9.4 adapter preserves source values in owner-only projection', () => {
  const [result] = mapChronoDaysToProjection([{ date: '2026-11-26', mode: 'office', start_time: '08:10', end_time: '16:30', notes: 'x' }]);
  assert.equal(result.work_date, '2026-11-26');
  assert.equal(result.clock_in, '08:10');
  assert.equal(result.personal_notes, 'x');
});
