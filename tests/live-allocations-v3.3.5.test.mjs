import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  automaticAllocationMinutes,
  buildAllocationEntries,
  manualDurationMinutes,
  minutesToManualDuration,
  normalizeAllocationPercentage
} from '../src/project-allocation-policy.mjs';
import { calculateDayWithBreakPolicy, normalizeBreakStartTime } from '../src/calculations.mjs';

process.env.TZ = 'Europe/Rome';

const [app, html, sharingView, migration] = await Promise.all([
  readFile(new URL('../src/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/calendar-sharing-view.v3.0.5.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/20261127_335_live_allocations_invitation_status.sql', import.meta.url), 'utf8')
]);

const at = (time) => `2026-11-27T${time}:00+01:00`;

test('allocazione automatica applica una percentuale stabile al timer netto', () => {
  assert.equal(automaticAllocationMinutes(4 * 3600, 50), 120);
  assert.equal(automaticAllocationMinutes((4 * 60 + 30) * 60, 50), 135);
  assert.equal(normalizeAllocationPercentage('37,5'), 37.5);
});

test('ore manuali conservano precisione al minuto e accettano gli esempi richiesti', () => {
  assert.equal(manualDurationMinutes(0, 30), 30);
  assert.equal(manualDurationMinutes(1, 15), 75);
  assert.equal(manualDurationMinutes(2, 45), 165);
  assert.equal(manualDurationMinutes(7, 36), 456);
  assert.deepEqual(minutesToManualDuration(75), { hours: 1, minutes: 15 });
  assert.throws(() => manualDurationMinutes(1, 60), /0 e 59/);
});

test('nuove allocazioni automatiche sono salvabili prima dell ingresso con percentuale persistente', () => {
  assert.deepEqual(buildAllocationEntries({ mode: 'automatic', projectIds: ['a', 'b'], workedSeconds: 0 }), [
    { projectId: 'a', durationMinutes: 1, allocationPercentage: 50 },
    { projectId: 'b', durationMinutes: 1, allocationPercentage: 50 }
  ]);
});

test('pausa configurata 12:45-13:15 sospende il netto e poi lo fa ripartire', () => {
  const events = [{ type: 'entry', at: at('08:43') }];
  const before = calculateDayWithBreakPolicy(events, 456, 10, 30, new Date(at('12:45')), '12:45');
  const during = calculateDayWithBreakPolicy(events, 456, 10, 30, new Date(at('13:00')), '12:45');
  const end = calculateDayWithBreakPolicy(events, 456, 10, 30, new Date(at('13:15')), '12:45');
  const resumed = calculateDayWithBreakPolicy(events, 456, 10, 30, new Date(at('13:17')), '12:45');
  assert.equal(before.workedMinutes, 242);
  assert.equal(during.workedMinutes, 242);
  assert.equal(end.workedMinutes, 242);
  assert.equal(resumed.workedMinutes, 244);
  assert.equal(during.automaticPauseActive, true);
  assert.equal(end.automaticPauseActive, false);
});

test('orario pausa accetta ore intere e HH:MM normalizzandole', () => {
  assert.equal(normalizeBreakStartTime('13'), '13:00');
  assert.equal(normalizeBreakStartTime('13:00'), '13:00');
  assert.equal(normalizeBreakStartTime('14'), '14:00');
  assert.equal(normalizeBreakStartTime('9'), '09:00');
  assert.equal(normalizeBreakStartTime('9:30'), '09:30');
  assert.equal(normalizeBreakStartTime('24'), '13:00');
  assert.equal(normalizeBreakStartTime('13:60'), '13:00');
});

test('pausa manuale sostituisce quella automatica senza doppio conteggio', () => {
  const events = [
    { type: 'entry', at: at('08:43') },
    { type: 'pause', at: at('12:40') },
    { type: 'resume', at: at('13:10') }
  ];
  const result = calculateDayWithBreakPolicy(events, 456, 10, 30, new Date(at('13:20')), '12:45');
  assert.equal(result.pausedMinutes, 30);
  assert.equal(result.defaultBreakAppliedSeconds, 0);
  assert.equal(result.breakSource, 'manual');
});

test('DOM integrato separa Registra attività dall editor della singola allocazione', () => {
  assert.match(html, /id="allocation-dialog"/);
  assert.match(html, /id="allocation-edit-dialog"/);
  assert.match(html, /id="allocation-edit-hours"[\s\S]*id="allocation-edit-minutes"/);
  assert.match(app, /openAllocationEditDialog\(allocation\.work_date, allocation\.id\)/);
  assert.doesNotMatch(html.match(/<dialog id="allocation-edit-dialog"[\s\S]*?<\/dialog>/)?.[0] || '', /allocation-project-search|type="checkbox"/);
});

test('Impostazioni espone orario pausa con fallback e microcopy accessibile', () => {
  assert.equal((html.match(/id="automatic-break-time"/g) || []).length, 1);
  assert.match(html, /id="automatic-break-time" type="text" inputmode="numeric"[\s\S]*pattern="\(\?:\[01\]\?\[0-9\]\|2\[0-3\]\)\(\?::\[0-5\]\[0-9\]\)\?"/);
  assert.match(html, /Puoi scrivere[\s\S]*13[\s\S]*13:00[\s\S]*14/);
  assert.match(app, /normalizeClockTime\(value, fallback = "13:00"\)/);
  assert.match(app, /addEventListener\("blur"[\s\S]*field\.value = normalized/);
  assert.match(app, /familySettings\.automatic_break_time = normalizeClockTime/);
  assert.match(html, /pulsante pausa resta oscurato, disabilitato e non cliccabile/);
  assert.match(app, /primary\.disabled = effectiveType === "absence" \|\| manualPauseUnavailable \|\| manualPauseCompleted/);
});

test('inviti hanno stati testuali, azioni coerenti e deduplica backend', () => {
  for (const label of ['In attesa', 'Attivo', 'Rifiutato', 'Annullato', 'Scaduto']) assert.match(sharingView, new RegExp(label));
  assert.match(sharingView, /Annulla invito/);
  assert.match(sharingView, /Revoca accesso/);
  assert.match(sharingView, /Esiste già un invito in attesa/);
  assert.match(migration, /select id into v_id[\s\S]*status = 'pending'/i);
  assert.match(migration, /return v_id;/i);
  assert.match(migration, /allocation_percentage numeric\(5,2\)/i);
  assert.doesNotMatch(migration, /drop table|truncate/i);
});
