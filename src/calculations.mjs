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
  recovery: "Recupero",
  sunday_holiday_recovery: "Recupero festività caduta di domenica",
  holiday: "Festività"
};

export const CHILD_LINKED_ABSENCE_TYPES = new Set([
  "child_sickness",
  "parental_leave",
  "maternity_leave",
  "paternity_mandatory",
  "paternity_alternative"
]);

export function clampInt(value, min, max, fallback = min) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function minutesToDuration(totalMinutes) {
  const safe = Math.max(0, Math.round(Number(totalMinutes) || 0));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}`;
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

  const workedMinutes = Math.max(0, Math.floor(workedMs / 60000));
  const pausedMinutes = Math.max(0, Math.floor(pausedMs / 60000));
  const rawOvertime = Math.max(0, workedMinutes - targetMinutes);
  const overtimeMinutes = rawOvertime >= overtimeThreshold ? rawOvertime : 0;
  const remainingMinutes = Math.max(0, targetMinutes - workedMinutes);

  let state = "not_started";
  if (lastExit && !workingSince && !pauseSince) state = "finished";
  else if (pauseSince) state = "paused";
  else if (workingSince) state = "working";

  return {
    state,
    firstEntry,
    lastExit,
    workedMinutes,
    pausedMinutes,
    overtimeMinutes,
    remainingMinutes
  };
}

export function forecastExit(events = [], targetMinutes = 456, plannedBreakMinutes = 30, now = new Date()) {
  const result = calculateDay(events, targetMinutes, 0, now);
  if (!result.firstEntry || result.state === "finished") return result.lastExit;
  const breakToCount = Math.max(plannedBreakMinutes, result.pausedMinutes);
  return new Date(result.firstEntry.getTime() + (targetMinutes + breakToCount) * 60000);
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

export function breakForType(profile, type) {
  if (type === "smart") return profile.smart_break_minutes ?? 60;
  if (type === "travel") return profile.travel_break_minutes ?? 30;
  return profile.office_break_minutes ?? 30;
}

export function ticketForDay(profile, day) {
  const type = day.actual_type || day.planned_type || "office";
  if (type === "absence") return false;
  if (typeof day.ticket_override === "boolean") return day.ticket_override;
  if (type === "smart") return Boolean(profile.ticket_smart);
  if (type === "travel") return Boolean(profile.ticket_travel);
  return Boolean(profile.ticket_office);
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

  if (currentDate <= thirdBirthday) {
    let lifeYear = 1;
    let periodStart = birthDate;
    let periodEnd = firstBirthday;
    if (currentDate > firstBirthday && currentDate <= secondBirthday) {
      lifeYear = 2;
      periodStart = nextDay(firstBirthday);
      periodEnd = secondBirthday;
    } else if (currentDate > secondBirthday) {
      lifeYear = 3;
      periodStart = nextDay(secondBirthday);
      periodEnd = thirdBirthday;
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
    return {
      eligible: true,
      tier: "three_to_fourteen",
      periodKind: "calendar_year",
      periodKey: `calendar-${year}`,
      periodStart: `${year}-01-01`,
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
