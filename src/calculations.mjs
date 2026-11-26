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
  leave: "Congedo",
  recovery: "Recupero",
  holiday: "Festività"
};

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
  if (typeof day.ticket_override === "boolean") return day.ticket_override;
  const type = day.actual_type || day.planned_type || "office";
  if (type === "smart") return Boolean(profile.ticket_smart);
  if (type === "travel") return Boolean(profile.ticket_travel);
  if (type === "absence") return false;
  return Boolean(profile.ticket_office);
}
