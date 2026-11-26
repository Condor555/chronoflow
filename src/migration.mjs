const MVP_KEY = "orari-mobile-mvp-v1";
const ANONYMOUS_KEYS = [
  "orari:v2:days:anonymous",
  "orari:v2:queue:anonymous",
  "chrono-flow:v2:days:anonymous",
  "chrono-flow:v2:queue:anonymous"
];

export const LEGACY_STORAGE_KEYS = [MVP_KEY, ...ANONYMOUS_KEYS];

const DAY_TYPES = new Set(["office", "smart", "travel", "absence"]);
const ABSENCE_TYPES = new Set([
  "vacation", "sickness", "child_sickness", "parental_leave", "maternity_leave",
  "paternity_mandatory", "paternity_alternative", "marriage_leave", "mandatory_leave",
  "leave", "recovery", "sunday_holiday_recovery", "holiday"
]);
const CHILD_LINKED_ABSENCE_TYPES = new Set([
  "child_sickness", "parental_leave", "maternity_leave", "paternity_mandatory", "paternity_alternative"
]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const absenceMap = {
  vacation: "vacation",
  sick: "sickness",
  sickness: "sickness",
  childSick: "child_sickness",
  child_sickness: "child_sickness",
  mandatoryLeave: "mandatory_leave",
  optionalLeave: "parental_leave",
  parentalLeave: "parental_leave",
  maternityLeave: "maternity_leave",
  paternityMandatory: "paternity_mandatory",
  paternityAlternative: "paternity_alternative",
  marriageLeave: "marriage_leave",
  sundayHolidayRecovery: "sunday_holiday_recovery",
  leave: "leave",
  suppressedHoliday: "holiday",
  publicHoliday: "holiday",
  holiday: "holiday",
  restRecovery: "sunday_holiday_recovery",
  recovery: "recovery",
  other: "leave"
};

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function randomId() {
  return globalThis.crypto?.randomUUID?.() || `legacy-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function validDate(value) {
  if (!DATE_PATTERN.test(String(value || ""))) return false;
  const [year, month, day] = String(value).split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  return !Number.isNaN(date.getTime())
    && date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day;
}

function normalizeType(value, fallback = null) {
  return DAY_TYPES.has(value) ? value : fallback;
}

function normalizeAbsence(value) {
  const mapped = absenceMap[value] || value;
  return ABSENCE_TYPES.has(mapped) ? mapped : null;
}

function eventAt(workDate, time, previousTime) {
  if (!/^\d{1,2}:\d{2}$/.test(String(time || ""))) return null;
  const [hours, minutes] = String(time).split(":").map(Number);
  if (hours > 23 || minutes > 59) return null;
  const date = new Date(`${workDate}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`);
  if (Number.isNaN(date.getTime())) return null;
  if (previousTime && date.getTime() < previousTime) date.setDate(date.getDate() + 1);
  return date;
}

function legacyEvents(workDate, day) {
  const raw = [];
  if (day.start) raw.push(["entry", day.start]);
  for (const item of Array.isArray(day.breaks) ? day.breaks : []) {
    if (item?.start) raw.push(["pause", item.start]);
    if (item?.end) raw.push(["resume", item.end]);
  }
  if (day.end) raw.push(["exit", day.end]);

  const events = [];
  let previousTime = null;
  for (const [type, time] of raw) {
    const date = eventAt(workDate, time, previousTime);
    if (!date) continue;
    previousTime = date.getTime();
    events.push({ id: randomId(), type, at: date.toISOString() });
  }
  return events;
}

function normalizeCloudDay(day, fallbackDate) {
  const workDate = day?.work_date || day?.date || fallbackDate;
  if (!validDate(workDate)) return null;
  const planned = normalizeType(day.planned_type, "office");
  const actual = normalizeType(day.actual_type, null);
  const effective = actual || planned;
  const absence = effective === "absence" ? normalizeAbsence(day.absence_type) : null;
  return {
    work_date: workDate,
    planned_type: planned,
    actual_type: actual,
    absence_type: absence,
    child_id: CHILD_LINKED_ABSENCE_TYPES.has(absence) ? day.child_id || null : null,
    events: Array.isArray(day.events)
      ? day.events.filter((event) => event && ["entry", "pause", "resume", "exit"].includes(event.type) && !Number.isNaN(new Date(event.at).getTime()))
          .map((event) => ({ id: event.id || randomId(), type: event.type, at: new Date(event.at).toISOString() }))
      : [],
    ticket_override: effective === "absence" ? null : typeof day.ticket_override === "boolean" ? day.ticket_override : null,
    notes: typeof day.notes === "string" ? day.notes : ""
  };
}

function convertMvpDay(workDate, day = {}) {
  if (!validDate(workDate)) return null;
  const absence = normalizeAbsence(day.absenceType);
  const planned = absence
    ? "absence"
    : normalizeType(day.plannedMode, normalizeType(day.actualMode, "office"));
  let actual = normalizeType(day.actualMode, null);
  if (absence && day.status !== "planned") actual = "absence";
  if (!absence && !actual && (day.start || day.end)) actual = planned;
  const notes = [
    typeof day.notes === "string" ? day.notes.trim() : "",
    day.tripDestination ? `Destinazione trasferta: ${String(day.tripDestination).trim()}` : "",
    day.absenceType === "publicHoliday" ? "Causale importata: FESTIVO" : "",
    day.absenceType === "restRecovery" ? "Causale importata: REC.RIPOSO" : "",
    day.absenceType === "recovery" ? "Causale importata: REC. MAGG. PRES." : ""
  ].filter(Boolean).join("\n");

  return {
    work_date: workDate,
    planned_type: planned,
    actual_type: actual,
    absence_type: absence,
    child_id: CHILD_LINKED_ABSENCE_TYPES.has(absence) ? day.childId || null : null,
    events: absence ? [] : legacyEvents(workDate, day),
    ticket_override: planned === "absence" || actual === "absence" ? null : typeof day.ticketOverride === "boolean" ? day.ticketOverride : null,
    notes
  };
}

function convertMvpSettings(settings) {
  if (!settings || typeof settings !== "object") return null;
  const children = Array.isArray(settings.children) ? settings.children.map((child) => ({
    id: child.id || randomId(),
    name: String(child.name || "Figlio/a").slice(0, 80),
    birth_date: child.birth_date || child.birthDate || null,
    used_external: clamp(child.usedExternal, 0, 366, 0),
    used_other_parent: clamp(child.usedOtherParent, 0, 366, 0)
  })) : [];
  const policies = Array.isArray(settings.childPolicies) ? settings.childPolicies.map((policy) => ({
    id: policy.id || randomId(),
    label: String(policy.label || "Fascia").slice(0, 100),
    min_age: clamp(policy.minAge, 0, 99, 0),
    max_age: clamp(policy.maxAge, 0, 99, 99),
    limit_days: clamp(policy.limitDays, 0, 366, 0)
  })) : [];

  return {
    target_minutes: clamp(settings.workMinutes, 60, 900, 456),
    office_break_minutes: clamp(settings.pauseOffice, 0, 240, 30),
    smart_break_minutes: clamp(settings.pauseSmart, 0, 240, 60),
    travel_break_minutes: clamp(settings.pauseTravel, 0, 240, 30),
    overtime_threshold: clamp(settings.overtimeThreshold, 0, 240, 10),
    ticket_office: settings.ticketOffice !== false,
    ticket_smart: Boolean(settings.ticketSmart),
    ticket_travel: Boolean(settings.ticketTravel),
    family_settings: {
      children,
      child_policies: policies,
      legacy_balances: {
        vacation_previous: clamp(settings.vacationPrevious, 0, 366, 0),
        vacation_current: clamp(settings.vacationCurrent, 0, 366, 20),
        suppressed_holiday_allowance: clamp(settings.suppressedHolidayAllowance, 0, 366, 4),
        rest_recovery_allowance: clamp(settings.restRecoveryAllowance, 0, 366, 0)
      }
    }
  };
}

function readJson(storage, key, result) {
  const raw = storage.getItem(key);
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw);
    result.sourceKeys.push(key);
    return value;
  } catch {
    result.invalidKeys.push(key);
    return null;
  }
}

function mergeRows(days, rows) {
  if (!Array.isArray(rows)) return;
  for (const row of rows) {
    const normalized = normalizeCloudDay(row);
    if (normalized) days.set(normalized.work_date, normalized);
  }
}

function applyQueue(days, queue) {
  if (!Array.isArray(queue)) return;
  for (const operation of queue) {
    const workDate = operation?.work_date || operation?.payload?.work_date;
    if (!validDate(workDate)) continue;
    if (operation.op === "delete") days.delete(workDate);
    else {
      const normalized = normalizeCloudDay(operation.payload, workDate);
      if (normalized) days.set(workDate, normalized);
    }
  }
}

export function detectLegacyData(storage = globalThis.localStorage) {
  const result = { days: [], profilePatch: null, sourceKeys: [], invalidKeys: [] };
  const days = new Map();

  const mvp = readJson(storage, MVP_KEY, result);
  if (mvp && typeof mvp === "object") {
    for (const [workDate, day] of Object.entries(mvp.days || {})) {
      const converted = convertMvpDay(workDate, day);
      if (converted) days.set(workDate, converted);
    }
    result.profilePatch = convertMvpSettings(mvp.settings);
  }

  mergeRows(days, readJson(storage, "orari:v2:days:anonymous", result));
  applyQueue(days, readJson(storage, "orari:v2:queue:anonymous", result));
  mergeRows(days, readJson(storage, "chrono-flow:v2:days:anonymous", result));
  applyQueue(days, readJson(storage, "chrono-flow:v2:queue:anonymous", result));

  result.days = [...days.values()].sort((a, b) => a.work_date.localeCompare(b.work_date));
  result.hasData = result.days.length > 0 || Boolean(result.profilePatch);
  return result;
}

export function clearMigratedLegacyData(storage, sourceKeys) {
  for (const key of new Set(sourceKeys || [])) {
    if (LEGACY_STORAGE_KEYS.includes(key)) storage.removeItem(key);
  }
}
