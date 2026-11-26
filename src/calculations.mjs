export const DAY_TYPES = {
  office: { label: "Ufficio", icon: "🏢" },
  smart: { label: "Smart working", icon: "⌂" },
  travel: { label: "Trasferta", icon: "↗" },
  absence: { label: "Assenza", icon: "—" }
};

export const ABSENCE_TYPES = {
  vacation: "Ferie",
  sickness: "Malattia",
  child_sickness: "Malattia bambino",
  parental_leave: "Congedo parentale (facoltativo)",
  maternity_leave: "Congedo di maternità obbligatorio",
  paternity_mandatory: "Congedo di paternità obbligatorio",
  paternity_alternative: "Congedo di paternità alternativo",
  marriage_leave: "Congedo matrimoniale",
  mandatory_leave: "Congedo obbligatorio (storico)",
  leave: "Congedo (storico)",
  recovery: "Recupero maggiori prestazioni",
  sunday_holiday_recovery: "Recupero festività caduta di domenica",
  holiday: "Festività soppresse"
};

export const CHILD_LINKED_ABSENCE_TYPES = new Set([
  "child_sickness",
  "parental_leave",
  "maternity_leave",
  "paternity_mandatory",
  "paternity_alternative"
]);

export const SUNDAY_HOLIDAY_RULES = Object.freeze({
  ACCRUE_DAY: "accrue_day",
  ECONOMIC_ONLY: "economic_only",
  NONE: "none",
  MANUAL: "manual"
});

const FIXED_ITALIAN_HOLIDAYS = Object.freeze([
  [1, 1, "Capodanno"],
  [1, 6, "Epifania"],
  [4, 25, "Festa della Liberazione"],
  [5, 1, "Festa dei lavoratori"],
  [6, 2, "Festa della Repubblica"],
  [8, 15, "Ferragosto"],
  [11, 1, "Ognissanti"],
  [12, 8, "Immacolata Concezione"],
  [12, 25, "Natale"],
  [12, 26, "Santo Stefano"]
]);

const EXCEL_ABSENCE_GROUPS = Object.freeze({
  vacation: new Set(["vacation"]),
  suppressedHolidays: new Set(["holiday"]),
  holidayRecovery: new Set(["sunday_holiday_recovery"]),
  sickness: new Set(["sickness"]),
  childSickness: new Set(["child_sickness"]),
  mandatoryLeave: new Set(["maternity_leave", "paternity_mandatory", "paternity_alternative", "mandatory_leave"]),
  optionalLeave: new Set(["parental_leave", "leave"]),
  performanceRecovery: new Set(["recovery"])
});

export function clampInt(value, min, max, fallback = min) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function annualAllowance(settings, year, key, defaultKey, fallback) {
  const yearly = settings?.years?.[String(year)] || {};
  return clampInt(yearly[key], 0, 366, clampInt(settings?.[defaultKey], 0, 366, fallback));
}

function optionalCarryoverOverride(settings, year) {
  const value = settings?.years?.[String(year)]?.carryover_override;
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? clampInt(parsed, 0, 366, 0) : null;
}

export function isRecognizedPublicHolidayDay(day, localHoliday = null) {
  const date = String(day?.work_date || "").slice(0, 10);
  const year = Number(date.slice(0, 4));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(year)) return false;
  if (/\b(FESTIVO|PUBLIC[ _-]?HOLIDAY)\b/i.test(String(day?.notes || ""))) return true;
  return recognizedItalianHolidays(year, localHoliday).some((holiday) => holiday.date === date);
}

export function isSuppressedHolidayDay(day, localHoliday = null) {
  const effectiveType = day?.actual_type || day?.planned_type;
  return effectiveType === "absence"
    && day?.absence_type === "holiday"
    && !isRecognizedPublicHolidayDay(day, localHoliday);
}

function countedAnnualAbsences(days, year, absenceType) {
  return (days || []).filter((day) => {
    const effectiveType = day?.actual_type || day?.planned_type;
    const matchesType = absenceType === "holiday"
      ? isSuppressedHolidayDay(day)
      : day?.absence_type === absenceType;
    return effectiveType === "absence"
      && matchesType
      && String(day?.work_date || "").startsWith(`${year}-`);
  }).length;
}

export function annualLeaveBalance({ year, days = [], settings = {} } = {}) {
  const selectedYear = clampInt(year, 2000, 2100, new Date().getFullYear());
  const previousYear = selectedYear - 1;
  const previousVacationAllowance = annualAllowance(settings, previousYear, "vacation_days", "default_vacation_days", 20);
  const previousOpening = optionalCarryoverOverride(settings, previousYear) || 0;
  const previousYearUsed = countedAnnualAbsences(days, previousYear, "vacation");
  const automaticCarryover = Math.max(0, previousOpening + previousVacationAllowance - previousYearUsed);
  const selectedOverride = optionalCarryoverOverride(settings, selectedYear);
  const previousAvailable = selectedOverride ?? automaticCarryover;
  const currentAvailable = annualAllowance(settings, selectedYear, "vacation_days", "default_vacation_days", 20);
  const vacationUsed = countedAnnualAbsences(days, selectedYear, "vacation");
  const previousUsed = Math.min(previousAvailable, vacationUsed);
  const currentUsed = Math.max(0, vacationUsed - previousUsed);
  const vacationTotal = previousAvailable + currentAvailable;
  const vacationRemaining = Math.max(0, vacationTotal - vacationUsed);
  const suppressedAvailable = annualAllowance(settings, selectedYear, "suppressed_holiday_days", "default_suppressed_holiday_days", 4);
  const suppressedUsed = countedAnnualAbsences(days, selectedYear, "holiday");

  return {
    year: selectedYear,
    previousYear,
    carryoverSource: selectedOverride === null ? "automatic" : "override",
    vacation: {
      used: vacationUsed,
      total: vacationTotal,
      remaining: vacationRemaining,
      exceeded: Math.max(0, vacationUsed - vacationTotal),
      previous: { used: previousUsed, total: previousAvailable },
      current: { used: currentUsed, total: currentAvailable }
    },
    suppressedHolidays: {
      used: suppressedUsed,
      total: suppressedAvailable,
      remaining: Math.max(0, suppressedAvailable - suppressedUsed),
      exceeded: Math.max(0, suppressedUsed - suppressedAvailable)
    }
  };
}

export function minutesToDuration(totalMinutes) {
  const safe = Math.max(0, Math.round(Number(totalMinutes) || 0));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

export function secondsToDuration(totalSeconds) {
  const safe = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function calculateDay(events = [], targetMinutes = 456, overtimeThreshold = 10, now = new Date()) {
  const ordered = [...events]
    .filter((event) => event && event.type && event.at)
    .sort((a, b) => new Date(a.at) - new Date(b.at));

  let workingSince = null;
  let pauseSince = null;
  let workedMs = 0;
  let pausedMs = 0;
  let firstEntry = null;
  let lastExit = null;

  for (const event of ordered) {
    const at = new Date(event.at);
    if (Number.isNaN(at.getTime())) continue;

    if ((event.type === "entry" || event.type === "resume") && !workingSince) {
      if (!firstEntry) firstEntry = at;
      if (pauseSince) {
        pausedMs += Math.max(0, at - pauseSince);
        pauseSince = null;
      }
      workingSince = at;
    } else if (event.type === "pause" && workingSince) {
      workedMs += Math.max(0, at - workingSince);
      workingSince = null;
      pauseSince = at;
    } else if (event.type === "exit") {
      if (workingSince) workedMs += Math.max(0, at - workingSince);
      if (pauseSince) pausedMs += Math.max(0, at - pauseSince);
      workingSince = null;
      pauseSince = null;
      lastExit = at;
    }
  }

  if (workingSince) workedMs += Math.max(0, now - workingSince);
  if (pauseSince) pausedMs += Math.max(0, now - pauseSince);

  const workedSeconds = Math.max(0, Math.floor(workedMs / 1000));
  const pausedSeconds = Math.max(0, Math.floor(pausedMs / 1000));
  const workedMinutes = Math.floor(workedSeconds / 60);
  const pausedMinutes = Math.floor(pausedSeconds / 60);
  const rawOvertime = Math.max(0, workedMinutes - targetMinutes);
  const overtimeMinutes = rawOvertime >= overtimeThreshold ? rawOvertime : 0;
  const remainingMinutes = Math.max(0, targetMinutes - workedMinutes);
  const remainingSeconds = Math.max(0, targetMinutes * 60 - workedSeconds);

  let state = "not_started";
  if (lastExit && !workingSince && !pauseSince) state = "finished";
  else if (pauseSince) state = "paused";
  else if (workingSince) state = "working";

  return {
    state,
    firstEntry,
    lastExit,
    workedSeconds,
    pausedSeconds,
    workedMinutes,
    pausedMinutes,
    overtimeMinutes,
    remainingMinutes,
    remainingSeconds
  };
}

export function overtimeEnabledForType(type = "office", settings = {}) {
  if (type === "smart") return settings.smart === true;
  if (type === "travel") return settings.travel === true;
  return type === "office";
}

export function calculateDayWithOvertimePolicy(
  events = [],
  targetMinutes = 456,
  overtimeThreshold = 10,
  type = "office",
  settings = {},
  now = new Date()
) {
  const result = calculateDay(events, targetMinutes, overtimeThreshold, now);
  return overtimeEnabledForType(type, settings) ? result : { ...result, overtimeMinutes: 0 };
}

function manualPauseWasRecorded(events = []) {
  return events.some((event) => event?.type === "pause" || event?.type === "resume");
}

function implicitBreakSeconds(events, result, targetMinutes, defaultBreakMinutes, now) {
  const configuredSeconds = Math.max(0, Number(defaultBreakMinutes) || 0) * 60;
  if (!configuredSeconds || !result.firstEntry || manualPauseWasRecorded(events)) return 0;
  if (result.state === "finished") return Math.min(configuredSeconds, result.workedSeconds);
  if (!['working', 'paused'].includes(result.state)) return 0;

  const current = now instanceof Date ? now : new Date(now);
  const scheduled = new Date(result.firstEntry);
  scheduled.setHours(13, 0, 0, 0);
  if (scheduled <= result.firstEntry) {
    scheduled.setTime(result.firstEntry.getTime() + Math.max(1, Math.floor(targetMinutes / 2)) * 60000);
  }
  return Math.max(0, Math.min(configuredSeconds, Math.floor((current - scheduled) / 1000)));
}

export function calculateDayWithBreakPolicy(
  events = [],
  targetMinutes = 456,
  overtimeThreshold = 10,
  defaultBreakMinutes = 30,
  now = new Date()
) {
  const raw = calculateDay(events, targetMinutes, overtimeThreshold, now);
  const defaultBreakSeconds = implicitBreakSeconds(events, raw, targetMinutes, defaultBreakMinutes, now);
  const workedSeconds = Math.max(0, raw.workedSeconds - defaultBreakSeconds);
  const pausedSeconds = raw.pausedSeconds + defaultBreakSeconds;
  const workedMinutes = Math.floor(workedSeconds / 60);
  const pausedMinutes = Math.floor(pausedSeconds / 60);
  const rawOvertime = Math.max(0, workedMinutes - targetMinutes);
  const overtimeMinutes = rawOvertime >= overtimeThreshold ? rawOvertime : 0;
  return {
    ...raw,
    workedSeconds,
    pausedSeconds,
    workedMinutes,
    pausedMinutes,
    overtimeMinutes,
    remainingMinutes: Math.max(0, targetMinutes - workedMinutes),
    remainingSeconds: Math.max(0, targetMinutes * 60 - workedSeconds),
    breakSource: manualPauseWasRecorded(events) ? "manual" : "default",
    defaultBreakAppliedSeconds: defaultBreakSeconds
  };
}

export function calculateDayWithPolicies(
  events = [],
  targetMinutes = 456,
  overtimeThreshold = 10,
  type = "office",
  settings = {},
  defaultBreakMinutes = 30,
  now = new Date()
) {
  const result = calculateDayWithBreakPolicy(
    events,
    targetMinutes,
    overtimeThreshold,
    defaultBreakMinutes,
    now
  );
  return overtimeEnabledForType(type, settings) ? result : { ...result, overtimeMinutes: 0 };
}

export function forecastExit(events = [], targetMinutes = 456, plannedBreakMinutes = 30, now = new Date()) {
  const result = calculateDay(events, targetMinutes, 0, now);
  if (!result.firstEntry || result.state === "finished") return result.lastExit;
  const breakSeconds = manualPauseWasRecorded(events)
    ? result.pausedSeconds
    : Math.max(0, Number(plannedBreakMinutes) || 0) * 60;
  return new Date(result.firstEntry.getTime() + targetMinutes * 60000 + breakSeconds * 1000);
}

export function formatTime(value) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Rome"
  }).format(date);
}

export function isoDateLocal(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function holidayIso(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day, 12);
}

export function recognizedItalianHolidays(year, localHoliday = null) {
  const holidays = FIXED_ITALIAN_HOLIDAYS.map(([month, day, name]) => ({
    date: holidayIso(year, month, day),
    name,
    scope: "national"
  }));
  const easterMonday = easterSunday(year);
  easterMonday.setDate(easterMonday.getDate() + 1);
  holidays.push({ date: isoDateLocal(easterMonday), name: "Lunedì dell’Angelo", scope: "national" });
  if (Number(year) >= 2026) {
    holidays.push({ date: holidayIso(year, 10, 4), name: "San Francesco d’Assisi", scope: "national" });
  }

  const month = Number(localHoliday?.month);
  const day = Number(localHoliday?.day);
  const name = String(localHoliday?.name || "").trim();
  if (name && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
    const candidate = new Date(year, month - 1, day, 12);
    if (candidate.getFullYear() === year && candidate.getMonth() === month - 1 && candidate.getDate() === day) {
      holidays.push({ date: holidayIso(year, month, day), name, scope: "local" });
    }
  }

  return holidays
    .filter((holiday, index, all) => index === all.findIndex((item) => item.date === holiday.date))
    .sort((first, second) => first.date.localeCompare(second.date));
}

export function sundayHolidays(year, localHoliday = null) {
  return recognizedItalianHolidays(year, localHoliday).filter((holiday) => {
    return new Date(`${holiday.date}T12:00:00`).getDay() === 0;
  });
}

export function holidayRecoveryBalance({
  year,
  rule = SUNDAY_HOLIDAY_RULES.NONE,
  usedDates = [],
  adjustment = 0,
  localHoliday = null,
  asOf = new Date()
}) {
  const normalizedYear = Number(year);
  const asOfDate = typeof asOf === "string" ? asOf.slice(0, 10) : isoDateLocal(asOf);
  const recognized = sundayHolidays(normalizedYear, localHoliday);
  const occurred = recognized.filter((holiday) => holiday.date <= asOfDate);
  const uniqueUsedDates = [...new Set((usedDates || [])
    .map((date) => String(date || "").slice(0, 10))
    .filter((date) => date.startsWith(`${normalizedYear}-`)))].sort();
  const supportsDayBalance = [SUNDAY_HOLIDAY_RULES.ACCRUE_DAY, SUNDAY_HOLIDAY_RULES.MANUAL].includes(rule);
  const automaticAccrued = rule === SUNDAY_HOLIDAY_RULES.ACCRUE_DAY ? occurred.length : 0;
  const correction = supportsDayBalance && Number.isFinite(Number(adjustment))
    ? Math.trunc(Number(adjustment))
    : 0;
  return {
    year: normalizedYear,
    rule,
    recognizedSundays: recognized,
    occurredSundays: occurred,
    automaticAccrued,
    adjustment: correction,
    accrued: automaticAccrued + correction,
    used: uniqueUsedDates.length,
    usedDates: uniqueUsedDates,
    available: supportsDayBalance ? automaticAccrued + correction - uniqueUsedDates.length : 0
  };
}

export function canUseSundayHolidayRecovery(balance, workDate, alreadyUsed = false) {
  if (alreadyUsed || balance.usedDates.includes(String(workDate || "").slice(0, 10))) {
    return { allowed: true, reason: "" };
  }
  if (![SUNDAY_HOLIDAY_RULES.ACCRUE_DAY, SUNDAY_HOLIDAY_RULES.MANUAL].includes(balance.rule)) {
    return { allowed: false, reason: "La regola scelta non prevede giornate di recupero." };
  }
  if (balance.available <= 0) {
    return { allowed: false, reason: "Non ci sono giorni di recupero disponibili." };
  }
  return { allowed: true, reason: "" };
}

export function breakForType(profile, type) {
  if (type === "smart") return profile.smart_break_minutes ?? 60;
  if (type === "travel") return profile.travel_break_minutes ?? 30;
  return profile.office_break_minutes ?? 30;
}

export function ticketForDay(profile, day) {
  const type = day.actual_type || day.planned_type || "office";
  if (type === "absence") return false;
  if (typeof day.ticket_override === "boolean") return day.ticket_override;
  if (isWorkingSaturday(day)) return false;
  if (type === "smart") return profile.ticket_smart !== false;
  if (type === "travel") return profile.ticket_travel !== false;
  return profile.ticket_office !== false;
}

export function excelTicketForDay(day) {
  const type = day.actual_type || day.planned_type;
  if (!type || type === "absence" || isWorkingSaturday(day)) return false;
  if (typeof day.ticket_override === "boolean") return day.ticket_override;
  return ["office", "smart", "travel"].includes(type);
}

export function isWorkingSaturday(day = {}) {
  const date = localDate(day.work_date);
  const type = day.actual_type || day.planned_type || "office";
  return Boolean(date && date.getDay() === 6 && type !== "absence");
}

function monthDateBounds(year, monthIndex) {
  return {
    start: new Date(year, monthIndex, 1, 12),
    end: new Date(year, monthIndex + 1, 0, 12)
  };
}

export function theoreticalWorkdays(year, monthIndex, localHoliday = null) {
  const { start, end } = monthDateBounds(Number(year), Number(monthIndex));
  const holidays = new Set(recognizedItalianHolidays(Number(year), localHoliday).map((item) => item.date));
  let total = 0;
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const weekday = cursor.getDay();
    if (weekday === 0 || weekday === 6) continue;
    if (!holidays.has(isoDateLocal(cursor))) total += 1;
  }
  return total;
}

function countAbsence(days, set, localHoliday = null) {
  return days.filter((day) => {
    if ((day.actual_type || day.planned_type) !== "absence" || !set.has(day.absence_type)) return false;
    if (set === EXCEL_ABSENCE_GROUPS.suppressedHolidays) return isSuppressedHolidayDay(day, localHoliday);
    return true;
  }).length;
}

export function workbookMonthlySummary({
  year,
  month,
  days = [],
  competenceDays = days,
  profile = {},
  localHoliday = null,
  targetMinutes = 456
} = {}) {
  const selectedYear = Number(year);
  const selectedMonth = Number(month);
  const prefix = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}`;
  const monthDays = days.filter((day) => String(day.work_date || "").startsWith(prefix));
  const sourceDate = new Date(selectedYear, selectedMonth - 2, 1, 12);
  const sourcePrefix = `${sourceDate.getFullYear()}-${String(sourceDate.getMonth() + 1).padStart(2, "0")}`;
  const sourceDays = competenceDays.filter((day) => String(day.work_date || "").startsWith(sourcePrefix));
  const theoretical = theoreticalWorkdays(selectedYear, selectedMonth, localHoliday);
  const vacation = countAbsence(monthDays, EXCEL_ABSENCE_GROUPS.vacation);
  const suppressedHolidays = countAbsence(monthDays, EXCEL_ABSENCE_GROUPS.suppressedHolidays, localHoliday);
  const holidayRecovery = countAbsence(monthDays, EXCEL_ABSENCE_GROUPS.holidayRecovery);
  const sickness = countAbsence(monthDays, EXCEL_ABSENCE_GROUPS.sickness);
  const childSickness = countAbsence(monthDays, EXCEL_ABSENCE_GROUPS.childSickness);
  const mandatoryLeave = countAbsence(monthDays, EXCEL_ABSENCE_GROUPS.mandatoryLeave);
  const optionalLeave = countAbsence(monthDays, EXCEL_ABSENCE_GROUPS.optionalLeave);
  const parentalLeave = countAbsence(monthDays, new Set(["parental_leave"]));
  const maternityLeave = countAbsence(monthDays, new Set(["maternity_leave"]));
  const paternityMandatory = countAbsence(monthDays, new Set(["paternity_mandatory"]));
  const paternityAlternative = countAbsence(monthDays, new Set(["paternity_alternative"]));
  const marriageLeave = countAbsence(monthDays, new Set(["marriage_leave"]));
  const mandatoryHistorical = countAbsence(monthDays, new Set(["mandatory_leave"]));
  const leaveHistorical = countAbsence(monthDays, new Set(["leave"]));
  const performanceRecoveryDays = countAbsence(monthDays, EXCEL_ABSENCE_GROUPS.performanceRecovery);
  const absencesForEffectiveDays = vacation + suppressedHolidays + holidayRecovery + sickness
    + childSickness + mandatoryLeave + optionalLeave + marriageLeave;
  const overtimeMinutes = monthDays.reduce((total, day) => total + Math.max(0, Number(day.overtime_minutes) || 0), 0);
  const performanceRecoveryMinutes = performanceRecoveryDays * Math.max(0, Number(targetMinutes) || 0);
  const mealVouchersEarnedBase = monthDays.filter((day) => excelTicketForDay({ ...day, ticket_override: null })).length;
  const mealVouchersEarned = monthDays.filter((day) => ticketForDay(profile, day)).length;
  const sourceTheoretical = theoreticalWorkdays(sourceDate.getFullYear(), sourceDate.getMonth(), localHoliday);
  const sourceExcluded = countAbsence(sourceDays, EXCEL_ABSENCE_GROUPS.vacation)
    + countAbsence(sourceDays, EXCEL_ABSENCE_GROUPS.suppressedHolidays, localHoliday)
    + countAbsence(sourceDays, EXCEL_ABSENCE_GROUPS.holidayRecovery)
    + countAbsence(sourceDays, EXCEL_ABSENCE_GROUPS.sickness)
    + countAbsence(sourceDays, EXCEL_ABSENCE_GROUPS.childSickness)
    + countAbsence(sourceDays, EXCEL_ABSENCE_GROUPS.mandatoryLeave)
    + countAbsence(sourceDays, EXCEL_ABSENCE_GROUPS.optionalLeave)
    + countAbsence(sourceDays, new Set(["marriage_leave"]))
    + countAbsence(sourceDays, EXCEL_ABSENCE_GROUPS.performanceRecovery);
  const sourceNegativeAdjustments = sourceDays.filter((day) => {
    const baseline = excelTicketForDay({ ...day, ticket_override: null });
    return baseline && !ticketForDay(profile, day);
  }).length;
  const competenceAvailable = !(selectedYear === 2026 && selectedMonth <= 1);
  const competenceTheoretical = selectedYear === 2026 ? theoretical : sourceTheoretical;
  const mealVouchers = competenceAvailable
    ? Math.max(0, competenceTheoretical - sourceExcluded - sourceNegativeAdjustments)
    : null;

  return {
    year: selectedYear,
    month: selectedMonth,
    theoreticalWorkdays: theoretical,
    vacation,
    suppressedHolidays,
    holidayRecovery,
    sickness,
    childSickness,
    mandatoryLeave,
    optionalLeave,
    parentalLeave,
    maternityLeave,
    paternityMandatory,
    paternityAlternative,
    marriageLeave,
    mandatoryHistorical,
    leaveHistorical,
    effectiveWorkdays: Math.max(0, theoretical - absencesForEffectiveDays),
    smartDays: monthDays.filter((day) => (day.actual_type || day.planned_type) === "smart").length,
    workingSaturdays: monthDays.filter(isWorkingSaturday).length,
    mealVouchersEarned,
    mealVoucherEarnedAdjustments: mealVouchersEarned - mealVouchersEarnedBase,
    mealVouchers,
    mealVoucherCompetenceAdjustments: -sourceNegativeAdjustments,
    mealVoucherSourceYear: sourceDate.getFullYear(),
    mealVoucherSourceMonth: sourceDate.getMonth(),
    workedMinutes: monthDays.reduce((total, day) => total + Math.max(0, Number(day.worked_minutes) || 0), 0),
    overtimeMinutes,
    performanceRecoveryMinutes,
    netOvertimeMinutes: Math.max(0, overtimeMinutes - performanceRecoveryMinutes),
    registeredDays: monthDays.length
  };
}

function localDate(value) {
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const result = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return Number.isNaN(result.getTime()) ? null : result;
}

function isoDateOnly(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function anniversary(birthDate, age) {
  const year = birthDate.getFullYear() + age;
  const lastDay = new Date(year, birthDate.getMonth() + 1, 0).getDate();
  return new Date(year, birthDate.getMonth(), Math.min(birthDate.getDate(), lastDay), 12);
}

function nextDay(date) {
  const result = new Date(date);
  result.setDate(result.getDate() + 1);
  return result;
}

function previousDay(date) {
  const result = new Date(date);
  result.setDate(result.getDate() - 1);
  return result;
}

export function childSicknessEntitlement(child, onDate = new Date(), usedInApp = 0, usedOutsideApp = 0) {
  const birthDate = localDate(child?.birth_date || child?.birthDate);
  const currentDate = localDate(onDate) || localDate(isoDateLocal(onDate instanceof Date ? onDate : new Date()));
  if (!birthDate || !currentDate || currentDate < birthDate) {
    return { eligible: false, reason: "Data di nascita non valida" };
  }

  const firstBirthday = anniversary(birthDate, 1);
  const secondBirthday = anniversary(birthDate, 2);
  const thirdBirthday = anniversary(birthDate, 3);
  const fourteenthBirthday = anniversary(birthDate, 14);
  const used = Math.max(0, Number(usedInApp) || 0) + Math.max(0, Number(usedOutsideApp) || 0);

  if (currentDate < thirdBirthday) {
    let lifeYear = 1;
    let periodStart = birthDate;
    let periodEnd = previousDay(firstBirthday);
    if (currentDate >= firstBirthday && currentDate < secondBirthday) {
      lifeYear = 2;
      periodStart = firstBirthday;
      periodEnd = previousDay(secondBirthday);
    } else if (currentDate >= secondBirthday) {
      lifeYear = 3;
      periodStart = secondBirthday;
      periodEnd = previousDay(thirdBirthday);
    }
    return {
      eligible: true,
      tier: "under_three",
      lifeYear,
      periodKind: "life_year",
      periodKey: `life-${lifeYear}-${isoDateOnly(birthDate)}`,
      periodStart: isoDateOnly(periodStart),
      periodEnd: isoDateOnly(periodEnd),
      totalDaysLimit: null,
      paidDaysLimit: 30,
      usedDays: used,
      remainingPaidDays: Math.max(0, 30 - used),
      isPaidQuotaExceeded: used >= 30
    };
  }

  if (currentDate <= fourteenthBirthday) {
    const year = currentDate.getFullYear();
    const calendarStart = new Date(year, 0, 1, 12);
    const periodStart = thirdBirthday > calendarStart ? thirdBirthday : calendarStart;
    return {
      eligible: true,
      tier: "three_to_fourteen",
      periodKind: "calendar_year",
      periodKey: `calendar-${year}`,
      periodStart: isoDateOnly(periodStart),
      periodEnd: `${year}-12-31`,
      totalDaysLimit: 10,
      paidDaysLimit: 0,
      usedDays: used,
      remainingDays: Math.max(0, 10 - used),
      isTotalQuotaExceeded: used >= 10
    };
  }

  return { eligible: false, reason: "Il figlio ha più di 14 anni" };
}

export function childSicknessPeriodsForYear(child, year) {
  const birthDate = localDate(child?.birth_date || child?.birthDate);
  const selectedYear = Number(year);
  if (!birthDate || !Number.isInteger(selectedYear)) return [];
  const yearStart = new Date(selectedYear, 0, 1, 12);
  const yearEnd = new Date(selectedYear, 11, 31, 12);
  const periods = [];
  for (let lifeYear = 1; lifeYear <= 3; lifeYear += 1) {
    const start = lifeYear === 1 ? birthDate : anniversary(birthDate, lifeYear - 1);
    const end = previousDay(anniversary(birthDate, lifeYear));
    if (end < yearStart || start > yearEnd) continue;
    periods.push({
      tier: "under_three",
      lifeYear,
      periodKind: "life_year",
      periodKey: `life-${lifeYear}-${isoDateOnly(birthDate)}`,
      periodStart: isoDateOnly(start),
      periodEnd: isoDateOnly(end),
      displayStart: isoDateOnly(start > yearStart ? start : yearStart),
      displayEnd: isoDateOnly(end < yearEnd ? end : yearEnd),
      limit: 30
    });
  }
  const thirdBirthday = anniversary(birthDate, 3);
  const fourteenthBirthday = anniversary(birthDate, 14);
  const nextYearStart = new Date(selectedYear + 1, 0, 1, 12);
  const calendarStart = thirdBirthday > yearStart ? thirdBirthday : yearStart;
  const calendarEnd = fourteenthBirthday < yearEnd ? fourteenthBirthday : yearEnd;
  if (calendarStart < nextYearStart && calendarEnd >= calendarStart && yearEnd >= thirdBirthday && yearStart <= fourteenthBirthday) {
    periods.push({
      tier: "three_to_fourteen",
      periodKind: "calendar_year",
      periodKey: `calendar-${selectedYear}`,
      periodStart: isoDateOnly(calendarStart),
      periodEnd: isoDateOnly(calendarEnd),
      displayStart: isoDateOnly(calendarStart),
      displayEnd: isoDateOnly(calendarEnd),
      limit: 10
    });
  }
  return periods;
}

function addMonths(date, amount) {
  const result = new Date(date);
  const originalDay = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + amount);
  result.setDate(Math.min(originalDay, new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()));
  return result;
}

function entitlementStatus(onDate, start, end) {
  if (onDate < start) return "upcoming";
  if (onDate > end) return "expired";
  return "active";
}

export function paternityMandatoryEntitlement(child, onDate = new Date(), usedDays = 0) {
  const eventDate = localDate(child?.paternity_event_date || child?.event_date || child?.birth_date);
  const expectedDate = localDate(child?.expected_birth_date) || eventDate;
  const currentDate = localDate(onDate) || localDate(isoDateLocal(onDate instanceof Date ? onDate : new Date()));
  if (!eventDate || !currentDate) return { eligible: false, reason: "Dati dell’evento non completi" };
  const eventType = child?.paternity_event_type || child?.event_type || "birth";
  const windowStart = eventType === "birth" ? addMonths(expectedDate, -2) : eventDate;
  const windowEnd = addMonths(eventDate, 5);
  const total = child?.multiple_birth === true ? 20 : 10;
  const used = Math.max(0, Math.trunc(Number(usedDays) || 0));
  const remaining = Math.max(0, total - used);
  const status = entitlementStatus(currentDate, windowStart, windowEnd);
  return {
    eligible: status === "active" && remaining > 0,
    eventType,
    multipleBirth: child?.multiple_birth === true,
    windowStart: isoDateOnly(windowStart),
    windowEnd: isoDateOnly(windowEnd),
    totalDays: total,
    usedDays: used,
    remainingDays: remaining,
    availableDays: status === "active" ? remaining : 0,
    expiredUnusedDays: status === "expired" ? remaining : 0,
    status,
    reason: status === "upcoming" ? "La finestra non è ancora iniziata" : status === "expired" ? "Plafond scaduto" : remaining ? "" : "Plafond esaurito"
  };
}

function weekdaysBetween(start, end) {
  let total = 0;
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    if (![0, 6].includes(cursor.getDay())) total += 1;
  }
  return total;
}

export function maternityMandatoryEntitlement(child, onDate = new Date(), usedDays = 0) {
  const actualDate = localDate(child?.maternity_event_date || child?.event_date || child?.birth_date);
  const expectedDate = localDate(child?.expected_birth_date) || actualDate;
  const currentDate = localDate(onDate) || localDate(isoDateLocal(onDate instanceof Date ? onDate : new Date()));
  if (!actualDate || !expectedDate || !currentDate) return { eligible: false, reason: "Dati dell’evento non completi" };
  const mode = ["2+3", "1+4", "0+5"].includes(child?.maternity_mode) ? child.maternity_mode : "2+3";
  const [beforeMonths, afterMonths] = mode.split("+").map(Number);
  const windowStart = beforeMonths ? addMonths(expectedDate, -beforeMonths) : actualDate;
  const windowEnd = addMonths(actualDate, afterMonths);
  const totalWorkdays = weekdaysBetween(windowStart, windowEnd);
  const used = Math.max(0, Math.trunc(Number(usedDays) || 0));
  const remaining = Math.max(0, totalWorkdays - used);
  const status = entitlementStatus(currentDate, windowStart, windowEnd);
  return {
    eligible: status === "active",
    mode,
    windowStart: isoDateOnly(windowStart),
    windowEnd: isoDateOnly(windowEnd),
    totalWorkdays,
    usedDays: used,
    remainingWorkdays: remaining,
    availableWorkdays: status === "active" ? remaining : 0,
    expiredUnusedWorkdays: status === "expired" ? remaining : 0,
    status,
    requiresCertification: mode !== "2+3",
    reason: status === "upcoming" ? "Il periodo non è ancora iniziato" : status === "expired" ? "Periodo concluso" : ""
  };
}

function parseClock(value) {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(value || ""));
  return match ? { hours: Number(match[1]), minutes: Number(match[2]) } : null;
}

function clockDate(workDate, value, previous = null) {
  const parsed = parseClock(value);
  if (!parsed) return null;
  const result = new Date(`${workDate}T${String(parsed.hours).padStart(2, "0")}:${String(parsed.minutes).padStart(2, "0")}:00`);
  if (Number.isNaN(result.getTime())) return null;
  if (previous && result <= previous) result.setDate(result.getDate() + 1);
  return result;
}

export function eventsFromLocalTimes(workDate, values = {}, idFactory = () => crypto.randomUUID()) {
  const entry = clockDate(workDate, values.entry);
  const pauseStart = clockDate(workDate, values.pauseStart, entry);
  const pauseEnd = clockDate(workDate, values.pauseEnd, pauseStart || entry);
  const exit = clockDate(workDate, values.exit, pauseEnd || pauseStart || entry);

  if (!entry && (values.pauseStart || values.pauseEnd || values.exit)) {
    throw new Error("Inserisci l’orario di ingresso prima degli altri orari.");
  }
  if (Boolean(values.pauseStart) !== Boolean(values.pauseEnd)) {
    throw new Error("Per la pausa inserisci sia l’inizio sia la fine.");
  }

  const result = [];
  if (entry) result.push({ id: idFactory(), type: "entry", at: entry.toISOString() });
  if (pauseStart) result.push({ id: idFactory(), type: "pause", at: pauseStart.toISOString() });
  if (pauseEnd) result.push({ id: idFactory(), type: "resume", at: pauseEnd.toISOString() });
  if (exit) result.push({ id: idFactory(), type: "exit", at: exit.toISOString() });
  return result;
}

export function exitNotificationTime(forecast, leadMinutes = 0) {
  const date = forecast instanceof Date ? new Date(forecast) : new Date(forecast);
  if (Number.isNaN(date.getTime())) return null;
  date.setMinutes(date.getMinutes() - Math.max(0, Number(leadMinutes) || 0));
  return date;
}
