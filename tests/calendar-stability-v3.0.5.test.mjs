import test from 'node:test';
import assert from 'node:assert/strict';
import { CalendarSharingView } from '../src/calendar-sharing-view.v3.0.5.mjs';
import { normalizeCalendarRecord, normalizeCalendarRows } from '../src/calendar-record.v3.0.5.mjs';
import { sanitizeCalendarEntry } from '../src/calendar-privacy.v3.0.5.mjs';
import { createRouteController } from '../src/route-controller.v3.0.5.mjs';

class FakeRoot {
  constructor() { this.innerHTML = ''; this.listeners = new Map(); }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  removeEventListener(type) { this.listeners.delete(type); }
  querySelectorAll() { return []; }
}

function currentMonthDate(day = '12') {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${day}`;
}

function service(rows) {
  return {
    async ensurePersonalSpace() { return 'space-1'; },
    async getDashboard() { return { space: { id: 'space-1' }, settings: {}, invitations: [], members: [] }; },
    async listIncomingInvitations() { return []; },
    async listSharedCalendars() { return []; },
    async getSharedCalendar() { return rows; }
  };
}

async function openCalendar(rows, { logger = { error() {} }, announce = () => {} } = {}) {
  const root = new FakeRoot();
  const view = new CalendarSharingView(root, service(rows), { logger, announce });
  await view.init();
  return { root, view };
}

test('sessione autenticata -> Calendario -> mese con dati', async () => {
  let root;
  const routes = createRouteController({
    renderAuth() {},
    renderHome() {},
    async renderCalendar() { ({ root } = await openCalendar([{ work_date: currentMonthDate(), mode: 'smart', clock_in: '08:15:33' }])); }
  });
  assert.equal(await routes.go('calendar'), 'calendar');
  assert.match(root.innerHTML, /Organizza e confronta le giornate/);
  assert.match(root.innerHTML, /Smart Working/);
  assert.match(root.innerHTML, /Orario 08:15/);
  assert.doesNotMatch(root.innerHTML, /Caricamento\.\.\./);
});

test('sessione autenticata -> Calendario -> mese vuoto è uno stato valido', async () => {
  const { root } = await openCalendar([]);
  assert.match(root.innerHTML, /Nessuna giornata registrata/);
  assert.doesNotMatch(root.innerHTML, /Caricamento\.\.\./);
});

test('record undefined/null e shape Supabase vuote non bloccano il Calendario', async () => {
  for (const rows of [undefined, null, [], [undefined], [null], { data: undefined }, { data: [] }]) {
    const { root } = await openCalendar(rows);
    assert.match(root.innerHTML, /Nessuna giornata registrata/);
    assert.doesNotMatch(root.innerHTML, /Cannot read properties/);
  }
});

test('normalizzatore restituisce sempre uno stato esplicito', () => {
  for (const value of [undefined, null, [], { data: undefined }]) {
    assert.deepEqual(normalizeCalendarRecord(value, '2026-11-26'), {
      state: 'empty', exists: false, work_date: '2026-11-26', mode: null,
      is_absent: false, generic_absence_label: null, clock_in: null, clock_out: null,
      overtime_minutes: null, meal_voucher: null, leave_balance_days: null,
      absence_type: null, personal_notes: null, children_info: null
    });
  }
  assert.deepEqual(normalizeCalendarRows({ data: null }), []);
  assert.equal(sanitizeCalendarEntry(undefined, null).clock_in, null);
});

test('errori Calendar conservano Error/stack in console e rendono un fallback utilizzabile', async () => {
  const expected = new Error('backend detail');
  const logged = [];
  const announcements = [];
  const failing = service([]);
  failing.getSharedCalendar = async () => { throw expected; };
  const root = new FakeRoot();
  const view = new CalendarSharingView(root, failing, {
    logger: { error(...args) { logged.push(args); } },
    announce(...args) { announcements.push(args); }
  });
  await view.init();
  assert.equal(logged.length, 1);
  assert.equal(logged[0][1], expected);
  assert.match(logged[0][1].stack, /backend detail/);
  assert.match(root.innerHTML, /Calendario temporaneamente non disponibile/);
  assert.doesNotMatch(root.innerHTML, /backend detail/);
  assert.match(announcements[0][0], /Non è stato possibile caricare il calendario/);
});
