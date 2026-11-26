export const ABSENCE_TYPES = {
  vacation: 'Ferie',
  sick: 'Malattia',
  childSick: 'Malattia bambino',
  mandatoryLeave: 'Congedo obbligatorio',
  optionalLeave: 'Congedo facoltativo',
  suppressedHoliday: 'Festività soppressa',
  restRecovery: 'Recupero riposo',
  publicHoliday: 'Festivo',
  other: 'Altra assenza'
};

export const MODE_LABELS = {
  office: 'Ufficio',
  smart: 'Smart working',
  travel: 'Trasferta',
  absence: 'Assenza'
};

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

export function minutesFromTime(value) {
  if (!value || !/^\d{1,2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function timeFromMinutes(value) {
  if (!Number.isFinite(value)) return '—';
  const normalized = ((Math.round(value) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

export function formatMinutes(value, { signed = false } = {}) {
  if (!Number.isFinite(value)) return '—';
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '−' : (signed && rounded > 0 ? '+' : '');
  const abs = Math.abs(rounded);
  return `${sign}${Math.floor(abs / 60)}h ${String(abs % 60).padStart(2, '0')}m`;
}

export function dateKeyLocal(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function dateFromKey(key) {
  const [year, month, day] = String(key).split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function todayMinutes(now = new Date()) {
  return now.getHours() * 60 + now.getMinutes();
}

export function isWeekend(key) {
  const day = dateFromKey(key).getDay();
  return day === 0 || day === 6;
}

export function dayMode(day, settings) {
  return day?.actualMode || day?.plannedMode || settings.defaultMode || 'office';
}

export function defaultPauseForMode(mode, settings) {
  if (mode === 'smart') return Number(settings.pauseSmart) || 0;
  if (mode === 'travel') return Number(settings.pauseTravel) || 0;
  return Number(settings.pauseOffice) || 0;
}

function durationBetween(start, end) {
  const a = minutesFromTime(start);
  const b = minutesFromTime(end);
  if (a === null || b === null) return 0;
  return b >= a ? b - a : b + 1440 - a;
}

export function breakMinutes(day, now = new Date(), includeRunning = true) {
  const nowValue = todayMinutes(now);
  return (day?.breaks || []).reduce((total, item) => {
    if (!item?.start) return total;
    if (item.end) return total + durationBetween(item.start, item.end);
    if (!includeRunning) return total;
    const start = minutesFromTime(item.start);
    return total + Math.max(0, nowValue - start);
  }, 0);
}

export function workedMinutes(day, now = new Date()) {
  if (!day?.start || day?.absenceType) return 0;
  const start = minutesFromTime(day.start);
  let end = day.end ? minutesFromTime(day.end) : todayMinutes(now);
  if (start === null || end === null) return 0;
  if (end < start && day.end) end += 1440;
  if (!day.end && end < start) return 0;
  return Math.max(0, end - start - breakMinutes(day, now, true));
}

export function expectedExit(day, settings, now = new Date()) {
  if (!day?.start || day?.absenceType) return null;
  const start = minutesFromTime(day.start);
  if (start === null) return null;
  const mode = dayMode(day, settings);
  const plannedPause = defaultPauseForMode(mode, settings);
  const recordedBreak = breakMinutes(day, now, true);
  const pause = Math.max(plannedPause, recordedBreak);
  return start + Number(settings.workMinutes || 456) + pause;
}

export function calculateOvertime(rawWorkedMinutes, settings, treatmentOverride = '') {
  if (!settings.overtimeEnabled) return { raw: 0, counted: 0, treatment: 'none' };
  const contract = Number(settings.workMinutes || 456);
  const raw = Math.max(0, Math.round(rawWorkedMinutes - contract));
  const threshold = Math.max(0, Number(settings.overtimeThreshold || 0));
  let counted = 0;
  if (raw >= threshold) {
    counted = settings.overtimeThresholdMode === 'franchise' ? Math.max(0, raw - threshold) : raw;
  }
  const increment = Math.max(0, Number(settings.overtimeRounding || 0));
  if (increment > 0 && counted > 0) {
    const ratio = counted / increment;
    if (settings.overtimeRoundingMode === 'up') counted = Math.ceil(ratio) * increment;
    else if (settings.overtimeRoundingMode === 'nearest') counted = Math.round(ratio) * increment;
    else counted = Math.floor(ratio) * increment;
  }
  const maxDaily = Number(settings.overtimeDailyLimit || 0);
  if (maxDaily > 0) counted = Math.min(counted, maxDaily);
  const treatment = treatmentOverride || settings.overtimeTreatment || 'paid';
  if (treatment === 'none') counted = 0;
  return {
    raw,
    counted,
    treatment
  };
}

export function ticketEligible(day, settings, metrics = null) {
  if (!day || day.absenceType) return false;
  if (day.ticketOverride === true) return true;
  if (day.ticketOverride === false) return false;
  if (!day.end) return false;
  const mode = dayMode(day, settings);
  const rule = mode === 'smart' ? settings.ticketSmart : mode === 'travel' ? settings.ticketTravel : settings.ticketOffice;
  if (!rule) return false;
  const worked = metrics?.worked ?? workedMinutes(day);
  return worked >= Number(settings.ticketMinMinutes || 0);
}

export function getDayMetrics(day, settings, now = new Date()) {
  const worked = workedMinutes(day, now);
  const overtime = calculateOvertime(worked, settings, day?.overtimeTreatmentOverride);
  const expected = expectedExit(day, settings, now);
  const metrics = { worked, overtime, expected };
  metrics.ticket = ticketEligible(day, settings, metrics);
  return metrics;
}

export function* eachDate(startKey, endKey) {
  const cursor = dateFromKey(startKey);
  const end = dateFromKey(endKey);
  while (cursor <= end) {
    yield dateKeyLocal(cursor);
    cursor.setDate(cursor.getDate() + 1);
  }
}

export function summarize(days, settings, filter = {}) {
  const result = {
    workedDays: 0,
    office: 0,
    smartPlanned: 0,
    smartActual: 0,
    travel: 0,
    tickets: 0,
    overtimePaid: 0,
    overtimeRecovery: 0,
    overtimeInfo: 0,
    workedMinutes: 0,
    plannedOnly: 0,
    absences: Object.fromEntries(Object.keys(ABSENCE_TYPES).map(key => [key, 0]))
  };
  const prefix = filter.month ? `${filter.year}-${String(filter.month).padStart(2, '0')}` : String(filter.year || '');
  Object.entries(days || {}).forEach(([key, day]) => {
    if (prefix && !key.startsWith(prefix)) return;
    if (day.plannedMode === 'smart') result.smartPlanned += 1;
    if (day.absenceType) {
      if (day.status !== 'planned') result.absences[day.absenceType] = (result.absences[day.absenceType] || 0) + 1;
      else result.plannedOnly += 1;
      return;
    }
    const mode = day.actualMode || (day.end ? day.plannedMode : '');
    if (!day.end) {
      if (day.plannedMode) result.plannedOnly += 1;
      return;
    }
    result.workedDays += 1;
    if (mode === 'smart') result.smartActual += 1;
    else if (mode === 'travel') result.travel += 1;
    else result.office += 1;
    const metrics = getDayMetrics(day, settings, dateFromKey(key));
    result.workedMinutes += metrics.worked;
    if (metrics.ticket) result.tickets += 1;
    if (metrics.overtime.treatment === 'paid') result.overtimePaid += metrics.overtime.counted;
    else if (metrics.overtime.treatment === 'recovery') result.overtimeRecovery += metrics.overtime.counted;
    else result.overtimeInfo += metrics.overtime.counted;
  });
  return result;
}

export function ageOnDate(birthDate, asOfKey) {
  if (!birthDate) return null;
  const birth = dateFromKey(birthDate);
  const asOf = dateFromKey(asOfKey);
  let age = asOf.getFullYear() - birth.getFullYear();
  const beforeBirthday = asOf.getMonth() < birth.getMonth() || (asOf.getMonth() === birth.getMonth() && asOf.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function childPolicyFor(child, settings, asOfKey) {
  const age = ageOnDate(child?.birthDate, asOfKey);
  if (age === null) return null;
  return (settings.childPolicies || []).find(policy => age >= Number(policy.minAge || 0) && age <= Number(policy.maxAge ?? 99)) || null;
}

export function childLeaveBalance(child, days, settings, asOfKey) {
  const policy = childPolicyFor(child, settings, asOfKey);
  const year = dateFromKey(asOfKey).getFullYear();
  const ownUsed = Object.entries(days || {}).filter(([key, day]) => (
    key.startsWith(String(year)) && day.absenceType === 'childSick' && day.childId === child.id && day.status !== 'planned'
  )).length;
  const external = Math.max(0, Number(child.usedExternal || 0));
  const otherParent = Math.max(0, Number(child.usedOtherParent || 0));
  const allowance = policy ? Math.max(0, Number(policy.limitDays || 0)) : 0;
  return {
    policy,
    age: ageOnDate(child.birthDate, asOfKey),
    allowance,
    ownUsed,
    external,
    otherParent,
    remaining: Math.max(0, allowance - ownUsed - external - otherParent)
  };
}

export function validateTimeSequence(day) {
  const errors = [];
  if (day.end && !day.start) errors.push('Inserisci prima l’orario di ingresso.');
  (day.breaks || []).forEach((item, index) => {
    if (item.end && !item.start) errors.push(`Pausa ${index + 1}: manca l’inizio.`);
  });
  return errors;
}
