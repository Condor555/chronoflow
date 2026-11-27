const MINUTES_PER_HOUR = 60;

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

export function searchProjects(projects = [], query = "") {
  const normalizedQuery = String(query || "").trim().toLocaleLowerCase("it");
  return [...projects].filter((project) => {
    if (!project) return false;
    const searchable = `${project.code || ""} ${project.description || ""}`.toLocaleLowerCase("it");
    return !normalizedQuery || searchable.includes(normalizedQuery);
  });
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
