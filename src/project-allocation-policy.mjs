const MINUTES_PER_HOUR = 60;
const MAX_DAY_MINUTES = 24 * MINUTES_PER_HOUR;

function positiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label} deve essere maggiore di zero.`);
  return parsed;
}

export function splitEvenMinutes(totalMinutes, projectCount) {
  const total = positiveInteger(totalMinutes, "L’orario lavorato");
  const count = positiveInteger(projectCount, "Il numero di commesse");
  if (count > total) throw new Error("Le commesse selezionate sono più dei minuti lavorati disponibili.");
  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

export function equalPercentages(projectCount) {
  const count = positiveInteger(projectCount, "Il numero di commesse");
  const units = 10000;
  const base = Math.floor(units / count);
  const remainder = units % count;
  return Array.from({ length: count }, (_, index) => (base + (index < remainder ? 1 : 0)) / 100);
}

export function hoursToMinutes(value) {
  if (value === "" || value === null || value === undefined) return 0;
  const hours = Number(String(value).replace(",", "."));
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
    throw new Error("Le ore di ogni commessa devono essere maggiori di 0 e non superiori a 24.");
  }
  return Math.round(hours * MINUTES_PER_HOUR);
}

export function minutesToHoursInput(minutes) {
  const numeric = Math.max(0, Number(minutes) || 0);
  return numeric ? String(Math.round((numeric / MINUTES_PER_HOUR) * 100) / 100) : "";
}

export function manualDurationMinutes(hoursValue, minutesValue) {
  const hours = Number(hoursValue);
  const minutes = Number(minutesValue);
  if (!Number.isInteger(hours) || hours < 0 || hours > 24) {
    throw new Error("Le ore devono essere un numero intero compreso tra 0 e 24.");
  }
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) {
    throw new Error("I minuti devono essere un numero intero compreso tra 0 e 59.");
  }
  const total = hours * MINUTES_PER_HOUR + minutes;
  if (total <= 0 || total > MAX_DAY_MINUTES) {
    throw new Error("La durata deve essere compresa tra 0:01 e 24:00.");
  }
  return total;
}

export function minutesToManualDuration(totalMinutes) {
  const safe = Math.max(0, Math.min(MAX_DAY_MINUTES, Math.round(Number(totalMinutes) || 0)));
  return { hours: Math.floor(safe / MINUTES_PER_HOUR), minutes: safe % MINUTES_PER_HOUR };
}

export function normalizeAllocationPercentage(value, fallback = 100) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100) {
    const fallbackValue = Number(fallback);
    if (Number.isFinite(fallbackValue) && fallbackValue > 0 && fallbackValue <= 100) return fallbackValue;
    throw new Error("La percentuale deve essere maggiore di 0 e non superiore a 100.");
  }
  return Math.round(parsed * 100) / 100;
}

export function automaticAllocationMinutes(workedSeconds, percentage) {
  const safeSeconds = Math.max(0, Math.floor(Number(workedSeconds) || 0));
  const safePercentage = normalizeAllocationPercentage(percentage);
  return Math.floor((safeSeconds * safePercentage) / 6000);
}

export function buildAllocationEntries({ mode, projectIds, workedSeconds = 0, manualMinutes = {} }) {
  const uniqueProjectIds = [...new Set((projectIds || []).filter(Boolean))];
  if (!uniqueProjectIds.length) throw new Error("Seleziona almeno una commessa.");
  if (mode === "hours") {
    return uniqueProjectIds.map((projectId) => ({
      projectId,
      durationMinutes: manualDurationMinutes(
        manualMinutes[projectId]?.hours ?? 0,
        manualMinutes[projectId]?.minutes ?? 0
      ),
      allocationPercentage: null
    }));
  }
  const percentages = equalPercentages(uniqueProjectIds.length);
  return uniqueProjectIds.map((projectId, index) => ({
    projectId,
    // Il database storico richiede almeno un minuto. La UI non usa questo
    // snapshot per l'automatico: ricalcola sempre dal timer netto e dalla %.
    durationMinutes: Math.max(1, automaticAllocationMinutes(workedSeconds, percentages[index])),
    allocationPercentage: percentages[index]
  }));
}

export function buildAllocationDurations({ mode, projectIds, workedMinutes, manualHours = {} }) {
  const uniqueProjectIds = [...new Set((projectIds || []).filter(Boolean))];
  if (!uniqueProjectIds.length) throw new Error("Seleziona almeno una commessa.");
  if (mode === "hours") {
    return uniqueProjectIds.map((projectId) => ({
      projectId,
      durationMinutes: hoursToMinutes(manualHours[projectId])
    }));
  }
  const durations = splitEvenMinutes(workedMinutes, uniqueProjectIds.length);
  return uniqueProjectIds.map((projectId, index) => ({ projectId, durationMinutes: durations[index] }));
}
