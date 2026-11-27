import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createClockInEntry,
  normalizeTodayRecord,
  TodayService
} from '../src/today.mjs';

const TODAY = '2026-11-26';

function calendarService({ dashboard, response } = {}) {
  const calls = [];
  return {
    calls,
    async getDashboard() {
      return dashboard ?? { space: { id: 'space-1' } };
    },
    async getSharedCalendar(spaceId, from, to) {
      calls.push(['get', spaceId, from, to]);
      return response;
    },
    async upsertProjection(entries) {
      calls.push(['upsert', entries]);
      return 1;
    }
  };
}

test('nessuna giornata oggi produce uno stato vuoto valido', async () => {
  const service = calendarService({ response: [] });
  const today = await new TodayService(service).load(TODAY);
  assert.equal(today, null);
  assert.deepEqual(service.calls, [['get', 'space-1', TODAY, TODAY]]);
});

test('giornata presente con clock_in viene normalizzata e renderizzabile', async () => {
  const service = calendarService({
    response: { data: [{ date: TODAY, work_mode: 'casa', start_time: '8:07:31' }] }
  });
  const today = await new TodayService(service).load(TODAY);
  assert.deepEqual(today, {
    work_date: TODAY,
    mode: 'smart',
    clock_in: '08:07',
    clock_out: null,
    is_absent: false
  });
});

test('risposte Supabase vuote, null o undefined non dereferenziano clock_in', () => {
  for (const response of [undefined, null, [], { data: undefined }, { data: null }, { rows: [] }]) {
    assert.equal(normalizeTodayRecord(response, TODAY), null);
  }
});

test('registrazione ingresso conserva modalità scelta e crea una giornata valida', async () => {
  const service = calendarService();
  const todayService = new TodayService(service);
  const saved = await todayService.clockIn({
    date: TODAY,
    mode: 'travel',
    now: new Date(2026, 10, 26, 8, 7, 31)
  });

  assert.equal(saved.mode, 'travel');
  assert.equal(saved.clock_in, '08:07');
  assert.deepEqual(service.calls[0], ['upsert', [{
    work_date: TODAY,
    mode: 'travel',
    clock_in: '08:07',
    clock_out: null,
    is_absent: false
  }]]);
});

test('entry factory accepts the empty-state mode picker values', () => {
  for (const mode of ['office', 'smart', 'travel']) {
    assert.equal(createClockInEntry({ date: TODAY, mode, now: new Date(2026, 10, 26, 9, 5) }).mode, mode);
  }
});

test('UI guards daily and calendar clock fields before reading them', async () => {
  const [app, calendarView] = await Promise.all([
    readFile(new URL('../src/app.v3.0.5.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/calendar-sharing-view.v3.0.5.mjs', import.meta.url), 'utf8')
  ]);
  assert.match(app, /record\?\.clock_in\s*\?\?\s*null/);
  assert.doesNotMatch(app, /record\.clock_in/);
  assert.match(calendarView, /normalizeCalendarRecord\(value\)/);
});
