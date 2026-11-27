import { normalizeCalendarRecord } from './calendar-record.v3.0.5.mjs';

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

export function sanitizeCalendarEntry(value, settings = DEFAULT_SHARING_SETTINGS) {
  const entry = normalizeCalendarRecord(value);
  const safeSettings = {
    ...DEFAULT_SHARING_SETTINGS,
    ...(settings && typeof settings === 'object' ? settings : {})
  };
  const {
    work_date, mode, is_absent, clock_in, clock_out, overtime_minutes,
    meal_voucher, leave_balance_days, absence_type, personal_notes, children_info
  } = entry;
  const result = {
    work_date,
    mode: safeSettings.share_work_mode ? mode : null,
    is_absent: Boolean(is_absent),
    generic_absence_label: safeSettings.share_generic_absence && is_absent ? 'Assente' : null,
    clock_in: safeSettings.share_times ? clock_in : null,
    clock_out: safeSettings.share_times ? clock_out : null,
    overtime_minutes: safeSettings.share_overtime ? overtime_minutes : null,
    meal_voucher: safeSettings.share_meal_vouchers ? meal_voucher : null,
    leave_balance_days: safeSettings.share_leave_balance ? leave_balance_days : null,
    absence_type: safeSettings.share_absence_details ? absence_type : null,
    personal_notes: safeSettings.share_personal_notes ? personal_notes : null,
    children_info: safeSettings.share_children_info ? children_info : null
  };
  if (!safeSettings.share_generic_absence && !safeSettings.share_absence_details) result.is_absent = false;
  return result;
}

export function entrySummary(value) {
  const { absence_type, generic_absence_label, mode } = normalizeCalendarRecord(value);
  if (absence_type) return absence_type;
  if (generic_absence_label) return generic_absence_label;
  if (mode && MODE_META[mode]) return MODE_META[mode].label;
  return 'Nessuna informazione condivisa';
}
