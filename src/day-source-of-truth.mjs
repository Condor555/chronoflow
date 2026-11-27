const WORK_MODES = new Set(["office", "smart", "travel"]);

export function effectiveDayMode(day) {
  const mode = day?.actual_type || day?.planned_type;
  return WORK_MODES.has(mode) || mode === "absence" ? mode : "office";
}

export function homeModeForToday(savedDay) {
  return savedDay ? effectiveDayMode(savedDay) : "office";
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
