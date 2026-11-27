const VALID_TYPES = new Set(['entry', 'pause', 'resume', 'exit']);

function asDate(value) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function activeEvents(events = []) {
  return (Array.isArray(events) ? events : [])
    .filter((event) => event && !event.superseded && VALID_TYPES.has(event.type) && asDate(event.at))
    .sort((a, b) => asDate(a.at) - asDate(b.at));
}

export function smartAutomaticExitEnabled(workMode, overtimeSettings = {}) {
  return workMode === 'smart' && overtimeSettings.smart !== true;
}

export function smartAutomaticExitAt({
  events = [],
  targetMinutes = 456,
  standardBreakMinutes = 60,
  now = new Date()
} = {}) {
  const ordered = activeEvents(events);
  const firstEntryEvent = ordered.find((event) => event.type === 'entry');
  const firstEntry = firstEntryEvent ? asDate(firstEntryEvent.at) : null;
  if (!firstEntry) return null;

  const hasManualPause = ordered.some((event) => event.type === 'pause' || event.type === 'resume');
  let pauseStarted = null;
  let actualPauseMs = 0;

  if (hasManualPause) {
    for (const event of ordered) {
      const at = asDate(event.at);
      if (event.type === 'pause' && !pauseStarted) pauseStarted = at;
      if (event.type === 'resume' && pauseStarted) {
        actualPauseMs += Math.max(0, at - pauseStarted);
        pauseStarted = null;
      }
    }
    if (pauseStarted) actualPauseMs += Math.max(0, asDate(now) - pauseStarted);
  }

  const pauseMs = hasManualPause
    ? actualPauseMs
    : Math.max(0, Number(standardBreakMinutes) || 0) * 60_000;
  const targetMs = Math.max(0, Number(targetMinutes) || 0) * 60_000;
  return new Date(firstEntry.getTime() + targetMs + pauseMs);
}

function sameInstant(left, right) {
  const a = asDate(left);
  const b = asDate(right);
  return Boolean(a && b && a.getTime() === b.getTime());
}

function supersede(event, reason, changedAt) {
  return {
    ...event,
    superseded: true,
    superseded_reason: reason,
    superseded_at: changedAt.toISOString()
  };
}

export function reconcileSmartAutomaticExit(day, {
  overtimeSettings = {},
  targetMinutes = 456,
  standardBreakMinutes = 60,
  now = new Date(),
  idFactory = () => globalThis.crypto?.randomUUID?.() || `auto-${Date.now()}`
} = {}) {
  const source = day && typeof day === 'object' ? day : {};
  const events = Array.isArray(source.events) ? source.events.map((event) => ({ ...event })) : [];
  const workMode = source.actual_type || source.planned_type || 'office';
  const automatic = smartAutomaticExitEnabled(workMode, overtimeSettings);
  const current = asDate(now) || new Date();
  const activeAutoExits = events.filter((event) => event?.type === 'exit' && event.auto_exit === true && !event.superseded);

  if (!automatic) {
    if (!activeAutoExits.length) {
      return { day: { ...source, events }, changed: false, automatic: false, autoExitAt: null, closed: false };
    }
    const nextEvents = events.map((event) => activeAutoExits.includes(event)
      ? supersede(event, 'smart_overtime_enabled', current)
      : event);
    return { day: { ...source, events: nextEvents }, changed: true, automatic: false, autoExitAt: null, closed: false };
  }

  const autoExitAt = smartAutomaticExitAt({ events, targetMinutes, standardBreakMinutes, now: current });
  if (!autoExitAt) {
    return { day: { ...source, events }, changed: false, automatic: true, autoExitAt: null, closed: false };
  }

  const matchingAutoExit = activeAutoExits.find((event) => sameInstant(event.at, autoExitAt));
  const due = current.getTime() >= autoExitAt.getTime();
  const activeManualExit = events.some((event) => event?.type === 'exit' && event.auto_exit !== true && !event.superseded);
  let changed = false;
  let nextEvents = events.map((event) => {
    if (activeAutoExits.includes(event) && event !== matchingAutoExit) {
      changed = true;
      return supersede(event, 'smart_auto_exit_recalculated', current);
    }
    return event;
  });

  if (due && !matchingAutoExit && !activeManualExit) {
    nextEvents.push({
      id: idFactory(),
      type: 'exit',
      at: autoExitAt.toISOString(),
      auto_exit: true,
      source: 'smart_auto_exit',
      calculated_at: current.toISOString()
    });
    changed = true;
  }

  return {
    day: { ...source, events: nextEvents },
    changed,
    automatic: true,
    autoExitAt,
    closed: due && (Boolean(matchingAutoExit) || activeManualExit || nextEvents.some((event) => event.type === 'exit' && event.auto_exit === true && !event.superseded))
  };
}

export function formatAutomaticExitTime(value, locale = 'it-IT', timeZone = 'Europe/Rome') {
  const date = asDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone }).format(date);
}
