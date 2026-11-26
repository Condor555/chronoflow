const STORAGE_KEY = 'orari-mobile-mvp-v1';

export const DEFAULT_SETTINGS = {
  profileName: 'Profilo 7:36',
  defaultMode: 'office',
  workMinutes: 456,
  pauseOffice: 30,
  pauseSmart: 60,
  pauseTravel: 30,
  smartDefaultStart: '09:00',
  ticketOffice: true,
  ticketSmart: true,
  ticketTravel: true,
  ticketMinMinutes: 360,
  ticketDelayMonths: 2,
  overtimeEnabled: true,
  overtimeThreshold: 10,
  overtimeThresholdMode: 'activation',
  overtimeRounding: 5,
  overtimeRoundingMode: 'down',
  overtimeTreatment: 'paid',
  overtimeDailyLimit: 0,
  vacationPrevious: 0,
  vacationCurrent: 20,
  suppressedHolidayAllowance: 4,
  restRecoveryAllowance: 0,
  children: [],
  childPolicies: []
};

export function emptyState() {
  return {
    version: 1,
    settings: structuredClone(DEFAULT_SETTINGS),
    days: {},
    meta: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const stored = JSON.parse(raw);
    return {
      ...emptyState(),
      ...stored,
      settings: { ...DEFAULT_SETTINGS, ...(stored.settings || {}) },
      days: stored.days || {}
    };
  } catch (error) {
    console.error('Impossibile leggere i dati locali', error);
    return emptyState();
  }
}

export function saveState(state) {
  state.meta = { ...(state.meta || {}), updatedAt: new Date().toISOString() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function replaceState(nextState) {
  const safe = {
    ...emptyState(),
    ...nextState,
    settings: { ...DEFAULT_SETTINGS, ...(nextState.settings || {}) },
    days: nextState.days || {}
  };
  saveState(safe);
  return safe;
}

export function clearState() {
  localStorage.removeItem(STORAGE_KEY);
}
