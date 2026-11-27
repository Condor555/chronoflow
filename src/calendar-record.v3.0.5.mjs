const MODE_ALIASES = Object.freeze({
  office: 'office', ufficio: 'office',
  smart: 'smart', home: 'smart', casa: 'smart', remote: 'smart',
  travel: 'travel', trasferta: 'travel', other: 'other'
});

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function unwrap(value) {
  if (value == null) return null;
  if (Array.isArray(value)) return value.find(isObject) || null;
  if (!isObject(value)) return null;
  for (const key of ['data', 'row', 'record', 'day', 'giornata']) {
    if (Object.hasOwn(value, key)) return unwrap(value[key]);
  }
  return value;
}

function normalizeTime(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function emptyCalendarRecord(expectedDate = null) {
  return Object.freeze({
    state: 'empty', exists: false, work_date: expectedDate,
    mode: null, is_absent: false, generic_absence_label: null,
    clock_in: null, clock_out: null, overtime_minutes: null,
    meal_voucher: null, leave_balance_days: null, absence_type: null,
    personal_notes: null, children_info: null
  });
}

export function normalizeCalendarRecord(value, expectedDate = null) {
  const source = unwrap(value);
  if (!source) return emptyCalendarRecord(expectedDate);

  const {
    work_date: workDateSnake, date, workDate,
    mode, work_mode: workMode, location,
    is_absent: isAbsentSnake, isAbsent,
    generic_absence_label: genericAbsenceLabel,
    clock_in: clockInSnake, clockIn, start_time: startTimeSnake, startTime,
    clock_out: clockOutSnake, clockOut, end_time: endTimeSnake, endTime,
    overtime_minutes: overtimeMinutes,
    meal_voucher: mealVoucher,
    leave_balance_days: leaveBalanceDays,
    absence_type: absenceType,
    personal_notes: personalNotes, notes,
    children_info: childrenInfo
  } = source;

  const normalizedDate = workDateSnake || date || workDate || expectedDate;
  if (expectedDate && normalizedDate && normalizedDate !== expectedDate) return emptyCalendarRecord(expectedDate);
  const normalizedMode = MODE_ALIASES[String(mode || workMode || location || '').trim().toLowerCase()] || null;

  return Object.freeze({
    state: 'present', exists: true, work_date: normalizedDate || null,
    mode: normalizedMode,
    is_absent: Boolean(isAbsentSnake ?? isAbsent ?? false),
    generic_absence_label: genericAbsenceLabel || null,
    clock_in: normalizeTime(clockInSnake ?? clockIn ?? startTimeSnake ?? startTime),
    clock_out: normalizeTime(clockOutSnake ?? clockOut ?? endTimeSnake ?? endTime),
    overtime_minutes: overtimeMinutes ?? null,
    meal_voucher: mealVoucher ?? null,
    leave_balance_days: leaveBalanceDays ?? null,
    absence_type: absenceType || null,
    personal_notes: personalNotes || notes || null,
    children_info: childrenInfo ?? null
  });
}

export function normalizeCalendarRows(value) {
  const raw = isObject(value) && Object.hasOwn(value, 'data') ? value.data : value;
  const rows = Array.isArray(raw) ? raw : (raw == null ? [] : [raw]);
  return rows
    .map((row) => normalizeCalendarRecord(row))
    .filter((row) => row.exists && /^\d{4}-\d{2}-\d{2}$/.test(row.work_date || ''));
}
