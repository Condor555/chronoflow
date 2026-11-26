import {
  ABSENCE_TYPES,
  CHILD_LINKED_ABSENCE_TYPES,
  DAY_TYPES,
  breakForType,
  calculateDayWithOvertimePolicy,
  childSicknessEntitlement,
  canUseSundayHolidayRecovery,
  clampInt,
  eventsFromLocalTimes,
  exitNotificationTime,
  forecastExit,
  formatTime,
  holidayRecoveryBalance,
  isoDateLocal,
  minutesToDuration,
  recognizedItalianHolidays,
  secondsToDuration,
  SUNDAY_HOLIDAY_RULES,
  ticketForDay
} from "./calculations.mjs";
import { clearMigratedLegacyData, detectLegacyData } from "./migration.mjs";
import {
  installBannerKind,
  isInstallDismissalActive,
  isIosDevice,
  isStandaloneMode
} from "./pwa-install.mjs";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
// ORARI_CONFIG resta supportato per non interrompere installazioni già configurate.
const config = window.CHRONO_FLOW_CONFIG || window.ORARI_CONFIG || {};
const configured = /^https?:\/\//.test(config.supabaseUrl || "")
  && !String(config.supabaseUrl).includes("TUO-PROGETTO")
  && typeof config.supabaseAnonKey === "string"
  && config.supabaseAnonKey.length > 40
  && !config.supabaseAnonKey.includes("LA-TUA");

const DEFAULT_PROFILE = {
  display_name: "",
  target_minutes: 456,
  office_break_minutes: 30,
  smart_break_minutes: 60,
  travel_break_minutes: 30,
  overtime_threshold: 10,
  ticket_office: true,
  ticket_smart: false,
  ticket_travel: false,
  timezone: "Europe/Rome",
  family_settings: {
    children: [],
    overtime_settings: {
      smart: false,
      travel: false
    },
    contract_settings: {
      sunday_holiday_rule: "none",
      sunday_holiday_adjustments: {},
      local_holiday: null
    }
  }
};

const state = {
  supabase: null,
  user: null,
  profile: structuredClone(DEFAULT_PROFILE),
  days: new Map(),
  authMode: "login",
  calendarMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  summaryMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  summaryYearDays: [],
  summaryYearLoaded: null,
  summaryYearLoading: false,
  childSicknessDays: [],
  sundayHolidayRecoveryDays: [],
  legacyMigration: null,
  toastTimer: null,
  notificationTimer: null,
  notificationTarget: null,
  deferredInstallPrompt: null,
  undo: null,
  busy: false
};

function defaultDay(date) {
  return {
    work_date: date,
    planned_type: "office",
    actual_type: null,
    absence_type: null,
    child_id: null,
    events: [],
    ticket_override: null,
    notes: ""
  };
}

function normalizeDay(day) {
  const result = { ...defaultDay(day.work_date), ...day };
  result.events = Array.isArray(result.events) ? result.events : [];
  result.notes = typeof result.notes === "string" ? result.notes : "";
  const effectiveType = result.actual_type || result.planned_type;
  if (effectiveType !== "absence") {
    result.absence_type = null;
    result.child_id = null;
  } else if (!CHILD_LINKED_ABSENCE_TYPES.has(result.absence_type)) {
    result.child_id = null;
  }
  if (effectiveType === "absence") result.ticket_override = null;
  return result;
}

function normalizeFamilySettings(value) {
  const input = value && typeof value === "object" ? value : {};
  const contractInput = input.contract_settings && typeof input.contract_settings === "object"
    ? input.contract_settings
    : {};
  const legacyRuleMap = { manual_recovery: "manual", custom: "manual" };
  const normalizedRule = legacyRuleMap[contractInput.sunday_holiday_rule]
    || contractInput.sunday_holiday_rule
    || "none";
  const adjustments = contractInput.sunday_holiday_adjustments && typeof contractInput.sunday_holiday_adjustments === "object"
    ? { ...contractInput.sunday_holiday_adjustments }
    : {};
  const legacyAllowance = clampInt(contractInput.sunday_holiday_allowance, 0, 366, 0);
  const currentYear = String(new Date().getFullYear());
  if (legacyAllowance && !adjustments[currentYear]) {
    adjustments[currentYear] = { days: legacyAllowance, reason: "Saldo riportato dalla versione precedente" };
  }
  return {
    ...input,
    children: Array.isArray(input.children) ? input.children : [],
    overtime_settings: {
      smart: input.overtime_settings?.smart === true,
      travel: input.overtime_settings?.travel === true
    },
    contract_settings: {
      ...contractInput,
      sunday_holiday_rule: normalizedRule,
      sunday_holiday_adjustments: adjustments,
      local_holiday: contractInput.local_holiday || null
    }
  };
}

function familyChildren() {
  return Array.isArray(state.profile.family_settings?.children)
    ? state.profile.family_settings.children
    : [];
}

function deviceNotificationKey() {
  return `chrono-flow:v2:notifications:${state.user?.id || "anonymous"}`;
}

function notificationPreferences() {
  try {
    const stored = JSON.parse(localStorage.getItem(deviceNotificationKey()) || "{}");
    return {
      enabled: Boolean(stored.enabled),
      leadMinutes: clampInt(stored.leadMinutes, 0, 120, 0),
      notifiedEntry: typeof stored.notifiedEntry === "string" ? stored.notifiedEntry : ""
    };
  } catch {
    return { enabled: false, leadMinutes: 0, notifiedEntry: "" };
  }
}

function saveNotificationPreferences(patch) {
  const next = { ...notificationPreferences(), ...patch };
  localStorage.setItem(deviceNotificationKey(), JSON.stringify(next));
  return next;
}

function overtimeSettings() {
  return normalizeFamilySettings(state.profile.family_settings).overtime_settings;
}

function calculateTrackedDay(day, now = new Date()) {
  const effectiveType = day.actual_type || day.planned_type || "office";
  return calculateDayWithOvertimePolicy(
    day.events,
    state.profile.target_minutes,
    state.profile.overtime_threshold,
    effectiveType,
    overtimeSettings(),
    now
  );
}

const INSTALL_DISMISSAL_KEY = "chrono-flow:pwa-install-dismissed-at";

function installContext() {
  const displayModeStandalone = window.matchMedia?.("(display-mode: standalone)").matches === true;
  return {
    ios: isIosDevice(navigator),
    standalone: isStandaloneMode({ navigatorLike: navigator, displayModeStandalone }),
    promptAvailable: Boolean(state.deferredInstallPrompt)
  };
}

function hideInstallBanner() {
  $("#install-banner").hidden = true;
}

function showInstallBanner({ force = false } = {}) {
  const context = installContext();
  const kind = installBannerKind(context);
  if (!kind) return hideInstallBanner();
  if (!force && isInstallDismissalActive(localStorage.getItem(INSTALL_DISMISSAL_KEY))) return;
  const ios = kind === "ios";
  $("#install-banner-description").textContent = ios
    ? "Aggiungila alla schermata Home per usarla come app e ricevere le notifiche su iPhone e iPad."
    : "Installala sul dispositivo per aprirla come app e ricevere le notifiche più facilmente.";
  $("#install-banner-instructions").hidden = !ios;
  $("#install-app").textContent = ios ? "Ho capito" : "Installa";
  $("#dismiss-install-banner").textContent = "Non ora";
  $("#install-banner").hidden = false;
}

function dismissInstallBanner() {
  localStorage.setItem(INSTALL_DISMISSAL_KEY, String(Date.now()));
  hideInstallBanner();
}

async function handleInstallAction() {
  const { ios, standalone } = installContext();
  if (standalone) return hideInstallBanner();
  if (ios) return dismissInstallBanner();
  const prompt = state.deferredInstallPrompt;
  if (!prompt) return hideInstallBanner();
  prompt.prompt();
  await prompt.userChoice.catch(() => null);
  state.deferredInstallPrompt = null;
  hideInstallBanner();
}

function setupInstallExperience() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
    showInstallBanner();
  });
  window.addEventListener("appinstalled", () => {
    state.deferredInstallPrompt = null;
    localStorage.removeItem(INSTALL_DISMISSAL_KEY);
    hideInstallBanner();
    renderNotificationPermissionStatus();
    showToast("Chrono Flow è stata installata sul dispositivo.");
  });
  window.matchMedia?.("(display-mode: standalone)").addEventListener?.("change", () => {
    if (installContext().standalone) hideInstallBanner();
  });
  if (installContext().ios) showInstallBanner();
}

function cacheKey() {
  return `chrono-flow:v2:days:${state.user?.id || "anonymous"}`;
}

function queueKey() {
  return `chrono-flow:v2:queue:${state.user?.id || "anonymous"}`;
}

function legacyStorageKey(kind) {
  return `orari:v2:${kind}:${state.user?.id || "anonymous"}`;
}

function migrateLegacyStorage() {
  if (!state.user) return;
  [["days", cacheKey()], ["queue", queueKey()]].forEach(([kind, nextKey]) => {
    const legacyKey = legacyStorageKey(kind);
    if (localStorage.getItem(nextKey) === null && localStorage.getItem(legacyKey) !== null) {
      localStorage.setItem(nextKey, localStorage.getItem(legacyKey));
    }
  });
}

function loadLocalCache() {
  if (!state.user) return;
  migrateLegacyStorage();
  try {
    const rows = JSON.parse(localStorage.getItem(cacheKey()) || "[]");
    if (Array.isArray(rows)) rows.forEach((row) => state.days.set(row.work_date, normalizeDay(row)));
  } catch {
    localStorage.removeItem(cacheKey());
  }
}

function persistLocalCache() {
  if (!state.user) return;
  localStorage.setItem(cacheKey(), JSON.stringify([...state.days.values()]));
}

function getQueue() {
  try {
    const queue = JSON.parse(localStorage.getItem(queueKey()) || "[]");
    return Array.isArray(queue) ? queue : [];
  } catch {
    return [];
  }
}

function setQueue(queue) {
  localStorage.setItem(queueKey(), JSON.stringify(queue));
  updateSyncStatus();
}

function migrationMarkerKey() {
  return `chrono-flow:v2:migration:${state.user?.id || "anonymous"}`;
}

function queueOperation(operation) {
  const queue = getQueue().filter((item) => item.work_date !== operation.work_date);
  queue.push(operation);
  setQueue(queue);
}

function updateSyncStatus(text) {
  const element = $("#sync-status");
  if (!element) return;
  if (text) element.textContent = text;
  else if (!navigator.onLine) element.textContent = "Offline · dati sul dispositivo";
  else {
    const count = getQueue().length;
    element.textContent = count ? `${count} modifiche da sincronizzare` : "Sincronizzato";
  }
}

function announce(message) {
  $("#live-region").textContent = "";
  window.setTimeout(() => { $("#live-region").textContent = message; }, 20);
}

function showToast(message, action) {
  window.clearTimeout(state.toastTimer);
  state.undo = typeof action === "function" ? action : null;
  const toast = $("#toast");
  const isError = /errore|non riusc|non salva|non caricat|controlla|inserisci|seleziona|blocc|interrott|non disponibile/i.test(message);
  toast.dataset.tone = isError ? "error" : "success";
  toast.setAttribute("role", isError ? "alert" : "status");
  toast.setAttribute("aria-live", isError ? "assertive" : "polite");
  $("#toast-message").textContent = message;
  $("#toast-action").hidden = !state.undo;
  toast.hidden = false;
  state.toastTimer = window.setTimeout(() => {
    toast.hidden = true;
    state.undo = null;
  }, state.undo ? 7000 : 4500);
  announce(message);
}

function friendlyError(error) {
  const message = String(error?.message || error || "Errore sconosciuto");
  if (/invalid login credentials/i.test(message)) return "Email o password non corretti.";
  if (/email not confirmed/i.test(message)) return "Conferma l’email usando il link che hai ricevuto, poi accedi.";
  if (/user already registered/i.test(message)) return "Esiste già un account con questa email.";
  if (/password/i.test(message) && /characters|short|least/i.test(message)) return "La password deve contenere almeno 8 caratteri.";
  if (/failed to fetch|network/i.test(message)) return "Connessione non disponibile. Riprova quando sei online.";
  return message;
}

function formatLongDate(date) {
  return new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date);
}

function monthBounds(date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start: isoDateLocal(first), end: isoDateLocal(last) };
}

function yearBounds(year) {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

const MONTH_NAMES = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"
];

function ensureYearOptions(select, selectedYear) {
  const currentYear = new Date().getFullYear();
  const minimum = Math.min(currentYear - 8, selectedYear - 2);
  const maximum = Math.max(currentYear + 8, selectedYear + 2);
  const years = Array.from({ length: maximum - minimum + 1 }, (_, index) => minimum + index);
  select.replaceChildren(...years.map((year) => {
    const option = document.createElement("option");
    option.value = String(year);
    option.textContent = String(year);
    return option;
  }));
}

function renderMonthSelector(scope, date) {
  const monthSelect = $(`#${scope}-month-select`);
  const yearSelect = $(`#${scope}-year-select`);
  if (!monthSelect || !yearSelect) return;
  ensureYearOptions(yearSelect, date.getFullYear());
  monthSelect.value = String(date.getMonth());
  yearSelect.value = String(date.getFullYear());
  const label = $(`#${scope}-month-label`);
  if (label) label.textContent = `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

async function selectMonth(scope, date) {
  const normalized = new Date(date.getFullYear(), date.getMonth(), 1);
  if (scope === "calendar") {
    state.calendarMonth = normalized;
    renderMonthSelector("calendar", normalized);
    await fetchMonth(normalized).catch((error) => showToast(`Mese non caricato: ${friendlyError(error)}`));
    renderCalendar();
    return;
  }
  state.summaryMonth = normalized;
  renderMonthSelector("summary", normalized);
  await Promise.all([
    fetchMonth(normalized),
    fetchSummaryYear(normalized.getFullYear())
  ]).catch((error) => showToast(`Riepilogo non caricato: ${friendlyError(error)}`));
  renderSummary();
}

function selectedMonthFromControls(scope, fallback) {
  const month = Number($(`#${scope}-month-select`)?.value);
  const year = Number($(`#${scope}-year-select`)?.value);
  if (!Number.isInteger(month) || month < 0 || month > 11 || !Number.isInteger(year)) return fallback;
  return new Date(year, month, 1);
}

function asCloudDay(day) {
  return {
    user_id: state.user.id,
    work_date: day.work_date,
    planned_type: day.planned_type,
    actual_type: day.actual_type,
    absence_type: day.absence_type || null,
    child_id: day.child_id || null,
    events: day.events || [],
    ticket_override: (day.actual_type || day.planned_type) === "absence"
      ? null
      : typeof day.ticket_override === "boolean" ? day.ticket_override : null,
    notes: day.notes || ""
  };
}

async function fetchProfile() {
  const { data, error } = await state.supabase.from("profiles").select("*").eq("id", state.user.id).maybeSingle();
  if (error) throw error;
  if (data) state.profile = { ...DEFAULT_PROFILE, ...data, family_settings: normalizeFamilySettings(data.family_settings) };
  else {
    const payload = { ...DEFAULT_PROFILE, id: state.user.id, display_name: state.user.user_metadata?.display_name || state.user.email.split("@")[0] };
    const result = await state.supabase.from("profiles").upsert(payload).select().single();
    if (result.error) throw result.error;
    state.profile = { ...DEFAULT_PROFILE, ...result.data, family_settings: normalizeFamilySettings(result.data.family_settings) };
  }
}

async function fetchChildSicknessUsage() {
  const { data, error } = await state.supabase
    .from("work_days")
    .select("work_date,child_id,absence_type,planned_type,actual_type")
    .in("absence_type", ["child_sickness", "parental_leave", "maternity_leave", "paternity_mandatory", "paternity_alternative"])
    .order("work_date");
  if (error) throw error;
  state.childSicknessDays = data || [];
}

async function fetchSundayHolidayRecoveryUsage() {
  const { data, error } = await state.supabase
    .from("work_days")
    .select("work_date,absence_type,planned_type,actual_type")
    .eq("absence_type", "sunday_holiday_recovery")
    .order("work_date");
  if (error) throw error;
  state.sundayHolidayRecoveryDays = data || [];
}

function syncSundayHolidayRecoveryUsage(day) {
  state.sundayHolidayRecoveryDays = state.sundayHolidayRecoveryDays.filter((item) => item.work_date !== day.work_date);
  const effectiveType = day.actual_type || day.planned_type;
  if (effectiveType === "absence" && day.absence_type === "sunday_holiday_recovery") {
    state.sundayHolidayRecoveryDays.push({
      work_date: day.work_date,
      absence_type: day.absence_type,
      planned_type: day.planned_type,
      actual_type: day.actual_type
    });
  }
}

function sundayHolidayContract() {
  return normalizeFamilySettings(state.profile.family_settings).contract_settings;
}

function sundayHolidayBalance(year, contractOverride = null) {
  const contract = contractOverride || sundayHolidayContract();
  const adjustment = contract.sunday_holiday_adjustments?.[String(year)]?.days || 0;
  return holidayRecoveryBalance({
    year,
    rule: contract.sunday_holiday_rule,
    usedDates: state.sundayHolidayRecoveryDays
      .filter((day) => (day.actual_type || day.planned_type) === "absence")
      .map((day) => day.work_date),
    adjustment,
    localHoliday: contract.local_holiday,
    asOf: new Date()
  });
}

async function fetchMonth(date) {
  const { start, end } = monthBounds(date);
  const { data, error } = await state.supabase
    .from("work_days")
    .select("*")
    .gte("work_date", start)
    .lte("work_date", end)
    .order("work_date");
  if (error) {
    if (state.days.size) {
      updateSyncStatus("Offline · mostro i dati salvati");
      return;
    }
    throw error;
  }
  const pendingDates = new Set(getQueue().map((operation) => operation.work_date));
  for (const workDate of [...state.days.keys()]) {
    if (workDate >= start && workDate <= end && !pendingDates.has(workDate)) state.days.delete(workDate);
  }
  (data || []).forEach((day) => {
    if (!pendingDates.has(day.work_date)) state.days.set(day.work_date, normalizeDay(day));
  });
  persistLocalCache();
}

async function fetchSummaryYear(year, { force = false } = {}) {
  if (!force && state.summaryYearLoaded === year) return;
  state.summaryYearLoading = true;
  renderSummary();
  const { start, end } = yearBounds(year);
  try {
    const { data, error } = await state.supabase
      .from("work_days")
      .select("*")
      .gte("work_date", start)
      .lte("work_date", end)
      .order("work_date");
    if (error) throw error;
    const pendingDates = new Set(getQueue().map((operation) => operation.work_date));
    const remoteDays = (data || []).map(normalizeDay).filter((day) => !pendingDates.has(day.work_date));
    const pendingDays = [...state.days.values()].filter((day) => day.work_date >= start && day.work_date <= end && pendingDates.has(day.work_date));
    state.summaryYearDays = [...remoteDays, ...pendingDays];
    for (const workDate of [...state.days.keys()]) {
      if (workDate >= start && workDate <= end && !pendingDates.has(workDate)) state.days.delete(workDate);
    }
    remoteDays.forEach((day) => state.days.set(day.work_date, day));
    state.summaryYearLoaded = year;
    persistLocalCache();
  } catch (error) {
    const cached = [...state.days.values()].filter((day) => day.work_date >= start && day.work_date <= end);
    if (!cached.length) throw error;
    state.summaryYearDays = cached;
    state.summaryYearLoaded = year;
    updateSyncStatus("Offline · riepilogo dai dati salvati");
  } finally {
    state.summaryYearLoading = false;
  }
}

function syncSummaryYearDay(day) {
  if (state.summaryYearLoaded !== Number(day.work_date.slice(0, 4))) return;
  state.summaryYearDays = state.summaryYearDays.filter((item) => item.work_date !== day.work_date);
  state.summaryYearDays.push(normalizeDay(day));
}

async function saveDay(day, { silent = false } = {}) {
  const normalized = normalizeDay(day);
  state.days.set(normalized.work_date, normalized);
  syncSummaryYearDay(normalized);
  syncSundayHolidayRecoveryUsage(normalized);
  persistLocalCache();
  renderCurrentViews();
  updateSyncStatus("Salvataggio…");

  if (!navigator.onLine) {
    queueOperation({ op: "upsert", work_date: normalized.work_date, payload: asCloudDay(normalized) });
    if (!silent) showToast("Salvato sul dispositivo. Sincronizzerò appena torni online.");
    return normalized;
  }

  const { data, error } = await state.supabase
    .from("work_days")
    .upsert(asCloudDay(normalized), { onConflict: "user_id,work_date" })
    .select()
    .single();

  if (error) {
    queueOperation({ op: "upsert", work_date: normalized.work_date, payload: asCloudDay(normalized) });
    if (!silent) showToast("Salvato sul dispositivo; la sincronizzazione è in attesa.");
    return normalized;
  }

  state.days.set(data.work_date, normalizeDay(data));
  syncSummaryYearDay(data);
  persistLocalCache();
  updateSyncStatus();
  return data;
}

async function deleteDay(date, { silent = false } = {}) {
  state.days.delete(date);
  if (state.summaryYearLoaded === Number(date.slice(0, 4))) {
    state.summaryYearDays = state.summaryYearDays.filter((item) => item.work_date !== date);
  }
  state.sundayHolidayRecoveryDays = state.sundayHolidayRecoveryDays.filter((item) => item.work_date !== date);
  persistLocalCache();
  renderCurrentViews();

  if (!navigator.onLine) {
    queueOperation({ op: "delete", work_date: date });
    if (!silent) showToast("Eliminata sul dispositivo. La modifica verrà sincronizzata online.");
    return;
  }

  const { error } = await state.supabase.from("work_days").delete().eq("user_id", state.user.id).eq("work_date", date);
  if (error) queueOperation({ op: "delete", work_date: date });
  updateSyncStatus();
}

async function flushQueue() {
  if (!state.user || !navigator.onLine) return;
  const queue = getQueue();
  if (!queue.length) return updateSyncStatus();
  updateSyncStatus("Sincronizzazione…");
  const remaining = [];
  for (const operation of queue) {
    let result;
    if (operation.op === "delete") {
      result = await state.supabase.from("work_days").delete().eq("user_id", state.user.id).eq("work_date", operation.work_date);
    } else {
      result = await state.supabase.from("work_days").upsert(operation.payload, { onConflict: "user_id,work_date" });
    }
    if (result.error) remaining.push(operation);
  }
  setQueue(remaining);
  if (!remaining.length) showToast("Modifiche sincronizzate.");
}

function fillChildSelect(select, selectedValue) {
  const children = familyChildren();
  select.replaceChildren();
  if (!children.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Nessun figlio configurato";
    select.append(option);
    select.disabled = true;
    return;
  }
  select.disabled = false;
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "Seleziona un figlio";
  select.append(empty);
  for (const child of children) {
    const option = document.createElement("option");
    option.value = child.id;
    option.textContent = child.name;
    select.append(option);
  }
  select.value = selectedValue || "";
}

function childAbsenceCount(childId, absenceType, start, end) {
  return state.childSicknessDays.filter((day) => {
    const effectiveType = day.actual_type || day.planned_type;
    const childMatches = day.child_id === childId || (!day.child_id && familyChildren().length === 1);
    return effectiveType === "absence"
      && childMatches
      && day.absence_type === absenceType
      && (!start || day.work_date >= start)
      && (!end || day.work_date <= end);
  }).length;
}

function updateChildPolicyHint(scope) {
  const hint = $(`#${scope}-child-policy`);
  if (!hint) return;
  const absenceType = $(`#${scope}-absence-type`).value;
  const child = familyChildren().find((item) => item.id === $(`#${scope}-child-id`).value);
  if (!child) {
    hint.textContent = "Seleziona il figlio collegato a questa assenza.";
    return;
  }
  if (absenceType === "child_sickness") {
    const preview = childSicknessEntitlement(child, scope === "day" ? $("#day-date").value : new Date());
    if (!preview.eligible) {
      hint.textContent = preview.reason || "Questa giornata non rientra nelle fasce configurate.";
      return;
    }
    const inApp = childAbsenceCount(child.id, "child_sickness", preview.periodStart, preview.periodEnd);
    const outside = Number(child.external_usage?.[preview.periodKey] || 0);
    const entitlement = childSicknessEntitlement(child, scope === "day" ? $("#day-date").value : new Date(), inApp, outside);
    hint.textContent = entitlement.tier === "under_three"
      ? `${entitlement.lifeYear}° anno di vita · ${entitlement.remainingPaidDays} dei 30 giorni retribuiti ancora disponibili nel periodo ${entitlement.periodStart}–${entitlement.periodEnd}. L’assenza per malattia resta collegata alla durata della malattia.`
      : `${entitlement.remainingDays} dei 10 giorni lavorativi ancora disponibili nell’anno solare ${entitlement.periodStart.slice(0, 4)}.`;
    return;
  }
  const messages = {
    parental_leave: "Congedo parentale facoltativo: associato al figlio, fruibile entro i 14 anni. I limiti individuali e di coppia vanno verificati sul totale di entrambi i genitori.",
    maternity_leave: "Congedo di maternità obbligatorio: collegato al figlio. Il periodo ordinario è di 5 mesi, con le flessibilità ammesse previa certificazione.",
    paternity_mandatory: "Congedo di paternità obbligatorio: collegato al figlio; 10 giorni lavorativi, 20 in caso di parto plurimo, nella finestra prevista dalla normativa.",
    paternity_alternative: "Congedo di paternità alternativo: usalo solo nei casi previsti (morte o grave infermità/abbandono della madre oppure affidamento esclusivo al padre)."
  };
  hint.textContent = messages[absenceType] || "Assenza collegata al figlio selezionato.";
}

function toggleAbsenceFields(scope) {
  const actual = $(`#${scope}-actual-type`).value || $(`#${scope}-planned-type`).value;
  const absenceField = $(`#${scope}-absence-field`);
  const absenceType = $(`#${scope}-absence-type`);
  absenceField.hidden = actual !== "absence";
  const childField = $(`#${scope}-child-field`);
  childField.hidden = actual !== "absence" || !CHILD_LINKED_ABSENCE_TYPES.has(absenceType.value);
  const ticket = $(`#${scope}-ticket`);
  if (ticket) {
    ticket.disabled = actual === "absence";
    if (actual === "absence") ticket.value = "auto";
  }
  const times = $(`#${scope}-times-field`);
  if (times) times.hidden = actual === "absence";
  if (!childField.hidden) updateChildPolicyHint(scope);
  const recoveryHint = $(`#${scope}-sunday-recovery-status`);
  if (recoveryHint) {
    const isRecovery = actual === "absence" && absenceType.value === "sunday_holiday_recovery";
    recoveryHint.hidden = !isRecovery;
    if (isRecovery) {
      const workDate = scope === "today" ? isoDateLocal() : $("#day-date").value;
      const balance = sundayHolidayBalance(Number(workDate.slice(0, 4)));
      recoveryHint.textContent = `${balance.used} utilizzati · ${balance.available} disponibili nell’anno.`;
    }
  }
}

function sundayHolidayRecoveryError(absenceType, workDate) {
  if (absenceType !== "sunday_holiday_recovery") return "";
  const date = workDate || isoDateLocal();
  const balance = sundayHolidayBalance(Number(date.slice(0, 4)));
  const existing = state.sundayHolidayRecoveryDays.some((day) => day.work_date === date
    && (day.actual_type || day.planned_type) === "absence");
  return canUseSundayHolidayRecovery(balance, date, existing).reason;
}

function calculationNow(day) {
  if (day.work_date === isoDateLocal()) return new Date();
  const dates = (day.events || []).map((event) => new Date(event.at)).filter((date) => !Number.isNaN(date.getTime()));
  return dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))) : new Date(`${day.work_date}T23:59:00`);
}

async function showExitNotification(forecast, entryKey) {
  const preferences = notificationPreferences();
  if (!preferences.enabled || preferences.notifiedEntry === entryKey || Notification.permission !== "granted") return;
  const body = `Uscita prevista alle ${formatTime(forecast)}. Ricordati di registrare l’uscita.`;
  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification("Chrono Flow · È ora di uscire", {
        body,
        icon: "./icons/icon-192.png",
        badge: "./icons/icon-192.png",
        tag: `chrono-flow-exit-${entryKey}`,
        renotify: false
      });
    } else {
      new Notification("Chrono Flow · È ora di uscire", { body, icon: "./icons/icon-192.png" });
    }
    saveNotificationPreferences({ notifiedEntry: entryKey });
  } catch {
    showToast("Non sono riuscito a mostrare la notifica. Controlla i permessi del browser.");
  }
}

function scheduleExitNotification(day, result, forecast) {
  window.clearTimeout(state.notificationTimer);
  state.notificationTimer = null;
  state.notificationTarget = null;
  const preferences = notificationPreferences();
  if (!preferences.enabled || !("Notification" in window) || Notification.permission !== "granted") return;
  if (!forecast || !result.firstEntry || !["working", "paused"].includes(result.state)) return;
  const entryKey = `${day.work_date}|${result.firstEntry.toISOString()}`;
  if (preferences.notifiedEntry === entryKey) return;
  const target = exitNotificationTime(forecast, preferences.leadMinutes);
  if (!target) return;
  state.notificationTarget = target;
  const delay = Math.max(0, target.getTime() - Date.now());
  state.notificationTimer = window.setTimeout(() => showExitNotification(forecast, entryKey), Math.min(delay, 2147483647));
}

function updateLocationChoice(effectiveType) {
  $$(".location-option").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.location === effectiveType));
  });
}

function updateTodayLiveDisplay(day, effectiveType, result, forecast) {
  const isLive = ["working", "paused"].includes(result.state);
  $("#worked-value").textContent = result.state === "working"
    ? secondsToDuration(result.workedSeconds)
    : minutesToDuration(result.workedMinutes);
  $("#forecast-value").textContent = formatTime(forecast);
  $("#overtime-value").textContent = minutesToDuration(result.overtimeMinutes);
  $("#ticket-value").textContent = ticketForDay(state.profile, day) ? "Sì" : "No";

  const primary = $("#primary-action");
  const exit = $("#exit-action");
  primary.disabled = effectiveType === "absence";
  exit.hidden = !isLive || effectiveType === "absence";

  if (effectiveType === "absence") {
    $("#work-state-label").textContent = ABSENCE_TYPES[day.absence_type] || "Assenza";
    $("#work-main-value").textContent = "Assenza";
    $("#work-main-caption").textContent = "Non sono previste timbrature per questa giornata.";
    primary.textContent = "Giornata segnata come assenza";
  } else if (result.state === "not_started") {
    $("#work-state-label").textContent = "Giornata non iniziata";
    $("#work-main-value").textContent = "—";
    $("#work-main-caption").textContent = "Registra l’entrata quando inizi.";
    primary.textContent = "Registra entrata";
  } else if (result.state === "working") {
    $("#work-state-label").textContent = "Stai lavorando";
    $("#work-main-value").textContent = secondsToDuration(result.workedSeconds);
    $("#work-main-caption").textContent = `Restano ${secondsToDuration(result.remainingSeconds)} di lavoro.`;
    primary.textContent = "Inizia pausa";
  } else if (result.state === "paused") {
    $("#work-state-label").textContent = "Pausa in corso";
    $("#work-main-value").textContent = secondsToDuration(result.pausedSeconds);
    $("#work-main-caption").textContent = "Il tempo di pausa non viene conteggiato come lavoro.";
    primary.textContent = "Termina pausa";
  } else {
    $("#work-state-label").textContent = "Giornata conclusa";
    $("#work-main-value").textContent = formatTime(result.lastExit);
    $("#work-main-caption").textContent = `Hai lavorato ${minutesToDuration(result.workedMinutes)}.`;
    primary.textContent = "Giornata conclusa";
    primary.disabled = true;
  }
}

function renderTodayTick() {
  if (!state.user || $("#today-screen").hidden || document.hidden) return;
  const now = new Date();
  const date = isoDateLocal(now);
  const day = state.days.get(date) || defaultDay(date);
  const effectiveType = day.actual_type || day.planned_type || "office";
  const result = calculateTrackedDay(day, now);
  const forecast = forecastExit(day.events, state.profile.target_minutes, breakForType(state.profile, effectiveType), now);
  updateTodayLiveDisplay(day, effectiveType, result, forecast);
}

function renderToday() {
  if (!state.user) return;
  const now = new Date();
  const date = isoDateLocal(now);
  const day = state.days.get(date) || defaultDay(date);
  const effectiveType = day.actual_type || day.planned_type || "office";
  const result = calculateTrackedDay(day, now);
  const plannedBreak = breakForType(state.profile, effectiveType);
  const forecast = forecastExit(day.events, state.profile.target_minutes, plannedBreak, now);
  const dayType = DAY_TYPES[effectiveType] || DAY_TYPES.office;

  $("#today-date").textContent = formatLongDate(now);
  $("#today-type-badge").textContent = dayType.label;
  $("#today-type-badge").className = `type-badge ${effectiveType}`;
  updateTodayLiveDisplay(day, effectiveType, result, forecast);
  updateLocationChoice(effectiveType);
  scheduleExitNotification(day, result, forecast);

  $("#today-planned-type").value = day.planned_type;
  $("#today-actual-type").value = effectiveType;
  $("#today-absence-type").value = day.absence_type || "vacation";
  fillChildSelect($("#today-child-id"), day.child_id);
  $("#today-ticket").value = day.ticket_override === true ? "yes" : day.ticket_override === false ? "no" : "auto";
  $("#today-notes").value = day.notes || "";
  toggleAbsenceFields("today");
}

async function recordAction(type) {
  if (state.busy) return;
  state.busy = true;
  const date = isoDateLocal();
  const existing = state.days.get(date);
  const before = existing ? structuredClone(existing) : null;
  const day = normalizeDay(existing || defaultDay(date));
  day.actual_type = day.actual_type || day.planned_type || "office";
  const event = { id: crypto.randomUUID(), type, at: new Date().toISOString() };
  day.events = [...day.events, event];
  await saveDay(day, { silent: true });
  state.busy = false;

  const labels = { entry: "Entrata registrata", pause: "Pausa iniziata", resume: "Pausa terminata", exit: "Uscita registrata" };
  showToast(`${labels[type]} alle ${formatTime(event.at)}.`, async () => {
    if (before) await saveDay(before, { silent: true });
    else await deleteDay(date, { silent: true });
    showToast("Ultima azione annullata.");
  });
}

function renderCalendar() {
  if (!state.user) return;
  const month = state.calendarMonth;
  renderMonthSelector("calendar", month);
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - mondayOffset);
  const grid = $("#calendar-grid");
  grid.replaceChildren();

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = isoDateLocal(date);
    const day = state.days.get(key);
    const type = day?.actual_type || day?.planned_type;
    const info = DAY_TYPES[type] || null;
    const holiday = recognizedItalianHolidays(date.getFullYear(), sundayHolidayContract().local_holiday)
      .find((item) => item.date === key);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-day";
    button.setAttribute("role", "gridcell");
    if (date.getMonth() !== month.getMonth()) button.classList.add("outside");
    if (key === isoDateLocal()) button.classList.add("today");
    if (holiday) button.classList.add("recognized-holiday");
    const label = `${formatLongDate(date)}${holiday ? `, ${holiday.name}` : ""}${info ? `, ${info.label}` : ", nessuna pianificazione"}${day?.events?.length ? ", orari registrati" : ""}`;
    button.setAttribute("aria-label", label);

    const number = document.createElement("span");
    number.className = "date-number";
    number.textContent = String(date.getDate());
    button.append(number);
    if (info) {
      const code = document.createElement("span");
      code.className = `day-code ${type}`;
      code.textContent = type === "office" ? "U" : type === "smart" ? "S" : type === "travel" ? "T" : "A";
      code.setAttribute("aria-hidden", "true");
      button.append(code);
    }
    if (day?.events?.length) {
      const dot = document.createElement("span");
      dot.className = "day-dot";
      dot.setAttribute("aria-hidden", "true");
      button.append(dot);
    }
    if (holiday) {
      const mark = document.createElement("span");
      mark.className = "holiday-mark";
      mark.textContent = "Fest.";
      mark.setAttribute("aria-hidden", "true");
      button.append(mark);
    }
    button.addEventListener("click", () => openDayDialog(key));
    grid.append(button);
  }
}

function clockValueForEvent(events, type) {
  const event = (events || []).find((item) => item.type === type);
  if (!event?.at) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Europe/Rome"
  }).formatToParts(new Date(event.at));
  const hour = parts.find((part) => part.type === "hour")?.value;
  const minute = parts.find((part) => part.type === "minute")?.value;
  return hour && minute ? `${hour}:${minute}` : "";
}

function openDayDialog(date) {
  const day = state.days.get(date) || defaultDay(date);
  $("#day-date").value = date;
  $("#day-dialog-title").textContent = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${date}T12:00:00`));
  $("#day-planned-type").value = day.planned_type;
  $("#day-actual-type").value = day.actual_type || "";
  $("#day-absence-type").value = day.absence_type || "vacation";
  fillChildSelect($("#day-child-id"), day.child_id);
  $("#day-ticket").value = day.ticket_override === true ? "yes" : day.ticket_override === false ? "no" : "auto";
  $("#day-notes").value = day.notes || "";
  $("#day-entry-time").value = clockValueForEvent(day.events, "entry");
  $("#day-pause-start-time").value = clockValueForEvent(day.events, "pause");
  $("#day-pause-end-time").value = clockValueForEvent(day.events, "resume");
  $("#day-exit-time").value = clockValueForEvent(day.events, "exit");
  $("#delete-day").hidden = !state.days.has(date);
  toggleAbsenceFields("day");
  $("#day-dialog").showModal();
}

function recoveryRuleCopy(rule) {
  if (rule === SUNDAY_HOLIDAY_RULES.ACCRUE_DAY) {
    return "Chrono Flow aggiunge automaticamente +1 giorno per ogni festività riconosciuta caduta di domenica e già trascorsa.";
  }
  if (rule === SUNDAY_HOLIDAY_RULES.ECONOMIC_ONLY) {
    return "È prevista soltanto la compensazione economica: non vengono creati giorni di recupero.";
  }
  if (rule === SUNDAY_HOLIDAY_RULES.MANUAL) {
    return "Il saldo dipende esclusivamente dalle correzioni manuali registrate nelle Impostazioni.";
  }
  return "La regola scelta non prevede giorni di recupero.";
}

function renderRecoveryBalance(prefix, year, contractOverride = null) {
  const balance = sundayHolidayBalance(year, contractOverride);
  const title = $(`#${prefix}-recovery-title`);
  if (title) title.textContent = `Recuperi festività · ${year}`;
  $(`#${prefix}-recovery-copy`).textContent = recoveryRuleCopy(balance.rule);
  $(`#${prefix}-recovery-accrued`).textContent = String(balance.accrued);
  $(`#${prefix}-recovery-used`).textContent = String(balance.used);
  $(`#${prefix}-recovery-available`).textContent = String(balance.available);
  const adjustment = $(`#${prefix}-recovery-adjustment`);
  if (adjustment) {
    adjustment.textContent = balance.adjustment
      ? `Il totale include una correzione manuale di ${balance.adjustment > 0 ? "+" : ""}${balance.adjustment} giorni.`
      : "Nessuna correzione manuale applicata.";
  }
  const list = $(`#${prefix}-recovery-holidays`);
  if (list) {
    list.replaceChildren();
    if (!balance.recognizedSundays.length) {
      const item = document.createElement("li");
      item.textContent = "Nessuna festività riconosciuta cade di domenica in questo anno.";
      list.append(item);
    } else {
      for (const holiday of balance.recognizedSundays) {
        const item = document.createElement("li");
        const name = document.createElement("span");
        name.textContent = `${holiday.name} · ${new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long" }).format(new Date(`${holiday.date}T12:00:00`))}`;
        const status = document.createElement("span");
        status.className = "status-chip";
        status.textContent = holiday.date <= isoDateLocal() ? "Rilevata" : "Futura";
        item.append(name, status);
        list.append(item);
      }
    }
  }
}

function settingsContractDraft() {
  const current = sundayHolidayContract();
  const year = clampInt($("#sunday-holiday-adjustment-year")?.value, 2000, 2100, new Date().getFullYear());
  const days = clampInt($("#sunday-holiday-adjustment-days")?.value, -366, 366, 0);
  const reason = $("#sunday-holiday-adjustment-reason")?.value.trim() || "";
  const adjustments = { ...(current.sunday_holiday_adjustments || {}) };
  if (days || reason) adjustments[String(year)] = { days, reason };
  else delete adjustments[String(year)];
  const local = {
    name: $("#local-holiday-name")?.value.trim() || "",
    day: clampInt($("#local-holiday-day")?.value, 1, 31, 0),
    month: clampInt($("#local-holiday-month")?.value, 1, 12, 0)
  };
  const hasPartialLocalHoliday = Boolean(local.name || local.day || local.month);
  return {
    ...current,
    sunday_holiday_rule: $("input[name='sunday-holiday-rule']:checked")?.value || "none",
    sunday_holiday_adjustments: adjustments,
    local_holiday: local.name && local.day && local.month ? local : hasPartialLocalHoliday ? current.local_holiday : null
  };
}

function previewSundayHolidaySettings() {
  const year = clampInt($("#sunday-holiday-adjustment-year")?.value, 2000, 2100, new Date().getFullYear());
  renderRecoveryBalance("settings", year, settingsContractDraft());
  updateSettingsSummaries();
}

function absenceCountsForDays(days) {
  const counts = {};
  for (const day of days) {
    if ((day.actual_type || day.planned_type) !== "absence") continue;
    const absenceType = day.absence_type || "leave";
    counts[absenceType] = (counts[absenceType] || 0) + 1;
  }
  return counts;
}

function renderAbsenceBreakdown(target, counts) {
  const entries = Object.entries(counts)
    .filter(([, count]) => Number(count) > 0)
    .map(([key, count]) => {
      const fallback = String(key || "Altra assenza")
        .replaceAll("_", " ")
        .replace(/^./, (letter) => letter.toUpperCase());
      return [key, ABSENCE_TYPES[key] || fallback, Number(count)];
    })
    .sort((left, right) => right[2] - left[2] || left[1].localeCompare(right[1], "it"));
  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M8 2v3M16 2v3M3.5 9h17M6 4h12a2.5 2.5 0 0 1 2.5 2.5v12A2.5 2.5 0 0 1 18 21H6a2.5 2.5 0 0 1-2.5-2.5v-12A2.5 2.5 0 0 1 6 4Zm2.5 9 2 2 4-4"/></svg><strong>Nessuna assenza nel periodo</strong><span>Le assenze registrate compariranno qui, suddivise per tipologia.</span>';
    target.replaceChildren(empty);
    return;
  }
  const maximum = Math.max(...entries.map(([, , count]) => count));
  target.replaceChildren(...entries.map(([, label, count]) => {
    const row = document.createElement("div");
    row.className = "bar-row";
    const name = document.createElement("span");
    name.textContent = label;
    const track = document.createElement("div");
    track.className = "bar-track";
    track.setAttribute("role", "img");
    track.setAttribute("aria-label", `${label}: ${count} giornat${count === 1 ? "a" : "e"}`);
    const fill = document.createElement("div");
    fill.className = "bar-fill";
    fill.style.width = `${(count / maximum) * 100}%`;
    fill.setAttribute("aria-hidden", "true");
    track.append(fill);
    const value = document.createElement("strong");
    value.textContent = String(count);
    row.append(name, track, value);
    return row;
  }));
}

function renderSummary() {
  if (!state.user) return;
  renderMonthSelector("summary", state.summaryMonth);
  const { start, end } = monthBounds(state.summaryMonth);
  const days = [...state.days.values()].filter((day) => day.work_date >= start && day.work_date <= end);
  const totals = { worked: 0, overtime: 0, tickets: 0, office: 0, smart: 0, travel: 0, absence: 0, absenceTypes: {} };
  for (const day of days) {
    const result = calculateTrackedDay(day, calculationNow(day));
    totals.worked += result.workedMinutes;
    totals.overtime += result.overtimeMinutes;
    totals.tickets += ticketForDay(state.profile, day) ? 1 : 0;
    const effectiveType = day.actual_type || day.planned_type || "office";
    totals[effectiveType] = (totals[effectiveType] || 0) + 1;
    if (effectiveType === "absence") {
      const absenceType = day.absence_type || "leave";
      totals.absenceTypes[absenceType] = (totals.absenceTypes[absenceType] || 0) + 1;
    }
  }

  const cards = [
    ["Ore lavorate", minutesToDuration(totals.worked)],
    ["Straordinario", minutesToDuration(totals.overtime)],
    ["Buoni pasto", String(totals.tickets)],
    ["Giornate registrate", String(days.length)],
    ["Smart working", String(totals.smart)],
    ["Assenze", String(totals.absence)]
  ];
  $("#summary-cards").replaceChildren(...cards.map(([label, value]) => {
    const card = document.createElement("article");
    card.className = "summary-card";
    const span = document.createElement("span");
    span.textContent = label;
    const strong = document.createElement("strong");
    strong.textContent = value;
    card.append(span, strong);
    return card;
  }));

  const maximum = Math.max(1, totals.office, totals.smart, totals.travel, totals.absence);
  const rows = [
    ["Ufficio", totals.office], ["Smart", totals.smart], ["Trasferta", totals.travel], ["Assenza", totals.absence]
  ];
  $("#summary-types").replaceChildren(...rows.map(([label, count]) => {
    const row = document.createElement("div");
    row.className = "bar-row";
    const name = document.createElement("span");
    name.textContent = label;
    const track = document.createElement("div");
    track.className = "bar-track";
    const fill = document.createElement("div");
    fill.className = "bar-fill";
    fill.style.width = `${(count / maximum) * 100}%`;
    fill.setAttribute("aria-hidden", "true");
    track.append(fill);
    const value = document.createElement("strong");
    value.textContent = String(count);
    row.append(name, track, value);
    return row;
  }));

  renderAbsenceBreakdown($("#summary-month-absences"), totals.absenceTypes);
  $("#summary-month-absence-count").textContent = `${totals.absence} giornat${totals.absence === 1 ? "a" : "e"}`;

  const selectedYear = state.summaryMonth.getFullYear();
  const { start: yearStart, end: yearEnd } = yearBounds(selectedYear);
  const yearDays = state.summaryYearLoaded === selectedYear
    ? state.summaryYearDays
    : [...state.days.values()].filter((day) => day.work_date >= yearStart && day.work_date <= yearEnd);
  const yearAbsences = absenceCountsForDays(yearDays);
  const yearAbsenceTotal = Object.values(yearAbsences).reduce((total, count) => total + count, 0);
  renderAbsenceBreakdown($("#summary-year-absences"), yearAbsences);
  $("#summary-year-absence-count").textContent = state.summaryYearLoading && state.summaryYearLoaded !== selectedYear
    ? "Caricamento…"
    : `${yearAbsenceTotal} giornat${yearAbsenceTotal === 1 ? "a" : "e"} nel ${selectedYear}`;
  $("#summary-year-absence-description").textContent = `Dettaglio per tipologia dal 1 gennaio al 31 dicembre ${selectedYear}.`;
  renderRecoveryBalance("summary", state.summaryMonth.getFullYear());
}

function renderChildren() {
  const list = $("#children-list");
  list.replaceChildren();
  const children = familyChildren();
  setSettingsSummary("family-settings-summary", children.length ? `${children.length} figli${children.length === 1 ? "o" : ""} configurat${children.length === 1 ? "o" : "i"}` : "Nessun figlio configurato");
  if (!children.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state compact";
    empty.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3.5 20v-2.5A4.5 4.5 0 0 1 8 13h2a4.5 4.5 0 0 1 4.5 4.5V20M17 8v6m-3-3h6"/></svg><strong>Nessun figlio configurato</strong><span>Aggiungi nome e data di nascita per collegare le assenze familiari.</span>';
    list.append(empty);
    return;
  }
  children.forEach((child) => {
    const row = document.createElement("div");
    row.className = "child-row";
    const info = document.createElement("div");
    info.className = "child-info";
    const name = document.createElement("strong");
    name.textContent = child.name;
    const date = document.createElement("span");
    date.textContent = child.birth_date ? `Nato/a il ${new Intl.DateTimeFormat("it-IT").format(new Date(`${child.birth_date}T12:00:00`))}` : "Data di nascita non indicata";
    const entitlementPreview = childSicknessEntitlement(child, new Date());
    const policy = document.createElement("p");
    policy.className = "child-policy";
    let usageField = null;
    if (entitlementPreview.eligible) {
      const inApp = childAbsenceCount(child.id, "child_sickness", entitlementPreview.periodStart, entitlementPreview.periodEnd);
      const outside = Number(child.external_usage?.[entitlementPreview.periodKey] || 0);
      const entitlement = childSicknessEntitlement(child, new Date(), inApp, outside);
      policy.textContent = entitlement.tier === "under_three"
        ? `${entitlement.lifeYear}° anno di vita: ${entitlement.remainingPaidDays}/30 giorni retribuiti residui; ${inApp} registrati nell’app.`
        : `${entitlement.remainingDays}/10 giorni lavorativi residui nel ${entitlement.periodStart.slice(0, 4)}; ${inApp} registrati nell’app.`;
      usageField = document.createElement("div");
      usageField.className = "child-usage-field";
      const usageLabel = document.createElement("label");
      const usageId = `child-usage-${child.id}`;
      usageLabel.htmlFor = usageId;
      usageLabel.textContent = "Giorni usati fuori app o dall’altro genitore nel periodo";
      const usageInput = document.createElement("input");
      usageInput.id = usageId;
      usageInput.type = "number";
      usageInput.min = "0";
      usageInput.max = "366";
      usageInput.value = String(outside);
      usageInput.addEventListener("change", () => {
        child.external_usage = { ...(child.external_usage || {}), [entitlement.periodKey]: clampInt(usageInput.value, 0, 366, 0) };
        renderChildren();
        announce("Utilizzi esterni aggiornati. Salva le impostazioni per confermare.");
      });
      usageField.append(usageLabel, usageInput);
    } else {
      policy.textContent = entitlementPreview.reason || "Nessun diritto automatico calcolabile per la data odierna.";
    }
    info.append(name, date, policy);
    if (usageField) info.append(usageField);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "icon-button danger-icon";
    remove.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5"/></svg>';
    remove.setAttribute("aria-label", `Rimuovi ${child.name}`);
    remove.addEventListener("click", () => {
      state.profile.family_settings = { ...state.profile.family_settings, children: familyChildren().filter((item) => item.id !== child.id) };
      renderChildren();
      announce(`${child.name} rimosso. Salva le impostazioni per confermare.`);
    });
    row.append(info, remove);
    list.append(row);
  });
}

function renderNotificationPermissionStatus() {
  const status = $("#notification-permission-status");
  const button = $("#request-notification-permission");
  if (installContext().ios && !installContext().standalone) {
    status.textContent = "Su iPhone e iPad le notifiche sono disponibili quando Chrono Flow viene aperta dalla schermata Home. Tocca Condividi, poi Aggiungi alla schermata Home.";
    button.textContent = "Come installare Chrono Flow";
    button.disabled = false;
    return;
  }
  button.textContent = "Consenti notifiche su questo dispositivo";
  if (!("Notification" in window)) {
    status.textContent = "Questo browser non supporta le notifiche web.";
    button.disabled = true;
    return;
  }
  button.disabled = Notification.permission === "granted";
  if (Notification.permission === "granted") {
    status.textContent = "Notifiche consentite su questo dispositivo. Per una consegna più affidabile, usa la PWA installata e non forzarne la chiusura.";
  } else if (Notification.permission === "denied") {
    status.textContent = "Notifiche bloccate. Riattivale dalle impostazioni del browser o del sistema.";
  } else {
    status.textContent = "Permesso non ancora richiesto. Verrà chiesto solo quando premi il pulsante.";
  }
}

function fillSundayHolidayAdjustmentFields(year) {
  const contract = sundayHolidayContract();
  const adjustment = contract.sunday_holiday_adjustments?.[String(year)] || {};
  $("#sunday-holiday-adjustment-days").value = String(clampInt(adjustment.days, -366, 366, 0));
  $("#sunday-holiday-adjustment-reason").value = adjustment.reason || "";
}

function setSettingsSummary(id, text) {
  const target = $(`#${id}`);
  if (target) target.textContent = text;
}

function updateSettingsSummaries() {
  const hours = clampInt($("#target-hours")?.value, 1, 15, 7);
  const minutes = clampInt($("#target-minutes")?.value, 0, 59, 36);
  setSettingsSummary("profile-settings-summary", `${hours}h ${String(minutes).padStart(2, "0")}m · soglia straordinario ${clampInt($("#overtime-threshold")?.value, 0, 240, 10)} min`);
  const ticketLabels = [
    ["#ticket-office", "Ufficio"], ["#ticket-smart", "Smart"], ["#ticket-travel", "Trasferta"]
  ].filter(([selector]) => $(selector)?.checked).map(([, label]) => label);
  setSettingsSummary("ticket-settings-summary", ticketLabels.length ? `Attivi: ${ticketLabels.join(", ")}` : "Nessun buono automatico");
  setSettingsSummary("notification-settings-summary", $("#exit-notification-enabled")?.checked
    ? `Attiva · ${$("#exit-notification-lead")?.selectedOptions?.[0]?.textContent || "orario previsto"}`
    : "Disattivata");
  const childCount = familyChildren().length;
  setSettingsSummary("family-settings-summary", childCount ? `${childCount} figli${childCount === 1 ? "o" : ""} configurat${childCount === 1 ? "o" : "i"}` : "Nessun figlio configurato");
  const ruleLabels = {
    accrue_day: "Recupero automatico",
    economic_only: "Solo compensazione economica",
    none: "Nessun recupero",
    manual: "Gestione manuale"
  };
  const rule = $("input[name='sunday-holiday-rule']:checked")?.value || "none";
  const previewYear = clampInt($("#sunday-holiday-adjustment-year")?.value, 2000, 2100, new Date().getFullYear());
  const preview = sundayHolidayBalance(previewYear, settingsContractDraft());
  setSettingsSummary("holiday-settings-summary", `${ruleLabels[rule]} · ${preview.available} disponibili nel ${previewYear}`);
}

function renderSettings() {
  const profile = state.profile;
  $("#settings-name").value = profile.display_name || "";
  $("#target-hours").value = Math.floor(profile.target_minutes / 60);
  $("#target-minutes").value = profile.target_minutes % 60;
  $("#office-break").value = profile.office_break_minutes;
  $("#smart-break").value = profile.smart_break_minutes;
  $("#travel-break").value = profile.travel_break_minutes;
  $("#overtime-threshold").value = profile.overtime_threshold;
  const overtime = overtimeSettings();
  $("#overtime-smart").checked = overtime.smart;
  $("#overtime-travel").checked = overtime.travel;
  $("#ticket-office").checked = Boolean(profile.ticket_office);
  $("#ticket-smart").checked = Boolean(profile.ticket_smart);
  $("#ticket-travel").checked = Boolean(profile.ticket_travel);
  const contract = normalizeFamilySettings(profile.family_settings).contract_settings;
  const selectedRule = $(`input[name="sunday-holiday-rule"][value="${contract.sunday_holiday_rule || "none"}"]`);
  if (selectedRule) selectedRule.checked = true;
  const currentYear = new Date().getFullYear();
  $("#sunday-holiday-adjustment-year").value = String(currentYear);
  fillSundayHolidayAdjustmentFields(currentYear);
  $("#local-holiday-name").value = contract.local_holiday?.name || "";
  $("#local-holiday-day").value = contract.local_holiday?.day || "";
  $("#local-holiday-month").value = contract.local_holiday?.month || "";
  renderRecoveryBalance("settings", currentYear);
  const notification = notificationPreferences();
  $("#exit-notification-enabled").checked = notification.enabled;
  $("#exit-notification-lead").value = String(notification.leadMinutes);
  renderNotificationPermissionStatus();
  renderChildren();
  updateSettingsSummaries();
}

function renderAccount() {
  const name = state.profile.display_name || state.user.email.split("@")[0];
  $("#account-name").textContent = name;
  $("#account-email").textContent = state.user.email;
  $("#account-initial").textContent = name.trim().charAt(0).toUpperCase() || "U";
}

function renderCurrentViews() {
  renderToday();
  if (!$("#calendar-screen").hidden) renderCalendar();
  if (!$("#summary-screen").hidden) renderSummary();
}

function showScreen(name) {
  $$(".screen").forEach((screen) => { screen.hidden = screen.dataset.screen !== name; });
  $$(".nav-item").forEach((button) => {
    const active = button.dataset.target === name;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  if (name === "calendar") renderCalendar();
  if (name === "summary") {
    renderSummary();
    fetchSummaryYear(state.summaryMonth.getFullYear())
      .then(renderSummary)
      .catch((error) => showToast(`Riepilogo annuale non disponibile: ${friendlyError(error)}`));
  }
  if (name === "settings") {
    renderSettings();
    fetchChildSicknessUsage().then(renderChildren).catch(() => {});
  }
  $("#main-content").focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

function offerLegacyMigration({ force = false } = {}) {
  if (!state.user) return false;
  if (!force && localStorage.getItem(migrationMarkerKey())) return false;
  const migration = detectLegacyData(localStorage);
  if (!migration.hasData) {
    if (force) showToast("Non ho trovato dati anonimi da importare su questo dispositivo.");
    return false;
  }
  state.legacyMigration = migration;
  const parts = [];
  if (migration.days.length) parts.push(`${migration.days.length} giornat${migration.days.length === 1 ? "a" : "e"}`);
  if (migration.profilePatch) parts.push("impostazioni personali");
  $("#migration-summary").textContent = `Sul dispositivo sono presenti: ${parts.join(" e ")}.`;
  $("#migration-status").textContent = migration.invalidKeys.length
    ? "Alcuni dati non leggibili resteranno comunque sul dispositivo e non verranno eliminati."
    : "La copia locale verrà eliminata solo dopo la conferma del salvataggio nel tuo account.";
  $("#migration-dialog").showModal();
  $("#import-local-data").focus();
  return true;
}

async function importLegacyData() {
  const migration = state.legacyMigration;
  if (!state.user || !migration) return;
  if (!navigator.onLine) {
    $("#migration-status").textContent = "Per confermare l’importazione nel cloud devi essere online.";
    showToast("Connettiti a Internet e riprova: i dati locali sono ancora al sicuro.");
    return;
  }

  const button = $("#import-local-data");
  const ignore = $("#ignore-local-data");
  button.disabled = true;
  ignore.disabled = true;
  button.textContent = "Importazione…";
  $("#migration-status").textContent = "Sto copiando i dati nel tuo account. Non chiudere questa pagina.";

  try {
    const existingDates = new Set();
    for (let index = 0; index < migration.days.length; index += 100) {
      const dates = migration.days.slice(index, index + 100).map((day) => day.work_date);
      const result = await state.supabase.from("work_days").select("work_date").in("work_date", dates);
      if (result.error) throw result.error;
      (result.data || []).forEach((day) => existingDates.add(day.work_date));
    }
    const pending = migration.days.filter((day) => !existingDates.has(day.work_date));
    const imported = [];

    for (let index = 0; index < pending.length; index += 200) {
      const batch = pending.slice(index, index + 200).map(asCloudDay);
      const result = await state.supabase
        .from("work_days")
        .upsert(batch, { onConflict: "user_id,work_date" })
        .select();
      if (result.error) throw result.error;
      imported.push(...(result.data || []));
    }

    if (migration.profilePatch) {
      const profilePayload = {
        ...state.profile,
        ...migration.profilePatch,
        id: state.user.id,
        display_name: state.profile.display_name || state.user.user_metadata?.display_name || state.user.email.split("@")[0]
      };
      const result = await state.supabase.from("profiles").upsert(profilePayload).select().single();
      if (result.error) throw result.error;
      state.profile = { ...DEFAULT_PROFILE, ...result.data, family_settings: normalizeFamilySettings(result.data.family_settings) };
    }

    imported.forEach((day) => {
      const normalized = normalizeDay(day);
      state.days.set(day.work_date, normalized);
      syncSundayHolidayRecoveryUsage(normalized);
    });
    persistLocalCache();
    clearMigratedLegacyData(localStorage, migration.sourceKeys);
    localStorage.setItem(migrationMarkerKey(), "completed");
    state.legacyMigration = null;
    $("#migration-dialog").close();
    renderAccount();
    renderCurrentViews();
    const skipped = migration.days.length - imported.length;
    const messages = [`${imported.length} giornat${imported.length === 1 ? "a importata" : "e importate"}`];
    if (skipped) messages.push(`${skipped} già present${skipped === 1 ? "e" : "i"} nel cloud`);
    if (migration.profilePatch) messages.push("impostazioni importate");
    showToast(`${messages.join(" · ")}.`);
  } catch (error) {
    $("#migration-status").textContent = "Importazione interrotta. La copia locale non è stata eliminata: puoi riprovare.";
    showToast(`Importazione non riuscita: ${friendlyError(error)}`);
  } finally {
    button.disabled = false;
    ignore.disabled = false;
    button.textContent = "Importa nel mio account";
  }
}

function ignoreLegacyMigration() {
  if (!state.user) return;
  localStorage.setItem(migrationMarkerKey(), "ignored");
  state.legacyMigration = null;
  $("#migration-dialog").close();
  showToast("Dati locali ignorati. Restano sul dispositivo e potrai importarli dalle Impostazioni.");
}

async function loadApplication(user) {
  state.user = user;
  state.days.clear();
  state.summaryYearDays = [];
  state.summaryYearLoaded = null;
  state.summaryYearLoading = false;
  loadLocalCache();
  try {
    await Promise.all([
      fetchProfile(),
      fetchMonth(state.calendarMonth),
      fetchChildSicknessUsage(),
      fetchSundayHolidayRecoveryUsage()
    ]);
  } catch (error) {
    if (!state.days.size) {
      showToast(`Non riesco a caricare i dati: ${friendlyError(error)}`);
    }
  }
  $("#loading-view").hidden = true;
  $("#auth-view").hidden = true;
  $("#configuration-view").hidden = true;
  $("#app-shell").hidden = false;
  renderMonthSelector("calendar", state.calendarMonth);
  renderMonthSelector("summary", state.summaryMonth);
  $("#bulk-start").value ||= isoDateLocal();
  $("#bulk-end").value ||= isoDateLocal();
  renderAccount();
  renderToday();
  updateSyncStatus();
  flushQueue();
  offerLegacyMigration();
}

function showAuth() {
  state.user = null;
  state.days.clear();
  state.sundayHolidayRecoveryDays = [];
  state.summaryYearDays = [];
  state.summaryYearLoaded = null;
  state.summaryYearLoading = false;
  state.profile = structuredClone(DEFAULT_PROFILE);
  state.legacyMigration = null;
  if ($("#migration-dialog").open) $("#migration-dialog").close();
  $("#loading-view").hidden = true;
  $("#app-shell").hidden = true;
  $("#configuration-view").hidden = true;
  $("#auth-view").hidden = false;
  $("#email").focus();
}

function switchAuthMode(mode) {
  state.authMode = mode;
  const register = mode === "register";
  $("#display-name-field").hidden = !register;
  $("#display-name").required = register;
  $("#password").autocomplete = register ? "new-password" : "current-password";
  $("#auth-title").textContent = register ? "Crea il tuo account" : "Accedi alle tue giornate";
  $("#auth-description").textContent = register
    ? "Ogni account vede soltanto le proprie giornate. Potrebbe essere richiesta la conferma via email."
    : "Usa il tuo account personale. Gli altri utenti non possono vedere i tuoi dati.";
  $("#auth-submit").textContent = register ? "Crea il mio account" : "Accedi";
  $("#show-login").classList.toggle("active", !register);
  $("#show-register").classList.toggle("active", register);
  $("#show-login").setAttribute("aria-pressed", String(!register));
  $("#show-register").setAttribute("aria-pressed", String(register));
  $("#auth-error").hidden = true;
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const errorBox = $("#auth-error");
  errorBox.hidden = true;
  if (!form.reportValidity()) return;
  const email = $("#email").value.trim();
  const password = $("#password").value;
  $("#auth-submit").disabled = true;
  $("#auth-submit").textContent = state.authMode === "register" ? "Creazione account…" : "Accesso…";

  let result;
  if (state.authMode === "register") {
    result = await state.supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: $("#display-name").value.trim() } }
    });
  } else {
    result = await state.supabase.auth.signInWithPassword({ email, password });
  }

  $("#auth-submit").disabled = false;
  switchAuthMode(state.authMode);
  if (result.error) {
    errorBox.textContent = friendlyError(result.error);
    errorBox.hidden = false;
    errorBox.focus();
    return;
  }
  if (state.authMode === "register" && !result.data.session) {
    showToast("Account creato. Apri l’email di conferma prima di accedere.");
    switchAuthMode("login");
  }
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
  navigator.serviceWorker
    .register("./sw.js", { updateViaCache: "none" })
    .then((registration) => registration.update())
    .catch(() => {});
}

async function initialize() {
  bindEvents();
  setupInstallExperience();
  if (!configured || !window.supabase?.createClient) {
    $("#loading-view").hidden = true;
    $("#configuration-view").hidden = false;
    return;
  }
  state.supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  state.supabase.auth.onAuthStateChange((event, session) => {
    if (event === "INITIAL_SESSION") return;
    if (event === "SIGNED_OUT") {
      showAuth();
      return;
    }
    if (!session?.user) return;
    window.setTimeout(async () => {
      if (session.user.id !== state.user?.id) await loadApplication(session.user);
      if (event === "PASSWORD_RECOVERY") {
        showScreen("settings");
        showToast("Link verificato. Inserisci ora la nuova password in Sicurezza account.");
        $("#new-password").focus();
      }
    }, 0);
  });
  const { data, error } = await state.supabase.auth.getSession();
  if (error) showToast(friendlyError(error));
  if (data?.session?.user) await loadApplication(data.session.user);
  else showAuth();
  registerServiceWorker();
  window.setInterval(renderTodayTick, 1000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) renderTodayTick();
  });
}

function bindEvents() {
  $("#install-app").addEventListener("click", handleInstallAction);
  $("#dismiss-install-banner").addEventListener("click", dismissInstallBanner);
  $("#close-install-banner").addEventListener("click", dismissInstallBanner);
  $("#show-login").addEventListener("click", () => switchAuthMode("login"));
  $("#show-register").addEventListener("click", () => switchAuthMode("register"));
  $("#auth-form").addEventListener("submit", handleAuthSubmit);
  $("#migration-dialog").addEventListener("cancel", (event) => event.preventDefault());
  $("#import-local-data").addEventListener("click", importLegacyData);
  $("#ignore-local-data").addEventListener("click", ignoreLegacyMigration);
  $("#review-local-data").addEventListener("click", () => offerLegacyMigration({ force: true }));
  $("#reset-password").addEventListener("click", async () => {
    const email = $("#email").value.trim();
    if (!email) {
      $("#auth-error").textContent = "Inserisci prima l’email dell’account.";
      $("#auth-error").hidden = false;
      $("#email").focus();
      return;
    }
    const { error } = await state.supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}${location.pathname}` });
    if (error) showToast(friendlyError(error));
    else showToast("Link inviato. Controlla la posta e anche la cartella indesiderata.");
  });

  $("#account-button").addEventListener("click", () => {
    const panel = $("#account-panel");
    panel.hidden = !panel.hidden;
    $("#account-button").setAttribute("aria-expanded", String(!panel.hidden));
  });
  $("#sign-out").addEventListener("click", async () => {
    await flushQueue();
    const { error } = await state.supabase.auth.signOut();
    if (error) showToast(friendlyError(error));
  });

  $$(".nav-item").forEach((button) => button.addEventListener("click", () => showScreen(button.dataset.target)));
  $$('[data-disclosure]').forEach((details) => {
    const summary = details.querySelector(":scope > summary");
    const updateExpanded = () => summary?.setAttribute("aria-expanded", String(details.open));
    details.addEventListener("toggle", updateExpanded);
    updateExpanded();
  });
  $$(".location-option").forEach((button) => button.addEventListener("click", async () => {
    const date = isoDateLocal();
    const day = normalizeDay(state.days.get(date) || defaultDay(date));
    day.planned_type = button.dataset.location;
    day.actual_type = button.dataset.location;
    day.absence_type = null;
    day.child_id = null;
    await saveDay(day, { silent: true });
    showToast(`Oggi lavori: ${button.dataset.location === "smart" ? "Casa" : DAY_TYPES[button.dataset.location].label}.`);
  }));
  $("#primary-action").addEventListener("click", () => {
    const day = state.days.get(isoDateLocal()) || defaultDay(isoDateLocal());
    const result = calculateTrackedDay(day, new Date());
    if (result.state === "not_started") recordAction("entry");
    else if (result.state === "working") recordAction("pause");
    else if (result.state === "paused") recordAction("resume");
  });
  $("#exit-action").addEventListener("click", () => recordAction("exit"));
  $("#toast-action").addEventListener("click", async () => {
    const action = state.undo;
    state.undo = null;
    $("#toast").hidden = true;
    if (action) await action();
  });

  $("#today-planned-type").addEventListener("change", () => toggleAbsenceFields("today"));
  $("#today-actual-type").addEventListener("change", () => toggleAbsenceFields("today"));
  $("#today-absence-type").addEventListener("change", () => toggleAbsenceFields("today"));
  $("#today-details-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const date = isoDateLocal();
    const day = normalizeDay(state.days.get(date) || defaultDay(date));
    day.planned_type = $("#today-planned-type").value;
    day.actual_type = $("#today-actual-type").value;
    day.absence_type = day.actual_type === "absence" ? $("#today-absence-type").value : null;
    const absenceError = sundayHolidayRecoveryError(day.absence_type, day.work_date);
    if (absenceError) return showToast(absenceError);
    day.child_id = CHILD_LINKED_ABSENCE_TYPES.has(day.absence_type) ? $("#today-child-id").value || null : null;
    day.ticket_override = day.actual_type === "absence" || $("#today-ticket").value === "auto" ? null : $("#today-ticket").value === "yes";
    day.notes = $("#today-notes").value.trim();
    await saveDay(day, { silent: true });
    showToast("Dettagli di oggi salvati.");
  });

  $("#bulk-plan-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const startValue = $("#bulk-start").value;
    const endValue = $("#bulk-end").value;
    const weekdays = new Set($$("input[name='bulk-weekday']:checked").map((input) => Number(input.value)));
    if (!startValue || !endValue || startValue > endValue) {
      showToast("Controlla le date: la data finale deve essere uguale o successiva a quella iniziale.");
      return;
    }
    if (!weekdays.size) {
      showToast("Seleziona almeno un giorno della settimana.");
      return;
    }
    const start = new Date(`${startValue}T12:00:00`);
    const end = new Date(`${endValue}T12:00:00`);
    const dayCount = Math.round((end - start) / 86400000) + 1;
    if (dayCount > 366) {
      showToast("Puoi pianificare al massimo 366 giorni per volta.");
      return;
    }
    const type = $("#bulk-type").value;
    const changed = [];
    for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
      if (!weekdays.has(cursor.getDay())) continue;
      const date = isoDateLocal(cursor);
      const day = normalizeDay(state.days.get(date) || defaultDay(date));
      day.planned_type = type;
      changed.push(day);
      state.days.set(date, day);
      syncSummaryYearDay(day);
    }
    if (!changed.length) {
      showToast("Nell’intervallo non ci sono giorni corrispondenti alla selezione.");
      return;
    }
    persistLocalCache();
    renderCurrentViews();
    if (!navigator.onLine) {
      changed.forEach((day) => queueOperation({ op: "upsert", work_date: day.work_date, payload: asCloudDay(day) }));
      showToast(`${changed.length} giornate pianificate sul dispositivo; sincronizzazione in attesa.`);
      return;
    }
    updateSyncStatus("Salvataggio…");
    const { data, error } = await state.supabase
      .from("work_days")
      .upsert(changed.map(asCloudDay), { onConflict: "user_id,work_date" })
      .select();
    if (error) {
      changed.forEach((day) => queueOperation({ op: "upsert", work_date: day.work_date, payload: asCloudDay(day) }));
      showToast("Pianificazione salvata sul dispositivo; sincronizzazione in attesa.");
      return;
    }
    data.forEach((day) => state.days.set(day.work_date, normalizeDay(day)));
    persistLocalCache();
    updateSyncStatus();
    renderCalendar();
    showToast(`${changed.length} giornate pianificate.`);
  });

  $("#previous-month").addEventListener("click", () => selectMonth("calendar", new Date(state.calendarMonth.getFullYear(), state.calendarMonth.getMonth() - 1, 1)));
  $("#next-month").addEventListener("click", () => selectMonth("calendar", new Date(state.calendarMonth.getFullYear(), state.calendarMonth.getMonth() + 1, 1)));
  ["#calendar-month-select", "#calendar-year-select"].forEach((selector) => {
    $(selector).addEventListener("change", () => selectMonth("calendar", selectedMonthFromControls("calendar", state.calendarMonth)));
  });
  $("#day-planned-type").addEventListener("change", () => toggleAbsenceFields("day"));
  $("#day-actual-type").addEventListener("change", () => toggleAbsenceFields("day"));
  $("#day-absence-type").addEventListener("change", () => toggleAbsenceFields("day"));
  $("#day-child-id").addEventListener("change", () => updateChildPolicyHint("day"));
  $("#today-child-id").addEventListener("change", () => updateChildPolicyHint("today"));
  $("#close-day-dialog").addEventListener("click", () => $("#day-dialog").close());
  $("#day-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const date = $("#day-date").value;
    const day = normalizeDay(state.days.get(date) || defaultDay(date));
    day.planned_type = $("#day-planned-type").value;
    day.actual_type = $("#day-actual-type").value || null;
    const effectiveType = day.actual_type || day.planned_type;
    day.absence_type = effectiveType === "absence" ? $("#day-absence-type").value : null;
    const absenceError = sundayHolidayRecoveryError(day.absence_type, day.work_date);
    if (absenceError) return showToast(absenceError);
    day.child_id = CHILD_LINKED_ABSENCE_TYPES.has(day.absence_type) ? $("#day-child-id").value || null : null;
    day.ticket_override = effectiveType === "absence" || $("#day-ticket").value === "auto" ? null : $("#day-ticket").value === "yes";
    day.notes = $("#day-notes").value.trim();
    if (effectiveType !== "absence") {
      try {
        day.events = eventsFromLocalTimes(date, {
          entry: $("#day-entry-time").value,
          pauseStart: $("#day-pause-start-time").value,
          pauseEnd: $("#day-pause-end-time").value,
          exit: $("#day-exit-time").value
        });
      } catch (error) {
        showToast(friendlyError(error));
        return;
      }
    } else {
      day.events = [];
    }
    await saveDay(day, { silent: true });
    $("#day-dialog").close();
    showToast("Giornata salvata.");
  });
  $("#delete-day").addEventListener("click", async () => {
    const date = $("#day-date").value;
    const before = structuredClone(state.days.get(date));
    await deleteDay(date, { silent: true });
    $("#day-dialog").close();
    showToast("Giornata eliminata.", async () => {
      await saveDay(before, { silent: true });
      showToast("Giornata ripristinata.");
    });
  });

  $("#previous-summary-month").addEventListener("click", () => selectMonth("summary", new Date(state.summaryMonth.getFullYear(), state.summaryMonth.getMonth() - 1, 1)));
  $("#next-summary-month").addEventListener("click", () => selectMonth("summary", new Date(state.summaryMonth.getFullYear(), state.summaryMonth.getMonth() + 1, 1)));
  ["#summary-month-select", "#summary-year-select"].forEach((selector) => {
    $(selector).addEventListener("change", () => selectMonth("summary", selectedMonthFromControls("summary", state.summaryMonth)));
  });

  $("#add-child").addEventListener("click", () => {
    const name = $("#child-name").value.trim();
    const birthDate = $("#child-birth-date").value;
    if (!name || !birthDate) {
      showToast("Inserisci nome e data di nascita prima di aggiungere il figlio.");
      (!name ? $("#child-name") : $("#child-birth-date")).focus();
      return;
    }
    state.profile.family_settings = {
      ...state.profile.family_settings,
      children: [...familyChildren(), { id: crypto.randomUUID(), name, birth_date: birthDate, external_usage: {} }]
    };
    $("#child-name").value = "";
    $("#child-birth-date").value = "";
    renderChildren();
    announce(`${name} aggiunto. Salva le impostazioni per confermare.`);
  });

  $("#request-notification-permission").addEventListener("click", async () => {
    if (installContext().ios && !installContext().standalone) {
      showInstallBanner({ force: true });
      return;
    }
    if (!("Notification" in window)) return renderNotificationPermissionStatus();
    const permission = await Notification.requestPermission();
    renderNotificationPermissionStatus();
    if (permission === "granted") {
      saveNotificationPreferences({ enabled: true });
      $("#exit-notification-enabled").checked = true;
      renderToday();
      showToast("Notifiche abilitate su questo dispositivo.");
    } else {
      showToast("Permesso notifiche non concesso.");
    }
  });

  $("#sunday-holiday-adjustment-year").addEventListener("change", (event) => {
    const year = clampInt(event.target.value, 2000, 2100, new Date().getFullYear());
    fillSundayHolidayAdjustmentFields(year);
    previewSundayHolidaySettings();
  });
  $("#settings-form").addEventListener("input", (event) => {
    if (event.target.matches("[name='sunday-holiday-rule'], #sunday-holiday-adjustment-days, #sunday-holiday-adjustment-reason, #local-holiday-name, #local-holiday-day, #local-holiday-month")) {
      previewSundayHolidaySettings();
    } else {
      updateSettingsSummaries();
    }
  });
  $("#settings-form").addEventListener("change", (event) => {
    if (event.target.matches("[name='sunday-holiday-rule'], #local-holiday-month")) previewSundayHolidaySettings();
    else updateSettingsSummaries();
  });

  $("#settings-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const familySettings = normalizeFamilySettings(state.profile.family_settings);
    const adjustmentYear = clampInt($("#sunday-holiday-adjustment-year").value, 2000, 2100, new Date().getFullYear());
    const adjustmentDays = clampInt($("#sunday-holiday-adjustment-days").value, -366, 366, 0);
    const adjustmentReason = $("#sunday-holiday-adjustment-reason").value.trim();
    const adjustments = { ...(familySettings.contract_settings.sunday_holiday_adjustments || {}) };
    if (adjustmentDays || adjustmentReason) adjustments[String(adjustmentYear)] = { days: adjustmentDays, reason: adjustmentReason };
    else delete adjustments[String(adjustmentYear)];
    const localHoliday = {
      name: $("#local-holiday-name").value.trim(),
      day: clampInt($("#local-holiday-day").value, 1, 31, 0),
      month: clampInt($("#local-holiday-month").value, 1, 12, 0)
    };
    if ((localHoliday.name || localHoliday.day || localHoliday.month)
      && !(localHoliday.name && localHoliday.day && localHoliday.month)) {
      showToast("Per aggiungere la festività locale, compila nome, giorno e mese.");
      return;
    }
    familySettings.contract_settings = {
      ...familySettings.contract_settings,
      sunday_holiday_rule: $("input[name='sunday-holiday-rule']:checked")?.value || "none",
      sunday_holiday_adjustments: adjustments,
      local_holiday: localHoliday.name ? localHoliday : null
    };
    familySettings.overtime_settings = {
      smart: $("#overtime-smart").checked,
      travel: $("#overtime-travel").checked
    };
    delete familySettings.contract_settings.sunday_holiday_allowance;
    saveNotificationPreferences({
      enabled: $("#exit-notification-enabled").checked && "Notification" in window && Notification.permission === "granted",
      leadMinutes: clampInt($("#exit-notification-lead").value, 0, 120, 0)
    });
    const profile = {
      id: state.user.id,
      display_name: $("#settings-name").value.trim(),
      target_minutes: clampInt($("#target-hours").value, 1, 15, 7) * 60 + clampInt($("#target-minutes").value, 0, 59, 36),
      office_break_minutes: clampInt($("#office-break").value, 0, 240, 30),
      smart_break_minutes: clampInt($("#smart-break").value, 0, 240, 60),
      travel_break_minutes: clampInt($("#travel-break").value, 0, 240, 30),
      overtime_threshold: clampInt($("#overtime-threshold").value, 0, 240, 10),
      ticket_office: $("#ticket-office").checked,
      ticket_smart: $("#ticket-smart").checked,
      ticket_travel: $("#ticket-travel").checked,
      timezone: "Europe/Rome",
      family_settings: familySettings
    };
    const submitButton = event.currentTarget.querySelector("button[type='submit']");
    const submitLabel = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = "Salvataggio…";
    updateSyncStatus("Salvataggio…");
    const { data, error } = await state.supabase.from("profiles").upsert(profile).select().single();
    submitButton.disabled = false;
    submitButton.textContent = submitLabel;
    if (error) {
      updateSyncStatus();
      return showToast(`Impostazioni non salvate: ${friendlyError(error)}`);
    }
    state.profile = { ...DEFAULT_PROFILE, ...data, family_settings: normalizeFamilySettings(data.family_settings) };
    renderAccount();
    renderToday();
    renderSettings();
    if (!$("#summary-screen").hidden) renderSummary();
    renderNotificationPermissionStatus();
    updateSyncStatus();
    showToast("Impostazioni salvate.");
  });

  $("#password-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const password = $("#new-password").value;
    const { error } = await state.supabase.auth.updateUser({ password });
    if (error) return showToast(`Password non aggiornata: ${friendlyError(error)}`);
    event.currentTarget.reset();
    showToast("Password aggiornata. Usala dal prossimo accesso.");
  });

  $("#export-data").addEventListener("click", async () => {
    const { data, error } = await state.supabase.from("work_days").select("*").order("work_date");
    if (error) return showToast(`Backup non creato: ${friendlyError(error)}`);
    const backup = { version: 2, exported_at: new Date().toISOString(), profile: state.profile, days: data || [] };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `chrono-flow-backup-${isoDateLocal()}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast("Backup scaricato.");
  });

  $("#import-data").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const backup = JSON.parse(await file.text());
      if (!Array.isArray(backup.days)) throw new Error("Il file non contiene un elenco di giornate valido.");
      const normalizedDays = backup.days
        .map((day) => normalizeDay({ ...day, work_date: day.work_date || day.date }))
        .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day.work_date || ""));
      if (backup.days.length && !normalizedDays.length) {
        throw new Error("Le giornate nel file non contengono date riconoscibili.");
      }
      const payload = normalizedDays.map((day) => asCloudDay(day));
      if (payload.length) {
        const { data, error } = await state.supabase.from("work_days").upsert(payload, { onConflict: "user_id,work_date" }).select();
        if (error) throw error;
        data.forEach((day) => state.days.set(day.work_date, normalizeDay(day)));
        data.forEach((day) => syncSummaryYearDay(day));
        data.forEach((day) => syncSundayHolidayRecoveryUsage(normalizeDay(day)));
        persistLocalCache();
      }
      renderCurrentViews();
      showToast(`${payload.length} giornate importate o aggiornate.`);
    } catch (error) {
      showToast(`Importazione non riuscita: ${friendlyError(error)}`);
    } finally {
      event.target.value = "";
    }
  });

  window.addEventListener("online", () => flushQueue());
  window.addEventListener("offline", () => updateSyncStatus());
}

initialize();
