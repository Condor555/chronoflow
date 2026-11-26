const DAY_MS = 86_400_000;

export function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseIsoDate(value) {
  const [year, month, day] = String(value).split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

export function addDays(value, amount) {
  const date = value instanceof Date ? new Date(value) : parseIsoDate(value);
  date.setDate(date.getDate() + amount);
  return date;
}

export function startOfIsoWeek(value) {
  const date = value instanceof Date ? new Date(value) : parseIsoDate(value);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return date;
}

export function weekRange(value) {
  const start = startOfIsoWeek(value);
  return { start: toIsoDate(start), end: toIsoDate(addDays(start, 6)) };
}

export function monthRange(year, monthIndex) {
  return {
    start: toIsoDate(new Date(year, monthIndex, 1, 12)),
    end: toIsoDate(new Date(year, monthIndex + 1, 0, 12))
  };
}

export function enumerateDays(start, end) {
  const result = [];
  let cursor = parseIsoDate(start);
  const last = parseIsoDate(end);
  while (cursor <= last) {
    result.push(toIsoDate(cursor));
    cursor = addDays(cursor, 1);
  }
  return result;
}

export function shiftMonth(year, monthIndex, delta) {
  const date = new Date(year, monthIndex + delta, 1, 12);
  return { year: date.getFullYear(), month: date.getMonth() };
}

export function formatMonth(year, monthIndex, locale = 'it-IT') {
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })
    .format(new Date(year, monthIndex, 1, 12));
}

export function formatDay(value, locale = 'it-IT') {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' })
    .format(parseIsoDate(value));
}

export function dateDiffInDays(a, b) {
  return Math.round((parseIsoDate(b) - parseIsoDate(a)) / DAY_MS);
}
