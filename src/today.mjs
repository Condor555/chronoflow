const VALID_MODES = new Set(['office', 'smart', 'travel']);
const MODE_ALIASES = Object.freeze({
  office: 'office', ufficio: 'office',
  smart: 'smart', home: 'smart', casa: 'smart', remote: 'smart',
  travel: 'travel', trasferta: 'travel'
});

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function firstRecord(value) {
  if (value == null) return null;
  if (Array.isArray(value)) return value.find(isRecord) || null;
  if (!isRecord(value)) return null;

  for (const key of ['data', 'rows', 'row', 'record', 'day', 'giornata']) {
    if (key in value) return firstRecord(value[key]);
  }
  return value;
}

function normalizeTime(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function normalizeWorkMode(value, fallback = 'office') {
  const normalized = MODE_ALIASES[String(value || '').trim().toLowerCase()];
  return VALID_MODES.has(normalized) ? normalized : fallback;
}

export function normalizeTodayRecord(response, expectedDate) {
  const source = firstRecord(response);
  if (!source) return null;

  const workDate = source.work_date || source.date || source.workDate || expectedDate || null;
  if (expectedDate && workDate && workDate !== expectedDate) return null;

  return Object.freeze({
    work_date: workDate,
    mode: normalizeWorkMode(source.mode || source.work_mode || source.location, 'office'),
    clock_in: normalizeTime(source.clock_in ?? source.clockIn ?? source.start_time ?? source.startTime),
    clock_out: normalizeTime(source.clock_out ?? source.clockOut ?? source.end_time ?? source.endTime),
    is_absent: Boolean(source.is_absent ?? source.isAbsent ?? false)
  });
}

export function localIsoDate(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function localTime(now = new Date()) {
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

export function createClockInEntry({ date, mode, now = new Date() }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('Data della giornata non valida.');
  return {
    work_date: date,
    mode: normalizeWorkMode(mode),
    clock_in: localTime(now),
    clock_out: null,
    is_absent: false
  };
}

export class TodayService {
  constructor(calendarService) {
    if (!calendarService) throw new Error('Servizio calendario non disponibile.');
    this.calendarService = calendarService;
  }

  async load(date) {
    const dashboard = await this.calendarService.getDashboard();
    const spaceId = dashboard?.space?.id || dashboard?.space_id || null;
    if (!spaceId) return null;
    const response = await this.calendarService.getSharedCalendar(spaceId, date, date);
    return normalizeTodayRecord(response, date);
  }

  async clockIn({ date, mode, now = new Date() }) {
    const entry = createClockInEntry({ date, mode, now });
    await this.calendarService.upsertProjection([entry]);
    return normalizeTodayRecord(entry, date);
  }
}
