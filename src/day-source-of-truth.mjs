const WORK_MODES = new Set(["office", "smart", "travel"]);
const DAY_MODES = new Set([...WORK_MODES, "absence"]);
const TRACKED_EVENT_TYPES = new Set(["entry", "pause", "resume", "exit"]);

function validMode(mode) {
  return DAY_MODES.has(mode) ? mode : null;
}

export function dayHasRecordedActivity(day) {
  return Array.isArray(day?.events)
    && day.events.some((event) => event
      && !event.superseded
      && TRACKED_EVENT_TYPES.has(event.type)
      && typeof event.at === "string"
      && event.at.length > 0);
}

export function effectiveDayMode(day) {
  return validMode(day?.actual_type) || validMode(day?.planned_type) || "office";
}

export function homeModeForToday(savedDay) {
  if (!savedDay) return "office";
  const planned = validMode(savedDay.planned_type);
  const actual = validMode(savedDay.actual_type);

  // Prima dell'ingresso la Home rappresenta la pianificazione odierna. Un
  // vecchio actual_type non deve sovrascrivere una successiva pianificazione
  // Smart/Trasferta dopo reload o riapertura PWA. Dopo la prima attività
  // registrata, invece, l'effettivo torna prioritario.
  if (!dayHasRecordedActivity(savedDay)) return planned || actual || "office";
  return actual || planned || "office";
}

export function applyHomeModeToDay(day, date, mode) {
  if (!WORK_MODES.has(mode)) throw new Error("Modalità di lavoro non valida.");
  return {
    ...(day || {}),
    work_date: date,
    planned_type: mode,
    actual_type: mode,
    absence_type: null,
    child_id: null
  };
}

export function mayReplaceTodayFromCloud(pendingWorkDates, date) {
  return !(pendingWorkDates instanceof Set ? pendingWorkDates : new Set(pendingWorkDates || [])).has(date);
}
