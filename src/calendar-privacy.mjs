export const DEFAULT_SHARING_SETTINGS = Object.freeze({
  share_work_mode: true,
  share_generic_absence: false,
  share_times: false,
  share_overtime: false,
  share_meal_vouchers: false,
  share_leave_balance: false,
  share_absence_details: false,
  share_personal_notes: false,
  share_children_info: false
});

export const MODE_META = Object.freeze({
  office: { label: 'Ufficio', icon: '🏢' },
  smart: { label: 'Smart Working', icon: '⌂' },
  travel: { label: 'Trasferta', icon: '✈' },
  other: { label: 'Altro', icon: '•' }
});

export function normalizeEmail(value) {
  return String(value || '').trim().toLocaleLowerCase('en-US');
}

export function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

export function minutesToDuration(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
  const total = Math.max(0, Math.round(Number(value)));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function sanitizeCalendarEntry(entry, settings = DEFAULT_SHARING_SETTINGS) {
  const result = {
    work_date: entry.work_date,
    mode: settings.share_work_mode ? (entry.mode || null) : null,
    is_absent: Boolean(entry.is_absent),
    generic_absence_label: settings.share_generic_absence && entry.is_absent ? 'Assente' : null,
    clock_in: settings.share_times ? (entry.clock_in || null) : null,
    clock_out: settings.share_times ? (entry.clock_out || null) : null,
    overtime_minutes: settings.share_overtime ? (entry.overtime_minutes ?? null) : null,
    meal_voucher: settings.share_meal_vouchers ? (entry.meal_voucher ?? null) : null,
    leave_balance_days: settings.share_leave_balance ? (entry.leave_balance_days ?? null) : null,
    absence_type: settings.share_absence_details ? (entry.absence_type || null) : null,
    personal_notes: settings.share_personal_notes ? (entry.personal_notes || null) : null,
    children_info: settings.share_children_info ? (entry.children_info ?? null) : null
  };
  if (!settings.share_generic_absence && !settings.share_absence_details) result.is_absent = false;
  return result;
}

export function entrySummary(entry) {
  if (entry.absence_type) return entry.absence_type;
  if (entry.generic_absence_label) return entry.generic_absence_label;
  if (entry.mode && MODE_META[entry.mode]) return MODE_META[entry.mode].label;
  return 'Nessuna informazione condivisa';
}
