import {
  ABSENCE_TYPES,
  CHILD_LINKED_ABSENCE_TYPES,
  DAY_TYPES,
  annualLeaveBalance,
  breakForType,
  calculateDayWithPolicies,
  childSicknessEntitlement,
  childSicknessPeriodsForYear,
  reconcileChildSicknessDays,
  canUseSundayHolidayRecovery,
  clampInt,
  eventsFromLocalTimes,
  exitNotificationTime,
  baselineTicketForDay,
  forecastExit,
  formatTime,
  holidayRecoveryBalance,
  isSuppressedHolidayDay,
  isWorkingSaturday,
  isoDateLocal,
  minutesToDuration,
  maternityMandatoryEntitlement,
  parentalLeaveMonitoringQuota,
  paternityMandatoryEntitlement,
  referenceYearForDate,
  recognizedItalianHolidays,
  secondsToDuration,
  SUNDAY_HOLIDAY_RULES,
  ticketForDay,
  workbookMonthlySummary
} from "./calculations.mjs";
import { createLiveClock } from "./live-clock.mjs";
import { applyHomeModePresentation } from "./home-display.mjs";
import { clearMigratedLegacyData, detectLegacyData } from "./migration.mjs";
import {
  installBannerKind,
  isInstallDismissalActive,
  isIosDevice,
  isStandaloneMode
} from "./pwa-install.mjs";
import { supabase, hasSupabaseConfig } from "./supabase-client.v3.0.3.mjs";
import {
  formatAutomaticExitTime,
  reconcileSmartAutomaticExit,
  smartAutomaticExitAt,
  smartAutomaticExitEnabled
} from "./smart-auto-exit.mjs";
import {
  buildAllocationDurations,
  equalPercentages,
  minutesToHoursInput,
  searchProjects,
  splitEvenMinutes
} from "./project-allocation-policy.mjs";
import {
  applyHomeModeToDay,
  dayHasRecordedActivity,
  effectiveDayMode,
  homeModeForToday,
  mayReplaceTodayFromCloud
} from "./day-source-of-truth.mjs";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const configured = hasSupabaseConfig();

const DEFAULT_PROFILE = {
  display_name: "",
  target_minutes: 456,
  office_break_minutes: 30,
  smart_break_minutes: 60,
  travel_break_minutes: 30,
  overtime_threshold: 10,
  ticket_office: true,
  ticket_smart: true,
  ticket_travel: true,
  timezone: "Europe/Rome",
  family_settings: {
    children: [],
    parental_role: "unspecified",
    show_paternity_alternative: false,
    work_modes: { office: true, smart: true, travel: true, saturday: true },
    absence_features: { vacation: true, sickness: false, marriage_leave: false, recovery: false },
    summary_preferences: { show_distribution: true, show_annual_table: false },
    overtime_settings: {
      smart: false,
      travel: false
    },
    projects_enabled: false,
    default_project_id: null,
    contract_settings: {
      sunday_holiday_rule: "none",
      sunday_holiday_adjustments: {},
      local_holiday: null,
      leave_settings: {
        default_vacation_days: 20,
        default_suppressed_holiday_days: 4,
        years: {}
      }
    }
  }
};

const state = {
  supabase: null,
  user: null,
  profile: structuredClone(DEFAULT_PROFILE),
  days: new Map(),
  projects: new Map(),
  allocations: new Map(),
  projectDataLoaded: false,
  projectDataLoading: false,
  editingAllocationId: null,
  allocationSelectedProjects: new Set(),
  allocationManualHours: new Map(),
  todayRefreshPromise: null,
  authMode: "login",
  calendarMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  summaryMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  summaryYearDays: [],
  summaryPreviousYearDays: [],
  summaryYearLoaded: null,
  summaryYearLoading: false,
  childSicknessDays: [],
  sundayHolidayRecoveryDays: [],
  legacyMigration: null,
  classificationGroup: null,
  settingsReferenceYear: referenceYearForDate(),
  toastTimer: null,
  notificationTimer: null,
  notificationTarget: null,
  deferredInstallPrompt: null,
  undo: null,
  busy: false,
  autoExitSaving: false,
  calendarScope: "mine",
  calendarSharingService: null,
  calendarSharingView: null,
  calendarSharingLoading: null,
  calendarSharingSettingsView: null,
  calendarSharingSettingsLoading: null
};

const homeClock = createLiveClock({ tick: renderTodayTick, intervalMs: 1000 });

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

function normalizeLeaveSettings(value) {
  const input = value && typeof value === "object" ? value : {};
  const years = {};
  for (const [year, annual] of Object.entries(input.years || {})) {
    if (!/^\d{4}$/.test(year) || !annual || typeof annual !== "object") continue;
    const carryover = annual.carryover_override;
    years[year] = {
      vacation_days: clampInt(annual.vacation_days, 0, 366, 20),
      suppressed_holiday_days: clampInt(annual.suppressed_holiday_days, 0, 366, 4),
      carryover_override: carryover === null || carryover === undefined || carryover === ""
        ? null
        : clampInt(carryover, 0, 366, 0)
    };
  }
  return {
    default_vacation_days: clampInt(input.default_vacation_days, 0, 366, 20),
    default_suppressed_holiday_days: clampInt(input.default_suppressed_holiday_days, 0, 366, 4),
    years
  };
}

function normalizeChildSettings(child) {
  const input = child && typeof child === "object" ? child : {};
  const quota = Number(input.parental_leave_quota_months);
  return {
    ...input,
    parental_leave_quota_months: Number.isFinite(quota) && quota > 0 ? quota : null,
    parental_leave_single_parent: input.parental_leave_single_parent === true,
    parental_leave_father_three_months: input.parental_leave_father_three_months === true,
    parental_leave_other_parent_three_months: input.parental_leave_other_parent_three_months === true,
    parental_leave_other_parent_months: Math.max(0, Number(input.parental_leave_other_parent_months) || 0)
  };
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
    adjustments[currentYear] = { days: legacyAllowance, reason: "Saldo riportato dalla configurazione precedente" };
  }
  return {
    ...input,
    children: Array.isArray(input.children) ? input.children.map(normalizeChildSettings) : [],
    parental_role: ["father", "mother", "custom"].includes(input.parental_role) ? input.parental_role : "unspecified",
    show_paternity_alternative: input.show_paternity_alternative === true,
    work_modes: {
      office: input.work_modes?.office !== false,
      smart: input.work_modes?.smart !== false,
      travel: input.work_modes?.travel !== false,
      saturday: input.work_modes?.saturday !== false
    },
    absence_features: {
      vacation: input.absence_features?.vacation !== false,
      sickness: input.absence_features?.sickness === true,
      marriage_leave: input.absence_features?.marriage_leave === true,
      recovery: input.absence_features?.recovery === true
    },
    summary_preferences: {
      show_distribution: input.summary_preferences?.show_distribution !== false,
      show_annual_table: input.summary_preferences?.show_annual_table === true
    },
    overtime_settings: {
      smart: input.overtime_settings?.smart === true,
      travel: input.overtime_settings?.travel === true
    },
    projects_enabled: input.projects_enabled === true,
    default_project_id: typeof input.default_project_id === "string" ? input.default_project_id : null,
    contract_settings: {
      ...contractInput,
      sunday_holiday_rule: normalizedRule,
      sunday_holiday_adjustments: adjustments,
      local_holiday: contractInput.local_holiday || null,
      leave_settings: normalizeLeaveSettings(contractInput.leave_settings)
    }
  };
}

function familyChildren() {
  return Array.isArray(state.profile.family_settings?.children)
    ? state.profile.family_settings.children
    : [];
}

function parentalRole() {
  const role = normalizeFamilySettings(state.profile.family_settings).parental_role;
  return ["father", "mother", "custom"].includes(role) ? role : "unspecified";
}

function applicabilitySettings() {
  return normalizeFamilySettings(state.profile.family_settings);
}

function workModeEnabled(type) {
  const modes = applicabilitySettings().work_modes;
  return type === "office" ? modes.office : type === "smart" ? modes.smart : type === "travel" ? modes.travel : true;
}

function projectsEnabled() {
  return normalizeFamilySettings(state.profile.family_settings).projects_enabled === true;
}

function projectCacheKey() {
  return `chrono-flow:v3:projects:${state.user?.id || "anonymous"}`;
}

function projectQueueKey() {
  return `chrono-flow:v3:project-queue:${state.user?.id || "anonymous"}`;
}

function normalizeProject(project) {
  return {
    id: project.id,
    user_id: project.user_id || state.user?.id || null,
    code: String(project.code || "").trim(),
    description: String(project.description || "").trim(),
    is_active: project.is_active !== false,
    created_at: project.created_at || new Date().toISOString(),
    updated_at: project.updated_at || new Date().toISOString()
  };
}

function normalizeAllocation(allocation) {
  return {
    id: allocation.id,
    user_id: allocation.user_id || state.user?.id || null,
    project_id: allocation.project_id,
    work_date: allocation.work_date,
    start_time: allocation.start_time ? String(allocation.start_time).slice(0, 5) : null,
    end_time: allocation.end_time ? String(allocation.end_time).slice(0, 5) : null,
    duration_minutes: Math.max(1, Number(allocation.duration_minutes) || 0),
    allocation_method: allocation.allocation_method === "automatic" ? "automatic" : "hours",
    note: String(allocation.note || "").trim(),
    created_at: allocation.created_at || new Date().toISOString(),
    updated_at: allocation.updated_at || new Date().toISOString()
  };
}

function allAllocations() {
  return [...state.allocations.values()].flat();
}

function allocationsForDate(date) {
  return [...(state.allocations.get(date) || [])].sort((left, right) => {
    if (left.start_time && right.start_time) return left.start_time.localeCompare(right.start_time);
    if (left.start_time) return -1;
    if (right.start_time) return 1;
    return String(left.created_at || left.id).localeCompare(String(right.created_at || right.id));
  });
}

function setAllocationInState(allocation) {
  const normalized = normalizeAllocation(allocation);
  const rows = (state.allocations.get(normalized.work_date) || []).filter((item) => item.id !== normalized.id);
  rows.push(normalized);
  state.allocations.set(normalized.work_date, rows);
  return normalized;
}

function removeAllocationFromState(id, date = null) {
  const dates = date ? [date] : [...state.allocations.keys()];
  for (const key of dates) {
    const rows = (state.allocations.get(key) || []).filter((item) => item.id !== id);
    if (rows.length) state.allocations.set(key, rows);
    else state.allocations.delete(key);
  }
}

function persistProjectCache() {
  if (!state.user) return;
  localStorage.setItem(projectCacheKey(), JSON.stringify({
    projects: [...state.projects.values()],
    allocations: allAllocations()
  }));
}

function loadProjectCache() {
  if (!state.user) return;
  try {
    const cached = JSON.parse(localStorage.getItem(projectCacheKey()) || "{}");
    if (Array.isArray(cached.projects)) cached.projects.forEach((project) => state.projects.set(project.id, normalizeProject(project)));
    if (Array.isArray(cached.allocations)) cached.allocations.forEach(setAllocationInState);
  } catch {
    localStorage.removeItem(projectCacheKey());
  }
}

function getProjectQueue() {
  try {
    const queue = JSON.parse(localStorage.getItem(projectQueueKey()) || "[]");
    return Array.isArray(queue) ? queue : [];
  } catch {
    return [];
  }
}

function setProjectQueue(queue) {
  localStorage.setItem(projectQueueKey(), JSON.stringify(queue));
  updateSyncStatus();
}

function queueProjectOperation(operation) {
  const key = `${operation.entity}:${operation.id}`;
  const queue = getProjectQueue().filter((item) => `${item.entity}:${item.id}` !== key);
  queue.push(operation);
  setProjectQueue(queue);
}

function projectLabel(project) {
  if (!project) return "Commessa non disponibile";
  return `${project.code} · ${project.description}`;
}

function allocationMinutesForDate(date) {
  return allocationsForDate(date).reduce((total, allocation) => total + allocation.duration_minutes, 0);
}

function workedMinutesForDate(date) {
  const day = state.days.get(date);
  if (!day) return 0;
  return calculateTrackedDay(day, calculationNow(day)).ordinaryWorkedMinutes;
}

async function recalculateAutomaticAllocationsForDay(date) {
  const allocations = allocationsForDate(date);
  const automatic = allocations.filter((item) => item.allocation_method === "automatic");
  if (!automatic.length) return allocations;
  const workedMinutes = workedMinutesForDate(date);
  if (!workedMinutes) return allocations;
  const durations = splitEvenMinutes(workedMinutes, automatic.length);
  const next = allocations.map((item) => {
    if (item.allocation_method !== "automatic") return item;
    const index = automatic.findIndex((candidate) => candidate.id === item.id);
    return { ...item, duration_minutes: durations[index] };
  });
  await replaceDayAllocations(date, next);
  return next;
}

function preferredProjectId() {
  const settings = normalizeFamilySettings(state.profile.family_settings);
  const defaultProject = state.projects.get(settings.default_project_id);
  if (defaultProject?.is_active) return defaultProject.id;
  return recentProjectIds().find((id) => state.projects.get(id)?.is_active) || "";
}

function recentProjectIds(limit = 4) {
  const latest = new Map();
  for (const allocation of allAllocations()) {
    const stamp = `${allocation.work_date}T${allocation.start_time || "23:59"}`;
    if (!latest.has(allocation.project_id) || latest.get(allocation.project_id) < stamp) latest.set(allocation.project_id, stamp);
  }
  return [...latest.entries()].sort((a, b) => b[1].localeCompare(a[1])).slice(0, limit).map(([id]) => id);
}

function setProjectFeatureVisibility() {
  const enabled = projectsEnabled();
  $$('[data-project-feature]').forEach((element) => { element.hidden = !enabled; });
  const settingsContent = $("#project-settings-content");
  if (settingsContent) settingsContent.hidden = !$("#projects-enabled")?.checked;
  return enabled;
}

async function fetchProjectData({ start = null, end = null, includeProjects = true, force = false } = {}) {
  if ((!projectsEnabled() && !force) || !state.supabase || state.projectDataLoading) return;
  state.projectDataLoading = true;
  try {
    if (includeProjects) {
      const projectResult = await state.supabase.from("work_projects").select("*").order("is_active", { ascending: false }).order("code");
      if (projectResult.error) throw projectResult.error;
      state.projects.clear();
      (projectResult.data || []).forEach((project) => state.projects.set(project.id, normalizeProject(project)));
    }
    let query = state.supabase.from("work_allocations").select("*").order("work_date").order("start_time");
    if (start) query = query.gte("work_date", start);
    if (end) query = query.lte("work_date", end);
    const allocationResult = await query;
    if (allocationResult.error) throw allocationResult.error;
    if (start && end) {
      for (const date of [...state.allocations.keys()]) {
        if (date >= start && date <= end) state.allocations.delete(date);
      }
    } else {
      state.allocations.clear();
    }
    (allocationResult.data || []).forEach(setAllocationInState);
    state.projectDataLoaded = true;
    persistProjectCache();
  } finally {
    state.projectDataLoading = false;
  }
}

async function fetchProjectRangeForMonth(date, options = {}) {
  if (!projectsEnabled()) return;
  const { start, end } = monthBounds(date);
  await fetchProjectData({ start, end, includeProjects: options.includeProjects !== false });
}

async function flushProjectQueue() {
  if (!navigator.onLine || !state.supabase || !state.user || !projectsEnabled()) return;
  const queue = getProjectQueue();
  if (!queue.length) return;
  const remaining = [];
  for (const operation of queue) {
    try {
      let result;
      if (operation.entity === "project") {
        result = operation.op === "delete"
          ? await state.supabase.from("work_projects").delete().eq("id", operation.id).eq("user_id", state.user.id)
          : await state.supabase.from("work_projects").upsert(operation.payload, { onConflict: "id" });
      } else {
        result = operation.op === "delete"
          ? await state.supabase.from("work_allocations").delete().eq("id", operation.id).eq("user_id", state.user.id)
          : await state.supabase.from("work_allocations").upsert(operation.payload, { onConflict: "id" });
      }
      if (result.error) remaining.push(operation);
    } catch {
      remaining.push(operation);
    }
  }
  setProjectQueue(remaining);
  if (!remaining.length) fetchProjectData().then(renderCurrentViews).catch(() => {});
}

function childInstitutes(child) {
  const existing = child?.institutes && typeof child.institutes === "object" ? child.institutes : {};
  const role = parentalRole();
  return {
    child_sickness: existing.child_sickness !== false,
    parental_leave: existing.parental_leave === true,
    maternity_leave: existing.maternity_leave === true || (!child?.institutes && role === "mother"),
    paternity_mandatory: existing.paternity_mandatory === true || (!child?.institutes && role === "father"),
    paternity_alternative: existing.paternity_alternative === true
  };
}

function childInstituteEnabled(child, type) {
  return childInstitutes(child)[type] === true;
}

function parentalQuotaForChild(child) {
  return parentalLeaveMonitoringQuota({
    role: parentalRole(),
    requestedMonths: child?.parental_leave_quota_months,
    singleParent: child?.parental_leave_single_parent === true,
    fatherAtLeastThreeMonths: child?.parental_leave_father_three_months === true,
    otherParentAtLeastThreeMonths: child?.parental_leave_other_parent_three_months === true,
    otherParentMonths: child?.parental_leave_other_parent_months
  });
}

function absenceFeatureEnabled(type) {
  const settings = applicabilitySettings();
  if (type === "vacation" || type === "holiday" || type === "sunday_holiday_recovery") return true;
  if (["child_sickness", "parental_leave", "maternity_leave", "paternity_mandatory", "paternity_alternative"].includes(type)) {
    return familyChildren().some((child) => childInstituteEnabled(child, type));
  }
  return settings.absence_features?.[type] === true;
}

function summaryPreferences() {
  return applicabilitySettings().summary_preferences;
}

function paternityAlternativeEnabled() {
  return applicabilitySettings().show_paternity_alternative === true
    || familyChildren().some((child) => childInstituteEnabled(child, "paternity_alternative"));
}

function hasAbsenceUsage(days, type) {
  return days.some((day) => (day.actual_type || day.planned_type) === "absence" && day.absence_type === type);
}

function roleAllowsAbsenceType(type, days = state.summaryYearDays) {
  const role = parentalRole();
  const used = hasAbsenceUsage(days, type);
  const configured = familyChildren().some((child) => childInstituteEnabled(child, type));
  if (type === "maternity_leave") return used || ((role === "mother" || role === "custom") && configured);
  if (type === "paternity_mandatory") return used || ((role === "father" || role === "custom") && configured);
  if (type === "paternity_alternative") {
    return used || ((role === "father" || role === "custom") && (paternityAlternativeEnabled() || configured));
  }
  return configured || used || !["child_sickness", "parental_leave"].includes(type);
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
  return calculateDayWithPolicies(
    day.events,
    state.profile.target_minutes,
    state.profile.overtime_threshold,
    effectiveType,
    overtimeSettings(),
    breakForType(state.profile, effectiveType),
    now
  );
}

function smartAutoExitPolicy(day, now = new Date()) {
  const effectiveType = day.actual_type || day.planned_type || "office";
  const automatic = smartAutomaticExitEnabled(effectiveType, overtimeSettings());
  const autoExitAt = automatic
    ? smartAutomaticExitAt({
      events: day.events,
      targetMinutes: state.profile.target_minutes,
      standardBreakMinutes: breakForType(state.profile, effectiveType),
      now
    })
    : null;
  return { automatic, autoExitAt };
}

function reconcileDayAutomaticExit(day, now = new Date()) {
  const effectiveType = day.actual_type || day.planned_type || "office";
  return reconcileSmartAutomaticExit(day, {
    overtimeSettings: overtimeSettings(),
    targetMinutes: state.profile.target_minutes,
    standardBreakMinutes: breakForType(state.profile, effectiveType),
    now
  });
}

async function closeSmartDayWhenDue(day, now = new Date()) {
  if (state.autoExitSaving || !state.user) return false;
  const reconciled = reconcileDayAutomaticExit(day, now);
  if (!reconciled.changed || !reconciled.closed) return false;
  state.autoExitSaving = true;
  try {
    await saveDay(reconciled.day, { silent: true, skipAutoExitReconcile: true });
    showToast(`Giornata Smart conclusa automaticamente alle ${formatAutomaticExitTime(reconciled.autoExitAt)}.`);
    return true;
  } finally {
    state.autoExitSaving = false;
  }
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
    const count = getQueue().length + getProjectQueue().length;
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
  const currentYear = referenceYearForDate();
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
    await Promise.all([
      fetchMonth(normalized),
      fetchProjectRangeForMonth(normalized, { includeProjects: !state.projectDataLoaded })
    ]).catch((error) => showToast(`Mese non caricato: ${friendlyError(error)}`));
    renderCalendar();
    return;
  }
  state.summaryMonth = normalized;
  renderMonthSelector("summary", normalized);
  await Promise.all([
    fetchMonth(normalized),
    fetchSummaryYear(normalized.getFullYear()),
    projectsEnabled() ? fetchProjectData({
      start: `${normalized.getFullYear()}-01-01`,
      end: `${normalized.getFullYear()}-12-31`,
      includeProjects: !state.projectDataLoaded
    }) : Promise.resolve()
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
    .in("absence_type", [
      "child_sickness", "parental_leave", "maternity_leave", "paternity_mandatory",
      "paternity_alternative", "mandatory_leave", "leave"
    ])
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

function syncChildLinkedUsage(day) {
  state.childSicknessDays = state.childSicknessDays.filter((item) => item.work_date !== day.work_date);
  const effectiveType = day.actual_type || day.planned_type;
  if (effectiveType === "absence" && [
    "child_sickness", "parental_leave", "maternity_leave", "paternity_mandatory",
    "paternity_alternative", "mandatory_leave", "leave"
  ].includes(day.absence_type)) {
    state.childSicknessDays.push({
      work_date: day.work_date,
      child_id: day.child_id || null,
      absence_type: day.absence_type,
      planned_type: day.planned_type,
      actual_type: day.actual_type
    });
  }
}

function sundayHolidayContract() {
  return normalizeFamilySettings(state.profile.family_settings).contract_settings;
}

function annualLeaveSettings(contractOverride = null) {
  return normalizeLeaveSettings((contractOverride || sundayHolidayContract()).leave_settings);
}

function annualLeaveBalanceForYear(year, settingsOverride = null) {
  return annualLeaveBalance({
    year,
    days: [...state.summaryPreviousYearDays, ...state.summaryYearDays],
    settings: settingsOverride || annualLeaveSettings(),
    localHoliday: sundayHolidayContract().local_holiday
  });
}

async function refreshTodayFromCloud({ render = true } = {}) {
  if (!state.user || !state.supabase || !navigator.onLine) return state.days.get(isoDateLocal()) || null;
  if (state.todayRefreshPromise) return state.todayRefreshPromise;
  const date = isoDateLocal();
  const pendingDates = new Set(getQueue().map((operation) => operation.work_date));
  if (!mayReplaceTodayFromCloud(pendingDates, date)) return state.days.get(date) || null;
  state.todayRefreshPromise = (async () => {
    const { data, error } = await state.supabase
      .from("work_days")
      .select("*")
      .eq("user_id", state.user.id)
      .eq("work_date", date)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      const normalized = normalizeDay(data);
      state.days.set(date, normalized);
      syncSummaryYearDay(normalized);
    } else {
      state.days.delete(date);
    }
    persistLocalCache();
    if (render && state.user) renderCurrentViews();
    return data ? state.days.get(date) : null;
  })().finally(() => { state.todayRefreshPromise = null; });
  return state.todayRefreshPromise;
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
  const { start: previousStart, end: previousEnd } = yearBounds(year - 1);
  try {
    const { data, error } = await state.supabase
      .from("work_days")
      .select("*")
      .gte("work_date", previousStart)
      .lte("work_date", end)
      .order("work_date");
    if (error) throw error;
    const pendingDates = new Set(getQueue().map((operation) => operation.work_date));
    const remoteDays = (data || []).map(normalizeDay).filter((day) => !pendingDates.has(day.work_date));
    const pendingDays = [...state.days.values()].filter((day) => day.work_date >= previousStart && day.work_date <= end && pendingDates.has(day.work_date));
    const combinedDays = [...remoteDays, ...pendingDays];
    state.summaryPreviousYearDays = combinedDays.filter((day) => day.work_date >= previousStart && day.work_date <= previousEnd);
    state.summaryYearDays = combinedDays.filter((day) => day.work_date >= start && day.work_date <= end);
    for (const workDate of [...state.days.keys()]) {
      if (workDate >= start && workDate <= end && !pendingDates.has(workDate)) state.days.delete(workDate);
    }
    remoteDays.forEach((day) => state.days.set(day.work_date, day));
    state.summaryYearLoaded = year;
    persistLocalCache();
  } catch (error) {
    const cached = [...state.days.values()].filter((day) => day.work_date >= previousStart && day.work_date <= end);
    if (!cached.some((day) => day.work_date >= start)) throw error;
    state.summaryPreviousYearDays = cached.filter((day) => day.work_date <= previousEnd);
    state.summaryYearDays = cached.filter((day) => day.work_date >= start);
    state.summaryYearLoaded = year;
    updateSyncStatus("Offline · riepilogo dai dati salvati");
  } finally {
    state.summaryYearLoading = false;
  }
}

function syncSummaryYearDay(day) {
  const dayYear = Number(day.work_date.slice(0, 4));
  if (state.summaryYearLoaded === dayYear) {
    state.summaryYearDays = state.summaryYearDays.filter((item) => item.work_date !== day.work_date);
    state.summaryYearDays.push(normalizeDay(day));
  } else if (state.summaryYearLoaded === dayYear + 1) {
    state.summaryPreviousYearDays = state.summaryPreviousYearDays.filter((item) => item.work_date !== day.work_date);
    state.summaryPreviousYearDays.push(normalizeDay(day));
  }
}

async function saveDay(day, { silent = false, skipAutoExitReconcile = false } = {}) {
  let normalized = normalizeDay(day);
  if (!skipAutoExitReconcile) normalized = normalizeDay(reconcileDayAutomaticExit(normalized).day);
  state.days.set(normalized.work_date, normalized);
  syncSummaryYearDay(normalized);
  syncSundayHolidayRecoveryUsage(normalized);
  syncChildLinkedUsage(normalized);
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

  const saved = normalizeDay(data);
  state.days.set(saved.work_date, saved);
  syncSummaryYearDay(saved);
  syncChildLinkedUsage(saved);
  persistLocalCache();
  updateSyncStatus();
  syncProjectionForDay(saved).catch((error) => console.warn("[Chrono Flow] proiezione calendario non aggiornata", error));
  return data;
}

async function deleteDay(date, { silent = false } = {}) {
  const linkedAllocations = projectsEnabled() ? allocationsForDate(date) : [];
  state.days.delete(date);
  if (linkedAllocations.length) state.allocations.delete(date);
  if (state.summaryYearLoaded === Number(date.slice(0, 4))) {
    state.summaryYearDays = state.summaryYearDays.filter((item) => item.work_date !== date);
  } else if (state.summaryYearLoaded === Number(date.slice(0, 4)) + 1) {
    state.summaryPreviousYearDays = state.summaryPreviousYearDays.filter((item) => item.work_date !== date);
  }
  state.sundayHolidayRecoveryDays = state.sundayHolidayRecoveryDays.filter((item) => item.work_date !== date);
  state.childSicknessDays = state.childSicknessDays.filter((item) => item.work_date !== date);
  persistLocalCache();
  renderCurrentViews();

  if (!navigator.onLine) {
    queueOperation({ op: "delete", work_date: date });
    linkedAllocations.forEach((allocation) => queueProjectOperation({ entity: "allocation", op: "delete", id: allocation.id }));
    persistProjectCache();
    if (!silent) showToast("Eliminata sul dispositivo. La modifica verrà sincronizzata online.");
    return;
  }

  const { error } = await state.supabase.from("work_days").delete().eq("user_id", state.user.id).eq("work_date", date);
  if (error) queueOperation({ op: "delete", work_date: date });
  else deleteProjectionForDay(date).catch((caught) => console.warn("[Chrono Flow] proiezione calendario non eliminata", caught));
  if (linkedAllocations.length) {
    const allocationResult = await state.supabase.from("work_allocations").delete().eq("user_id", state.user.id).eq("work_date", date);
    if (allocationResult.error) linkedAllocations.forEach((allocation) => queueProjectOperation({ entity: "allocation", op: "delete", id: allocation.id }));
    persistProjectCache();
  }
  updateSyncStatus();
}

async function calendarSharingService() {
  if (state.calendarSharingService) return state.calendarSharingService;
  const { CalendarSharingService } = await import("./calendar-sharing.v3.0.5.mjs");
  state.calendarSharingService = new CalendarSharingService(state.supabase);
  await state.calendarSharingService.ensurePersonalSpace();
  return state.calendarSharingService;
}

function projectionForDay(day) {
  const normalized = normalizeDay(day);
  const effectiveType = normalized.actual_type || normalized.planned_type || "office";
  const result = calculateTrackedDay(normalized, calculationNow(normalized));
  return {
    work_date: normalized.work_date,
    mode: effectiveType === "absence" ? null : effectiveType,
    is_absent: effectiveType === "absence",
    generic_absence_label: effectiveType === "absence" ? "Assente" : null,
    clock_in: result.firstEntry ? formatTime(result.firstEntry) : null,
    clock_out: result.lastExit ? formatTime(result.lastExit) : null,
    overtime_minutes: result.overtimeMinutes,
    meal_voucher: ticketForDay(state.profile, normalized),
    leave_balance_days: null,
    absence_type: normalized.absence_type,
    personal_notes: normalized.notes || null,
    children_info: normalized.child_id ? { child_id: normalized.child_id } : null
  };
}

async function syncProjectionForDay(day) {
  if (!state.calendarSharingService || !navigator.onLine) return;
  await state.calendarSharingService.upsertProjection([projectionForDay(day)]);
}

async function deleteProjectionForDay(date) {
  if (!state.calendarSharingService || !navigator.onLine) return;
  await state.calendarSharingService.deleteProjection(date, date);
}

async function syncLoadedCalendarProjection() {
  if (!navigator.onLine) return;
  const service = await calendarSharingService();
  const entries = [...state.days.values()].map(projectionForDay);
  if (entries.length) await service.upsertProjection(entries);
}

async function ensureCalendarSharingView(section = "shared") {
  if (state.calendarSharingView) {
    await state.calendarSharingView.setSection(section);
    return state.calendarSharingView;
  }
  if (state.calendarSharingLoading) return state.calendarSharingLoading;
  const root = $("#calendar-sharing-root");
  root.innerHTML = '<div class="empty-state compact" role="status" aria-busy="true"><p>Caricamento calendari condivisi…</p></div>';
  state.calendarSharingLoading = (async () => {
    const [{ CalendarSharingView }, service] = await Promise.all([
      import("./calendar-sharing-view.v3.0.5.mjs"),
      calendarSharingService()
    ]);
    await syncLoadedCalendarProjection();
    const view = new CalendarSharingView(root, service, {
      includeMine: false,
      initialSection: section,
      allowSettings: false,
      readOnly: true,
      announce: (message, kind) => showToast(message, null, kind === "error")
    });
    state.calendarSharingView = view;
    await view.init();
    return view;
  })().catch((error) => {
    console.error("[Chrono Flow] calendario condiviso", error);
    root.innerHTML = '<section class="empty-state" role="alert"><h2>Calendari condivisi non disponibili</h2><p>Il calendario personale continua a funzionare. Riprova più tardi.</p><button class="button secondary" type="button" data-calendar-retry>Riprova</button></section>';
    throw error;
  }).finally(() => { state.calendarSharingLoading = null; });
  return state.calendarSharingLoading;
}

async function ensureCalendarSharingSettingsView() {
  if (state.calendarSharingSettingsView) return state.calendarSharingSettingsView;
  if (state.calendarSharingSettingsLoading) return state.calendarSharingSettingsLoading;
  const root = $("#calendar-sharing-settings-root");
  root.innerHTML = '<p class="calendar-status" role="status" aria-busy="true">Caricamento impostazioni di condivisione…</p>';
  state.calendarSharingSettingsLoading = (async () => {
    const [{ CalendarSharingView }, service] = await Promise.all([
      import("./calendar-sharing-view.v3.0.5.mjs"),
      calendarSharingService()
    ]);
    const view = new CalendarSharingView(root, service, {
      includeMine: false,
      initialSection: "settings",
      allowSettings: true,
      embeddedSettings: true,
      announce: (message, kind) => showToast(message, null, kind === "error"),
      onUpdate: (sharingState) => {
        const dashboard = sharingState.dashboard || {};
        const active = dashboard.space?.is_enabled === true;
        const members = Array.isArray(dashboard.members) ? dashboard.members.length : 0;
        const pending = Array.isArray(dashboard.invitations)
          ? dashboard.invitations.filter((item) => item?.status === "pending").length
          : 0;
        setSettingsSummary("calendar-sharing-settings-summary", `${active ? "Condivisione attiva" : "Condivisione non attiva"} · ${members} access${members === 1 ? "o" : "i"} · ${pending} invit${pending === 1 ? "o" : "i"} in attesa`);
      }
    });
    state.calendarSharingSettingsView = view;
    await view.init();
    return view;
  })().catch((error) => {
    console.error("[Chrono Flow] impostazioni condivisione", error);
    root.innerHTML = '<div class="notice-card" role="alert"><strong>Condivisione non disponibile</strong><p>Le altre impostazioni restano utilizzabili. Riprova più tardi.</p></div>';
    throw error;
  }).finally(() => { state.calendarSharingSettingsLoading = null; });
  return state.calendarSharingSettingsLoading;
}

async function setCalendarScope(scope, { section = "shared" } = {}) {
  const selected = scope === "shared" ? "shared" : "mine";
  state.calendarScope = selected;
  const mine = $("#calendar-personal-panel");
  const shared = $("#calendar-shared-panel");
  mine.hidden = selected !== "mine";
  shared.hidden = selected !== "shared";
  $$('[data-calendar-scope]').forEach((button) => {
    const active = button.dataset.calendarScope === selected;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  if (selected === "mine") {
    renderCalendar();
    return;
  }
  await ensureCalendarSharingView(section);
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
  const scope = select.id.startsWith("today-") ? "today" : "day";
  const absenceType = $(`#${scope}-absence-type`)?.value;
  const children = familyChildren().filter((child) => !absenceType
    || child.id === selectedValue
    || childInstituteEnabled(child, absenceType)
    || childAbsenceCount(child.id, absenceType) > 0);
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
  const source = absenceType === "child_sickness"
    ? reconcileChildSicknessDays(state.childSicknessDays, familyChildren())
    : state.childSicknessDays;
  return source.filter((day) => {
    const effectiveType = day.actual_type || day.planned_type;
    return effectiveType === "absence"
      && day.child_id === childId
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
  const workDate = scope === "day" ? $("#day-date").value : isoDateLocal();
  if (absenceType === "paternity_mandatory") {
    const used = childAbsenceCount(child.id, "paternity_mandatory");
    const entitlement = paternityMandatoryEntitlement(child, workDate, used);
    hint.textContent = `${entitlement.usedDays}/${entitlement.totalDays} giorni utilizzati · ${entitlement.remainingDays} residui · finestra ${entitlement.windowStart}–${entitlement.windowEnd} · ${entitlement.status === "expired" ? "scaduto" : entitlement.status === "upcoming" ? "non ancora attivo" : "attivo"}.`;
    return;
  }
  if (absenceType === "maternity_leave") {
    const used = childAbsenceCount(child.id, "maternity_leave");
    const entitlement = maternityMandatoryEntitlement(child, workDate, used);
    hint.textContent = `Modalità ${entitlement.mode} · ${used} giornate lavorative registrate · periodo ${entitlement.windowStart}–${entitlement.windowEnd}${entitlement.requiresCertification ? " · certificazione richiesta" : ""}.`;
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

function childEventAbsenceError(absenceType, childId, workDate) {
  if (!["paternity_mandatory", "maternity_leave"].includes(absenceType)) return "";
  const child = familyChildren().find((item) => item.id === childId);
  if (!child) return "Seleziona il figlio/evento collegato.";
  const alreadyUsed = state.childSicknessDays.some((day) => day.work_date === workDate && day.child_id === childId && day.absence_type === absenceType);
  const used = Math.max(0, childAbsenceCount(childId, absenceType) - (alreadyUsed ? 1 : 0));
  const entitlement = absenceType === "paternity_mandatory"
    ? paternityMandatoryEntitlement(child, workDate, used)
    : maternityMandatoryEntitlement(child, workDate, used);
  if (entitlement.status === "upcoming") return `La giornata precede l’inizio del periodo (${entitlement.windowStart}).`;
  if (entitlement.status === "expired") return `La giornata supera il termine del periodo (${entitlement.windowEnd}).`;
  if (absenceType === "paternity_mandatory" && entitlement.remainingDays <= 0) return "Il plafond di paternità obbligatoria è esaurito.";
  return "";
}

function toggleAbsenceFields(scope) {
  const actual = $(`#${scope}-actual-type`).value || $(`#${scope}-planned-type`).value;
  const absenceField = $(`#${scope}-absence-field`);
  const absenceType = $(`#${scope}-absence-type`);
  absenceField.hidden = actual !== "absence";
  const childField = $(`#${scope}-child-field`);
  childField.hidden = actual !== "absence" || !CHILD_LINKED_ABSENCE_TYPES.has(absenceType.value);
  const childSelect = $(`#${scope}-child-id`);
  if (childSelect) childSelect.required = !childField.hidden;
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
  const dates = (day.events || []).filter((event) => !event?.superseded).map((event) => new Date(event.at)).filter((date) => !Number.isNaN(date.getTime()));
  return dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))) : new Date(`${day.work_date}T23:59:00`);
}

async function showExitNotification(forecast, entryKey, automatic = false) {
  const preferences = notificationPreferences();
  if (!preferences.enabled || preferences.notifiedEntry === entryKey || Notification.permission !== "granted") return;
  const body = automatic
    ? `Uscita automatica alle ${formatTime(forecast)}. Non è richiesta una registrazione manuale.`
    : `Uscita prevista alle ${formatTime(forecast)}. Ricordati di registrare l’uscita.`;
  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(automatic ? "Chrono Flow · Uscita automatica" : "Chrono Flow · È ora di uscire", {
        body,
        icon: "./icons/icon-192.png",
        badge: "./icons/icon-192.png",
        tag: `chrono-flow-exit-${entryKey}`,
        renotify: false
      });
    } else {
      new Notification(automatic ? "Chrono Flow · Uscita automatica" : "Chrono Flow · È ora di uscire", { body, icon: "./icons/icon-192.png" });
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
  const automatic = smartAutoExitPolicy(day).automatic;
  state.notificationTimer = window.setTimeout(() => showExitNotification(forecast, entryKey, automatic), Math.min(delay, 2147483647));
}

function updateLocationChoice(effectiveType) {
  $$(".location-option").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.location === effectiveType));
  });
}

function updateHeroMode(effectiveType) {
  applyHomeModePresentation($("#work-timer-card"), $("#work-mode-label"), effectiveType, document);
}

function updateTodayLiveDisplay(day, effectiveType, result, forecast) {
  const isLive = ["working", "paused"].includes(result.state);
  const autoExit = smartAutoExitPolicy(day);
  const displayedWorkedSeconds = result.ordinaryWorkedSeconds;
  const scheduleComplete = isLive && result.remainingSeconds <= 0;
  $("#worked-value").textContent = isLive
    ? secondsToDuration(displayedWorkedSeconds)
    : minutesToDuration(Math.floor(displayedWorkedSeconds / 60));
  $("#forecast-value").textContent = formatTime(forecast);
  $("#overtime-value").textContent = isLive
    ? secondsToDuration(result.overtimeSeconds)
    : minutesToDuration(result.overtimeMinutes);
  $("#ticket-value").textContent = ticketForDay(state.profile, day) ? "Sì" : "No";

  const primary = $("#primary-action");
  const exit = $("#exit-action");
  const autoExitNote = $("#smart-auto-exit-note");
  primary.disabled = effectiveType === "absence";
  exit.hidden = !isLive || effectiveType === "absence" || autoExit.automatic;
  autoExitNote.hidden = !autoExit.automatic || !autoExit.autoExitAt;
  if (!autoExitNote.hidden) {
    autoExitNote.textContent = result.state === "finished"
      ? `Uscita registrata automaticamente alle ${formatAutomaticExitTime(result.lastExit || autoExit.autoExitAt)}`
      : `Uscita automatica alle ${formatAutomaticExitTime(autoExit.autoExitAt)}`;
  }

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
  } else if (result.automaticBreakActive) {
    $("#work-state-label").textContent = "Pausa automatica";
    $("#work-main-value").textContent = secondsToDuration(result.defaultBreakAppliedSeconds);
    $("#work-main-caption").textContent = `Il conteggio è fermo e riprende automaticamente alle ${formatTime(result.automaticBreakEnd)}. Lavorate ${secondsToDuration(displayedWorkedSeconds)}.`;
    primary.textContent = "Pausa automatica in corso";
    primary.disabled = true;
  } else if (result.state === "working") {
    $("#work-state-label").textContent = scheduleComplete
      ? "Orario completato"
      : result.defaultBreakAppliedSeconds > 0 ? "Pausa predefinita applicata" : "Stai lavorando";
    $("#work-main-value").textContent = secondsToDuration(displayedWorkedSeconds);
    $("#work-main-caption").textContent = scheduleComplete
      ? result.overtimeSeconds > 0
        ? `Monte ore completato · straordinario +${secondsToDuration(result.overtimeSeconds)}.`
        : autoExit.automatic
          ? "Monte ore completato. La giornata viene chiusa automaticamente."
          : "Hai completato il monte ore previsto."
      : result.defaultBreakAppliedSeconds > 0
        ? `${autoExit.automatic ? "La pausa configurata determina l’uscita automatica. " : "La pausa configurata è inclusa. "}Restano ${secondsToDuration(result.remainingSeconds)} di lavoro.`
        : `Restano ${secondsToDuration(result.remainingSeconds)} di lavoro.`;
    primary.textContent = "Inizia pausa";
  } else if (result.state === "paused") {
    $("#work-state-label").textContent = "Pausa in corso";
    $("#work-main-value").textContent = secondsToDuration(result.pausedSeconds);
    $("#work-main-caption").textContent = scheduleComplete
      ? `Monte ore completato · lavorate ${secondsToDuration(displayedWorkedSeconds)}.`
      : `Lavorate ${secondsToDuration(displayedWorkedSeconds)} · restano ${secondsToDuration(result.remainingSeconds)}.`;
    primary.textContent = "Termina pausa";
  } else {
    $("#work-state-label").textContent = "Giornata conclusa";
    $("#work-main-value").textContent = formatTime(result.lastExit);
    $("#work-main-caption").textContent = `Hai lavorato ${minutesToDuration(result.ordinaryWorkedMinutes)}.`;
    primary.textContent = "Giornata conclusa";
    primary.disabled = true;
  }
}

function renderTodayTick() {
  if (!state.user || $("#today-screen").hidden || document.hidden) return;
  const now = new Date();
  const date = isoDateLocal(now);
  const savedDay = state.days.get(date) || null;
  const day = savedDay || defaultDay(date);
  void closeSmartDayWhenDue(day, now);
  const effectiveType = homeModeForToday(savedDay);
  const result = calculateTrackedDay(day, now);
  const forecast = forecastExit(day.events, state.profile.target_minutes, breakForType(state.profile, effectiveType), now);
  updateTodayLiveDisplay(day, effectiveType, result, forecast);
}

function syncHomeClock() {
  if (state.user && !document.hidden && !$("#today-screen").hidden) homeClock.resume();
  else homeClock.stop();
}

function renderToday() {
  if (!state.user) return;
  const now = new Date();
  const date = isoDateLocal(now);
  const savedDay = state.days.get(date) || null;
  const day = savedDay || defaultDay(date);
  const effectiveType = homeModeForToday(savedDay);
  const result = calculateTrackedDay(day, now);
  const plannedBreak = breakForType(state.profile, effectiveType);
  const forecast = forecastExit(day.events, state.profile.target_minutes, plannedBreak, now);
  const dayType = DAY_TYPES[effectiveType] || DAY_TYPES.office;
  const saturday = isWorkingSaturday(day);

  $("#today-date").textContent = formatLongDate(now);
  updateHeroMode(effectiveType);
  $("#today-type-badge").textContent = saturday ? `Sabato lavorativo · ${dayType.label}` : dayType.label;
  $("#today-type-badge").className = `type-badge ${effectiveType}${saturday ? " saturday" : ""}`;
  const saturdayNote = $("#today-saturday-note");
  if (saturdayNote) {
    saturdayNote.hidden = !saturday;
    saturdayNote.textContent = saturday
      ? "Sabato lavorativo: il buono pasto automatico non matura. Un’eventuale forzatura resta esplicita."
      : "";
  }
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
  renderTodayProjects();
}

function allocationBalanceCopy(allocated, worked) {
  const difference = worked - allocated;
  if (difference > 0) return { label: `Da associare ${minutesToDuration(difference)}`, warning: `Mancano ${minutesToDuration(difference)} da associare a una commessa. Puoi completare la giornata comunque.` };
  if (difference < 0) return { label: `${minutesToDuration(Math.abs(difference))} oltre il lavorato`, warning: `Le ore allocate superano di ${minutesToDuration(Math.abs(difference))} le ore lavorate. Controlla gli intervalli senza bloccare la giornata.` };
  return { label: "Ore completamente associate", warning: "" };
}

function allocationRow(allocation, { editable = true } = {}) {
  const project = state.projects.get(allocation.project_id);
  const row = document.createElement("div");
  row.className = "allocation-row";
  const copy = document.createElement("div");
  copy.className = "allocation-row-copy";
  const name = document.createElement("strong");
  name.textContent = projectLabel(project);
  const meta = document.createElement("span");
  meta.textContent = allocation.start_time && allocation.end_time
    ? `${allocation.start_time}–${allocation.end_time} · ${minutesToDuration(allocation.duration_minutes)}`
    : minutesToDuration(allocation.duration_minutes);
  copy.append(name, meta);
  if (allocation.note) {
    const note = document.createElement("small");
    note.textContent = allocation.note;
    copy.append(note);
  }
  row.append(copy);
  if (editable) {
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "button ghost allocation-edit";
    edit.textContent = "Modifica";
    edit.setAttribute("aria-label", `Modifica attività ${projectLabel(project)}`);
    edit.addEventListener("click", () => openAllocationDialog(allocation.work_date, allocation.id));
    row.append(edit);
  }
  return row;
}

function renderAllocationList(container, date, options = {}) {
  if (!container) return;
  const allocations = allocationsForDate(date);
  if (!allocations.length) {
    const empty = document.createElement("p");
    empty.className = "empty-allocation-copy";
    empty.textContent = "Nessuna attività associata.";
    container.replaceChildren(empty);
    return;
  }
  container.replaceChildren(...allocations.map((allocation) => allocationRow(allocation, options)));
}

function renderTodayProjects() {
  const section = $("#today-projects");
  if (!section) return;
  const enabled = setProjectFeatureVisibility();
  if (!enabled) return;
  const date = isoDateLocal();
  const allocated = allocationMinutesForDate(date);
  const worked = workedMinutesForDate(date);
  const balance = allocationBalanceCopy(allocated, worked);
  $("#today-allocation-copy").textContent = `${minutesToDuration(allocated)} allocate / ${minutesToDuration(worked)} lavorate`;
  $("#today-allocation-balance").textContent = balance.label;
  const progress = $("#today-allocation-progress");
  const percentage = worked ? Math.min(100, (allocated / worked) * 100) : 0;
  progress.style.width = `${percentage}%`;
  const track = progress.parentElement;
  track.setAttribute("aria-valuemax", String(Math.max(worked, allocated, 1)));
  track.setAttribute("aria-valuenow", String(allocated));
  track.setAttribute("aria-label", `${minutesToDuration(allocated)} allocate su ${minutesToDuration(worked)} lavorate`);
  const warning = $("#today-allocation-warning");
  warning.hidden = !balance.warning || (!worked && !allocated);
  warning.textContent = warning.hidden ? "" : balance.warning;
  renderAllocationList($("#today-allocation-list"), date);
}

function renderDayProjects(date) {
  const field = $("#day-projects-field");
  if (!field) return;
  field.hidden = !projectsEnabled();
  if (field.hidden) return;
  const allocated = allocationMinutesForDate(date);
  const worked = workedMinutesForDate(date);
  const balance = allocationBalanceCopy(allocated, worked);
  $("#day-allocation-copy").textContent = `${minutesToDuration(allocated)} allocate / ${minutesToDuration(worked)} lavorate`;
  const warning = $("#day-allocation-warning");
  warning.hidden = !balance.warning || (!worked && !allocated);
  warning.textContent = warning.hidden ? "" : balance.warning;
  renderAllocationList($("#day-allocation-list"), date);
}

function allocationProjectOptions(selectedId = "") {
  const active = [...state.projects.values()].filter((project) => project.is_active);
  const selected = state.projects.get(selectedId);
  if (selected && !selected.is_active && !active.some((project) => project.id === selected.id)) active.push(selected);
  return active.sort((left, right) => left.code.localeCompare(right.code, "it", { numeric: true })).map((project) => {
    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = `${projectLabel(project)}${project.is_active ? "" : " · archiviata"}`;
    return option;
  });
}

function allocationMethod() {
  return $('input[name="allocation-method"]:checked')?.value === "hours" ? "hours" : "automatic";
}

function allocationSelectedProjectIds() {
  return [...state.allocationSelectedProjects].filter((id) => state.projects.has(id));
}

function renderAllocationHoursEditor() {
  const root = $("#allocation-hours-list");
  if (!root) return;
  const date = $("#allocation-date").value;
  const selectedIds = allocationSelectedProjectIds();
  const workedMinutes = workedMinutesForDate(date);
  const automatic = allocationMethod() === "automatic";
  const percentages = selectedIds.length ? equalPercentages(selectedIds.length) : [];
  $("#allocation-worked-summary").textContent = automatic
    ? selectedIds.length
      ? `${minutesToDuration(workedMinutes)} lavorate · ripartizione automatica ${percentages.map((value) => `${String(value).replace(".", ",")}%`).join(" + ")}`
      : "Seleziona almeno una commessa."
    : `${minutesToDuration(workedMinutes)} lavorate · inserisci le ore per ogni commessa.`;
  root.replaceChildren(...selectedIds.map((id, index) => {
    const project = state.projects.get(id);
    const row = document.createElement("div");
    row.className = "allocation-hours-row";
    const label = document.createElement("label");
    label.htmlFor = `allocation-hours-${id}`;
    label.textContent = projectLabel(project);
    if (automatic) {
      const copy = document.createElement("strong");
      const previewMinutes = workedMinutes && selectedIds.length
        ? Math.floor(workedMinutes / selectedIds.length) + (index < workedMinutes % selectedIds.length ? 1 : 0)
        : 0;
      copy.textContent = `${String(percentages[index]).replace(".", ",")}% · ${minutesToDuration(previewMinutes)}`;
      row.append(label, copy);
    } else {
      const inputShell = document.createElement("div");
      inputShell.className = "allocation-hours-input";
      const input = document.createElement("input");
      input.id = `allocation-hours-${id}`;
      input.type = "number";
      input.min = "0.01";
      input.max = "24";
      input.step = "0.01";
      input.inputMode = "decimal";
      input.required = true;
      input.value = state.allocationManualHours.get(id) || "";
      input.addEventListener("input", () => state.allocationManualHours.set(id, input.value));
      const unit = document.createElement("span");
      unit.textContent = "ore";
      inputShell.append(input, unit);
      row.append(label, inputShell);
    }
    return row;
  }));
}

function renderAllocationProjectPicker() {
  const root = $("#allocation-project-options");
  if (!root) return;
  const query = $("#allocation-project-search").value;
  const projects = searchProjects(
    [...state.projects.values()].filter((project) => project.is_active || state.allocationSelectedProjects.has(project.id)),
    query
  )
    .sort((left, right) => left.code.localeCompare(right.code, "it", { numeric: true }));
  $("#allocation-project-empty").hidden = projects.length > 0;
  root.replaceChildren(...projects.map((project) => {
    const label = document.createElement("label");
    label.className = "project-picker-option";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = project.id;
    input.checked = state.allocationSelectedProjects.has(project.id);
    const copy = document.createElement("span");
    const code = document.createElement("strong");
    code.textContent = project.code;
    const description = document.createElement("small");
    description.textContent = `${project.description}${project.is_active ? "" : " · archiviata"}`;
    copy.append(code, description);
    input.addEventListener("change", () => {
      if (input.checked) state.allocationSelectedProjects.add(project.id);
      else state.allocationSelectedProjects.delete(project.id);
      renderAllocationHoursEditor();
    });
    label.append(input, copy);
    return label;
  }));
  renderAllocationHoursEditor();
}

function openAllocationDialog(date, allocationId = null) {
  if (!projectsEnabled()) return;
  const allocation = allocationId ? allAllocations().find((item) => item.id === allocationId) : null;
  const existing = allocationsForDate(date);
  state.editingAllocationId = allocation?.id || null;
  state.allocationSelectedProjects = new Set(existing.map((item) => item.project_id));
  if (!state.allocationSelectedProjects.size && preferredProjectId()) state.allocationSelectedProjects.add(preferredProjectId());
  state.allocationManualHours = new Map(existing.map((item) => [item.project_id, minutesToHoursInput(item.duration_minutes)]));
  $("#allocation-id").value = allocation?.id || "";
  $("#allocation-date").value = date;
  $("#allocation-dialog-title").textContent = existing.length ? "Modifica attività" : "Registra attività";
  $("#allocation-dialog-description").textContent = `${new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${date}T12:00:00`))}. Se non indichi ore, Chrono Flow divide automaticamente l’orario lavorato.`;
  $("#allocation-project-search").value = "";
  const method = existing.length && existing.every((item) => item.allocation_method === "automatic") ? "automatic" : existing.length ? "hours" : "automatic";
  const methodControl = $(`input[name="allocation-method"][value="${method}"]`);
  if (methodControl) methodControl.checked = true;
  $("#allocation-note").value = allocation?.note || "";
  const hasSelectableProjects = [...state.projects.values()].some((project) => project.is_active || state.allocationSelectedProjects.has(project.id));
  $("#allocation-error").hidden = hasSelectableProjects;
  $("#allocation-error").textContent = hasSelectableProjects
    ? ""
    : "Nessuna commessa attiva. Puoi chiudere questa finestra e aggiungerne una in Impostazioni → Commesse.";
  $("#delete-allocation").hidden = !allocation;
  renderAllocationProjectPicker();
  $("#allocation-dialog").showModal();
  window.requestAnimationFrame(() => $("#allocation-project-search").focus());
}

function minutesFromTimeRange(start, end) {
  if (!start && !end) return null;
  if (!start || !end) throw new Error("Compila sia l’orario iniziale sia quello finale.");
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  const minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  if (minutes <= 0) throw new Error("L’orario finale deve essere successivo a quello iniziale.");
  return minutes;
}

function intervalsOverlap(date, start, end, ignoredId = null) {
  if (!start || !end) return false;
  return allocationsForDate(date).some((allocation) => allocation.id !== ignoredId && allocation.start_time && allocation.end_time
    && start < allocation.end_time && end > allocation.start_time);
}

async function saveAllocation(payload) {
  const normalized = setAllocationInState(payload);
  persistProjectCache();
  renderCurrentViews();
  if ($("#day-dialog")?.open && $("#day-date").value === normalized.work_date) renderDayProjects(normalized.work_date);
  if (!navigator.onLine) {
    queueProjectOperation({ entity: "allocation", op: "upsert", id: normalized.id, payload: normalized });
    showToast("Attività salvata sul dispositivo; sincronizzazione in attesa.");
    return normalized;
  }
  const { data, error } = await state.supabase.from("work_allocations").upsert(normalized, { onConflict: "id" }).select().single();
  if (error) {
    queueProjectOperation({ entity: "allocation", op: "upsert", id: normalized.id, payload: normalized });
    showToast("Attività salvata sul dispositivo; sincronizzazione in attesa.");
    return normalized;
  }
  const saved = setAllocationInState(data);
  persistProjectCache();
  updateSyncStatus();
  return saved;
}

async function replaceDayAllocations(date, payloads) {
  const previous = allocationsForDate(date);
  const normalized = payloads.map(normalizeAllocation);
  const nextIds = new Set(normalized.map((item) => item.id));
  const removed = previous.filter((item) => !nextIds.has(item.id));
  if (normalized.length) state.allocations.set(date, normalized);
  else state.allocations.delete(date);
  persistProjectCache();
  renderCurrentViews();
  if ($("#day-dialog")?.open && $("#day-date").value === date) renderDayProjects(date);

  if (!navigator.onLine) {
    removed.forEach((item) => queueProjectOperation({ entity: "allocation", op: "delete", id: item.id }));
    normalized.forEach((item) => queueProjectOperation({ entity: "allocation", op: "upsert", id: item.id, payload: item }));
    showToast("Commesse salvate sul dispositivo; sincronizzazione in attesa.");
    return normalized;
  }

  if (normalized.length) {
    const result = await state.supabase.from("work_allocations").upsert(normalized, { onConflict: "id" }).select();
    if (result.error) {
      normalized.forEach((item) => queueProjectOperation({ entity: "allocation", op: "upsert", id: item.id, payload: item }));
      throw result.error;
    }
    state.allocations.set(date, (result.data || normalized).map(normalizeAllocation));
  }
  if (removed.length) {
    const result = await state.supabase
      .from("work_allocations")
      .delete()
      .eq("user_id", state.user.id)
      .in("id", removed.map((item) => item.id));
    if (result.error) removed.forEach((item) => queueProjectOperation({ entity: "allocation", op: "delete", id: item.id }));
  }
  persistProjectCache();
  updateSyncStatus();
  renderCurrentViews();
  return state.allocations.get(date) || [];
}

async function deleteAllocation(id, date) {
  removeAllocationFromState(id, date);
  persistProjectCache();
  renderCurrentViews();
  if ($("#day-dialog")?.open && $("#day-date").value === date) renderDayProjects(date);
  if (!navigator.onLine) {
    queueProjectOperation({ entity: "allocation", op: "delete", id });
    return;
  }
  const { error } = await state.supabase.from("work_allocations").delete().eq("id", id).eq("user_id", state.user.id);
  if (error) queueProjectOperation({ entity: "allocation", op: "delete", id });
  updateSyncStatus();
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
  if (projectsEnabled()) await recalculateAutomaticAllocationsForDay(date);
  state.busy = false;

  const labels = { entry: "Entrata registrata", pause: "Pausa iniziata", resume: "Pausa terminata", exit: "Uscita registrata" };
  showToast(`${labels[type]} alle ${formatTime(event.at)}.`, async () => {
    if (before) await saveDay(before, { silent: true });
    else await deleteDay(date, { silent: true });
    showToast("Ultima azione annullata.");
  });
}

function renderCalendar() {
  if (!state.user || state.calendarScope !== "mine") return;
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
    const type = day ? effectiveDayMode(day) : null;
    const info = DAY_TYPES[type] || null;
    const holiday = recognizedItalianHolidays(date.getFullYear(), sundayHolidayContract().local_holiday)
      .find((item) => item.date === key);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-day";
    button.dataset.workDate = key;
    button.setAttribute("role", "gridcell");
    if (date.getMonth() !== month.getMonth()) button.classList.add("outside");
    if (key === isoDateLocal()) button.classList.add("today");
    if (holiday) button.classList.add("recognized-holiday");
    const dayAllocations = projectsEnabled() ? allocationsForDate(key) : [];
    const allocatedMinutes = dayAllocations.reduce((total, allocation) => total + allocation.duration_minutes, 0);
    const label = `${formatLongDate(date)}${holiday ? `, ${holiday.name}` : ""}${info ? `, ${info.label}` : ", nessuna pianificazione"}${day?.events?.length ? ", orari registrati" : ""}${allocatedMinutes ? `, ${minutesToDuration(allocatedMinutes)} allocate a ${dayAllocations.length} commess${dayAllocations.length === 1 ? "a" : "e"}` : ""}`;
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
    if (allocatedMinutes) {
      const projectDot = document.createElement("span");
      projectDot.className = "project-dot";
      projectDot.textContent = minutesToDuration(allocatedMinutes);
      projectDot.setAttribute("aria-hidden", "true");
      button.append(projectDot);
    }
    if (holiday) {
      const mark = document.createElement("span");
      mark.className = "holiday-mark";
      mark.textContent = "Fest.";
      mark.setAttribute("aria-hidden", "true");
      button.append(mark);
    }
    grid.append(button);
  }
}

function clockValueForEvent(events, type) {
  const event = (events || []).find((item) => item.type === type && !item.superseded);
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

function updateDayAutoExitEditor() {
  const date = $("#day-date").value;
  const planned = $("#day-planned-type").value || "office";
  const actual = $("#day-actual-type").value || null;
  const effectiveType = actual || planned;
  const automatic = smartAutomaticExitEnabled(effectiveType, overtimeSettings());
  let autoExitAt = null;
  if (automatic && date && $("#day-entry-time").value) {
    try {
      const events = eventsFromLocalTimes(date, {
        entry: $("#day-entry-time").value,
        pauseStart: $("#day-pause-start-time").value,
        pauseEnd: $("#day-pause-end-time").value,
        exit: ""
      });
      autoExitAt = smartAutomaticExitAt({
        events,
        targetMinutes: state.profile.target_minutes,
        standardBreakMinutes: breakForType(state.profile, effectiveType),
        now: new Date()
      });
    } catch {
      autoExitAt = null;
    }
  }
  $("#day-exit-time").disabled = automatic;
  $("#day-auto-exit-hint").hidden = !automatic;
  $("#day-auto-exit-hint").textContent = automatic
    ? autoExitAt
      ? `Uscita automatica alle ${formatAutomaticExitTime(autoExitAt)}. Modificando ingresso, pausa o durata verrà ricalcolata.`
      : "L’uscita verrà calcolata automaticamente dopo aver indicato l’ingresso."
    : "";
}

function openDayDialog(date) {
  if (state.calendarScope !== "mine") return;
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
  updateDayAutoExitEditor();
  $("#day-saturday-note").hidden = !isWorkingSaturday(day);
  $("#delete-day").hidden = !state.days.has(date);
  toggleAbsenceFields("day");
  renderDayProjects(date);
  const dialog = $("#day-dialog");
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function closeDayDialog() {
  const dialog = $("#day-dialog");
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

let personalCalendarEditorBound = false;

function bindPersonalCalendarEditor() {
  if (personalCalendarEditorBound) return;
  personalCalendarEditorBound = true;

  // Delegazione stabile: continua a funzionare dopo ogni render del mese e
  // viene registrata prima delle sezioni opzionali Commesse/Condivisione.
  $("#calendar-grid").addEventListener("click", (event) => {
    const button = event.target.closest("button.calendar-day[data-work-date]");
    if (!button || state.calendarScope !== "mine") return;
    openDayDialog(button.dataset.workDate);
  });
  $("#close-day-dialog").addEventListener("click", closeDayDialog);
  $("#day-planned-type").addEventListener("change", () => { toggleAbsenceFields("day"); updateDayAutoExitEditor(); });
  $("#day-actual-type").addEventListener("change", () => { toggleAbsenceFields("day"); updateDayAutoExitEditor(); });
  $("#day-absence-type").addEventListener("change", () => toggleAbsenceFields("day"));
  $("#day-child-id").addEventListener("change", () => updateChildPolicyHint("day"));
  ["#day-entry-time", "#day-pause-start-time", "#day-pause-end-time"].forEach((selector) => {
    $(selector).addEventListener("input", updateDayAutoExitEditor);
  });

  $("#day-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (state.calendarScope !== "mine") return showToast("Il calendario condiviso è disponibile solo in lettura.");
    const form = event.currentTarget;
    const submit = form.querySelector('button[type="submit"]');
    if (submit?.disabled) return;
    if (submit) submit.disabled = true;
    try {
      const date = $("#day-date").value;
      const day = normalizeDay(state.days.get(date) || defaultDay(date));
      day.planned_type = $("#day-planned-type").value;
      day.actual_type = $("#day-actual-type").value || null;
      const effectiveType = day.actual_type || day.planned_type;
      day.absence_type = effectiveType === "absence" ? $("#day-absence-type").value : null;
      const absenceError = sundayHolidayRecoveryError(day.absence_type, day.work_date);
      if (absenceError) return showToast(absenceError);
      day.child_id = CHILD_LINKED_ABSENCE_TYPES.has(day.absence_type) ? $("#day-child-id").value || null : null;
      if (CHILD_LINKED_ABSENCE_TYPES.has(day.absence_type) && !day.child_id) {
        $("#day-child-id").focus();
        return showToast("Seleziona il figlio: i plafond sono separati e non possono essere condivisi.");
      }
      const childEventError = childEventAbsenceError(day.absence_type, day.child_id, day.work_date);
      if (childEventError) return showToast(childEventError);
      day.ticket_override = effectiveType === "absence" || $("#day-ticket").value === "auto" ? null : $("#day-ticket").value === "yes";
      day.notes = $("#day-notes").value.trim();
      if (effectiveType !== "absence") {
        const automaticExitHistory = day.events
          .filter((item) => item?.type === "exit" && item.auto_exit === true)
          .map((item) => ({ ...item, superseded: true, superseded_reason: "manual_day_edit", superseded_at: new Date().toISOString() }));
        day.events = [...automaticExitHistory, ...eventsFromLocalTimes(date, {
          entry: $("#day-entry-time").value,
          pauseStart: $("#day-pause-start-time").value,
          pauseEnd: $("#day-pause-end-time").value,
          exit: $("#day-exit-time").disabled ? "" : $("#day-exit-time").value
        })];
      } else {
        day.events = [];
      }
      await saveDay(day, { silent: true });
      if (projectsEnabled()) await recalculateAutomaticAllocationsForDay(date);
      closeDayDialog();
      showToast("Giornata salvata.");
    } catch (error) {
      showToast(`Giornata non salvata: ${friendlyError(error)}`);
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  $("#delete-day").addEventListener("click", async () => {
    const date = $("#day-date").value;
    const before = state.days.has(date) ? structuredClone(state.days.get(date)) : null;
    const beforeAllocations = allocationsForDate(date).map((allocation) => structuredClone(allocation));
    if (!before) return closeDayDialog();
    await deleteDay(date, { silent: true });
    closeDayDialog();
    showToast("Giornata eliminata.", async () => {
      await saveDay(before, { silent: true });
      for (const allocation of beforeAllocations) await saveAllocation(allocation);
      showToast("Giornata ripristinata.");
    });
  });
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

function setAnnualMetric(id, used, total) {
  const target = $(`#${id}`);
  if (target) target.textContent = `${used} / ${total}`;
}

function renderAnnualLeaveBalance(year) {
  if (state.summaryYearLoading && state.summaryYearLoaded !== year) {
    $("#annual-balance-year").textContent = String(year);
    $("#annual-vacation-remaining").textContent = "—";
    $("#annual-vacation-usage").textContent = "Caricamento…";
    $("#annual-vacation-progress").style.width = "0";
    for (const id of ["annual-vacation-previous", "annual-vacation-current", "annual-suppressed-holidays", "annual-holiday-recovery"]) {
      $(`#${id}`).textContent = "—";
    }
    $("#annual-balance-note").textContent = `Sto caricando le giornate del ${year} e del ${year - 1} per calcolare il riporto.`;
    return;
  }
  const balance = annualLeaveBalanceForYear(year);
  const recovery = sundayHolidayBalance(year);
  $("#annual-balance-year").textContent = String(year);
  $("#annual-vacation-remaining").textContent = String(balance.vacation.remaining);
  $("#annual-vacation-usage").textContent = `${balance.vacation.used} / ${balance.vacation.total}`;
  const progress = $("#annual-vacation-progress");
  const progressMaximum = Math.max(1, balance.vacation.total);
  progress.style.width = `${Math.min(100, (balance.vacation.used / progressMaximum) * 100)}%`;
  progress.parentElement.setAttribute("aria-valuemin", "0");
  progress.parentElement.setAttribute("aria-valuemax", String(balance.vacation.total));
  progress.parentElement.setAttribute("aria-valuenow", String(Math.min(balance.vacation.used, balance.vacation.total)));
  progress.parentElement.setAttribute("aria-label", `${balance.vacation.used} giorni di ferie utilizzati su ${balance.vacation.total}`);
  setAnnualMetric("annual-vacation-previous", balance.vacation.previous.used, balance.vacation.previous.total);
  setAnnualMetric("annual-vacation-current", balance.vacation.current.used, balance.vacation.current.total);
  setAnnualMetric("annual-suppressed-holidays", balance.suppressedHolidays.used, balance.suppressedHolidays.total);
  setAnnualMetric("annual-holiday-recovery", recovery.used, recovery.accrued);
  const note = $("#annual-balance-note");
  if (balance.vacation.exceeded) {
    note.textContent = `Le ferie registrate superano il totale disponibile di ${balance.vacation.exceeded} giorn${balance.vacation.exceeded === 1 ? "o" : "i"}. Controlla le giornate o le spettanze nelle Impostazioni.`;
    note.classList.add("warning-note");
  } else if (balance.suppressedHolidays.exceeded) {
    note.textContent = `Le festività soppresse registrate superano il totale disponibile di ${balance.suppressedHolidays.exceeded} giorn${balance.suppressedHolidays.exceeded === 1 ? "o" : "i"}.`;
    note.classList.add("warning-note");
  } else {
    note.textContent = balance.carryoverSource === "automatic"
      ? `Le ferie dell’anno precedente derivano automaticamente dal residuo del ${year - 1}. I valori mostrano utilizzati / disponibili.`
      : "Il riporto dell’anno precedente usa la rettifica configurata. I valori mostrano utilizzati / disponibili.";
    note.classList.remove("warning-note");
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
  const localHoliday = sundayHolidayContract().local_holiday;
  for (const day of days) {
    if ((day.actual_type || day.planned_type) !== "absence") continue;
    const absenceType = day.absence_type || "leave";
    if (absenceType === "holiday" && !isSuppressedHolidayDay(day, localHoliday)) continue;
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

const MONTH_DETAIL_METRICS = [
  ["Ferie", "vacation", "days", "vacation"],
  ["Festività soppresse", "suppressedHolidays", "days", "holiday"],
  ["Recupero riposo festività", "holidayRecovery", "days", "sunday_holiday_recovery"],
  ["Malattia", "sickness", "days", "sickness"],
  ["Malattia bambino", "childSickness", "days", "child_sickness"],
  ["Congedo parentale facoltativo", "parentalLeave", "days", "parental_leave"],
  ["Maternità obbligatoria", "maternityLeave", "days", "maternity_leave"],
  ["Paternità obbligatoria", "paternityMandatory", "days", "paternity_mandatory"],
  ["Paternità alternativa", "paternityAlternative", "days", "paternity_alternative"],
  ["Congedo matrimoniale", "marriageLeave", "days", "marriage_leave"],
  ["Giorni smart", "smartDays", "days"],
  ["Sabati lavorativi", "workingSaturdays", "days"]
];

const ANNUAL_TABLE_METRICS = [
  ["Giorni lavorativi teorici", "theoreticalWorkdays", "days"],
  ["Ferie", "vacation", "days"],
  ["Festività soppresse", "suppressedHolidays", "days"],
  ["Recupero riposo festività", "holidayRecovery", "days"],
  ["Malattia", "sickness", "days"],
  ["Malattia bambino", "childSickness", "days"],
  ["Maternità obbligatoria", "maternityLeave", "days", "maternity_leave"],
  ["Paternità obbligatoria", "paternityMandatory", "days", "paternity_mandatory"],
  ["Congedo facoltativo / parentale", "parentalLeave", "days", "parental_leave"],
  ["Giorni lavorativi effettivi", "effectiveWorkdays", "days"],
  ["Giorni smart", "smartDays", "days"],
  ["Buoni pasto (competenza -2 mesi)", "mealVouchers", "count"],
  ["Ore straordinario", "overtimeMinutes", "duration"],
  ["Recupero maggiori prestazioni", "performanceRecoveryMinutes", "duration"],
  ["Ore straordinario nette", "netOvertimeMinutes", "duration"]
];

function visibleMetrics(metrics, rows = [], yearDays = state.summaryYearDays) {
  return metrics.filter(([, key, , absenceType]) => {
    const hasValue = rows.some((row) => Number(row?.[key]) !== 0 && row?.[key] !== null);
    if (absenceType) {
      if (["maternity_leave", "paternity_mandatory", "paternity_alternative"].includes(absenceType)
        && !roleAllowsAbsenceType(absenceType, yearDays)) return false;
      return absenceFeatureEnabled(absenceType) || hasValue;
    }
    if (key === "smartDays") return workModeEnabled("smart") || hasValue;
    if (key === "workingSaturdays") return applicabilitySettings().work_modes.saturday || hasValue;
    return true;
  });
}

function summaryValue(metric, key, format) {
  const raw = metric?.[key];
  if (raw === null || raw === undefined) return "—";
  const value = Number(raw) || 0;
  if (format === "duration") return minutesToDuration(value);
  if (format === "signed" && value > 0) return `+${value}`;
  return String(value);
}

function decoratedSummaryDays(days) {
  return days.map((day) => {
    const result = calculateTrackedDay(day, calculationNow(day));
    return { ...day, worked_minutes: result.workedMinutes, overtime_minutes: result.overtimeMinutes };
  });
}

function summaryRowsForYear(year) {
  const combined = decoratedSummaryDays([...state.summaryPreviousYearDays, ...state.summaryYearDays]);
  const localHoliday = sundayHolidayContract().local_holiday;
  return Array.from({ length: 12 }, (_, month) => workbookMonthlySummary({
    year,
    month,
    days: combined,
    competenceDays: combined,
    profile: state.profile,
    localHoliday,
    targetMinutes: state.profile.target_minutes
  }));
}

function renderMonthDetail(selected, rows) {
  const monthMetrics = visibleMetrics(MONTH_DETAIL_METRICS, rows);
  const grid = $("#month-detail-metrics");
  const workdayComparison = document.createElement("div");
  const workdayTerm = document.createElement("dt");
  const workdayValue = document.createElement("dd");
  workdayTerm.textContent = "Giorni lavorativi";
  workdayValue.textContent = `${selected.effectiveWorkdays} effettivi / ${selected.theoreticalWorkdays} previsti`;
  workdayComparison.append(workdayTerm, workdayValue);
  grid.replaceChildren(workdayComparison, ...monthMetrics.map(([label, key, format]) => {
    const item = document.createElement("div");
    const term = document.createElement("dt");
    const value = document.createElement("dd");
    term.textContent = label;
    value.textContent = summaryValue(selected, key, format);
    item.append(term, value);
    return item;
  }));

  const tableMetrics = visibleMetrics(ANNUAL_TABLE_METRICS, rows);
  const head = $("#annual-monthly-table-head");
  const monthHead = document.createElement("th");
  monthHead.scope = "col";
  monthHead.textContent = "Mese";
  head.replaceChildren(monthHead, ...tableMetrics.map(([label]) => {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = label;
    return th;
  }));

  const body = $("#annual-monthly-table-body");
  body.replaceChildren(...rows.map((metric) => {
    const tr = document.createElement("tr");
    const month = document.createElement("th");
    month.scope = "row";
    month.textContent = MONTH_NAMES[metric.month].slice(0, 3);
    tr.append(month);
    for (const [, key, format] of tableMetrics) {
      const td = document.createElement("td");
      td.textContent = summaryValue(metric, key, format);
      tr.append(td);
    }
    return tr;
  }));

  const totals = {};
  for (const [, key] of tableMetrics) totals[key] = rows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0);
  const totalRow = $("#annual-monthly-table-total");
  totalRow.replaceChildren();
  const label = document.createElement("th");
  label.scope = "row";
  label.textContent = "Totale";
  totalRow.append(label);
  for (const [, key, format] of tableMetrics) {
    const td = document.createElement("td");
    td.textContent = summaryValue(totals, key, format);
    totalRow.append(td);
  }
}

function addYears(dateValue, years) {
  const date = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "—";
  date.setFullYear(date.getFullYear() + years);
  return new Intl.DateTimeFormat("it-IT").format(date);
}

function renderFamilyLimits(year) {
  const children = familyChildren();
  const metrics = [];
  const deadlines = [];
  const sicknessHistory = [];

  for (const child of children) {
    const lines = [];
    if (childInstituteEnabled(child, "child_sickness")) {
      const active = childSicknessEntitlement(child, new Date());
      if (active.eligible) {
        const usedInApp = childAbsenceCount(child.id, "child_sickness", active.periodStart, active.periodEnd);
        const outside = Number(child.external_usage?.[active.periodKey] || 0);
        const used = usedInApp + outside;
        const limit = active.tier === "under_three" ? active.paidDaysLimit : active.totalDaysLimit;
        const label = active.tier === "under_three" ? `${active.lifeYear}° anno di vita` : `fascia 3–14 · anno ${active.periodStart.slice(0, 4)}`;
        metrics.push([
          `Malattia bambino · ${child.name}`,
          `${used} / ${limit}`,
          `${label} · ${Math.max(0, limit - used)} residui · periodo teorico ${active.periodStart}–${active.periodEnd}${outside ? ` · ${outside} giorni storici disponibili fuori app` : ""}`
        ]);
      }
    }
    if (childInstituteEnabled(child, "parental_leave")) {
      const used = childAbsenceCount(child.id, "parental_leave");
      const quota = parentalQuotaForChild(child);
      const value = quota.valid ? `${used} / ${quota.requestedDays}` : `${used} / —`;
      const residual = quota.valid ? Math.max(0, quota.requestedDays - used) : null;
      metrics.push([
        `Congedo parentale · ${child.name}`,
        value,
        quota.valid
          ? `${residual} giorni residui sulla quota personale di ${quota.requestedMonths} mesi · conversione 30 giorni/mese · limite legale personale ${quota.maximumForPersonalQuota} mesi`
          : `${quota.reason} Il limite di legge resta distinto dalla quota personale.`
      ]);
      lines.push(`Congedo parentale: scadenza ${addYears(child.birth_date, 14)} · quota personale ${quota.valid ? `${quota.requestedMonths} mesi (${quota.requestedDays} giorni)` : "da configurare"}`);
    }
    if (childInstituteEnabled(child, "paternity_mandatory") && (parentalRole() === "father" || parentalRole() === "custom")) {
      const entitlement = paternityMandatoryEntitlement(child, new Date(), childAbsenceCount(child.id, "paternity_mandatory"));
      metrics.push([`Paternità obbligatoria · ${child.name}`, `${entitlement.usedDays} / ${entitlement.totalDays}`, `${entitlement.remainingDays} residui · finestra ${entitlement.windowStart}–${entitlement.windowEnd}`]);
      lines.push(`Paternità obbligatoria: ${entitlement.usedDays}/${entitlement.totalDays}, residui ${entitlement.remainingDays} · termine ${entitlement.windowEnd}${entitlement.status === "expired" ? ` · ${entitlement.expiredUnusedDays} non più fruibili` : ""}`);
    }
    if (childInstituteEnabled(child, "maternity_leave") && (parentalRole() === "mother" || parentalRole() === "custom")) {
      const used = childAbsenceCount(child.id, "maternity_leave");
      const entitlement = maternityMandatoryEntitlement(child, new Date(), used);
      metrics.push([`Maternità obbligatoria · ${child.name}`, String(used), `Modalità ${entitlement.mode} · periodo ${entitlement.windowStart}–${entitlement.windowEnd}`]);
      lines.push(`Maternità ${entitlement.mode}: ${entitlement.windowStart}–${entitlement.windowEnd} · ${entitlement.status}${entitlement.requiresCertification ? " · certificazione richiesta" : ""}`);
    }
    if (childInstituteEnabled(child, "paternity_alternative") && (parentalRole() === "father" || parentalRole() === "custom")) {
      const used = childAbsenceCount(child.id, "paternity_alternative");
      metrics.push([`Paternità alternativa · ${child.name}`, String(used), "Giornate registrate per l’evento configurato"]);
      lines.push(`Paternità alternativa: ${used} giornat${used === 1 ? "a" : "e"} registrat${used === 1 ? "a" : "e"}`);
    }
    if (lines.length) deadlines.push({ child, lines });
    if (childInstituteEnabled(child, "child_sickness")) {
      for (const period of childSicknessPeriodsForYear(child, year)) {
        if (period.periodEnd >= isoDateLocal()) continue;
        const used = childAbsenceCount(child.id, "child_sickness", period.periodStart, period.periodEnd)
          + Number(child.external_usage?.[period.periodKey] || 0);
        if (used) sicknessHistory.push(`${child.name} · ${period.lifeYear ? `${period.lifeYear}° anno di vita` : `anno ${year}`} · ${used}/${period.limit} · ${period.periodStart}–${period.periodEnd}`);
      }
    }
  }

  $("#family-limit-metrics").replaceChildren(...metrics.map(([name, value, note]) => {
    const item = document.createElement("div");
    item.innerHTML = `<dt></dt><dd></dd><small></small>`;
    item.querySelector("dt").textContent = name;
    item.querySelector("dd").textContent = value;
    item.querySelector("small").textContent = note;
    return item;
  }));
  $("#family-deadlines").replaceChildren(...deadlines.map(({ child, lines }) => {
    const li = document.createElement("li");
    const name = document.createElement("strong");
    name.textContent = child.name || "Figlio";
    li.append(name, ...lines.map((line) => {
      const span = document.createElement("span");
      span.textContent = line;
      return span;
    }));
    return li;
  }));
  $("#family-history-list").replaceChildren(...sicknessHistory.map((entry) => Object.assign(document.createElement("li"), { textContent: entry })));
  $("#family-history-disclosure").hidden = sicknessHistory.length === 0;
  $("#family-summary-disclosure").hidden = metrics.length === 0 && deadlines.length === 0 && sicknessHistory.length === 0;
}

const TRACE_ABSENCE_TYPES = [
  ["sickness", "Malattia"],
  ["marriage_leave", "Congedo matrimoniale"]
];

function shortDate(date) {
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", year: "numeric" })
    .format(new Date(`${date}T12:00:00`));
}

function traceDetails(item) {
  const details = document.createElement("details");
  details.className = "trace-item";
  const summary = document.createElement("summary");
  const name = document.createElement("span");
  const value = document.createElement("strong");
  name.textContent = item.label;
  value.textContent = item.value;
  summary.append(name, value);
  const body = document.createElement("div");
  body.className = "trace-item-body";
  if (item.note) {
    const note = document.createElement("p");
    note.textContent = item.note;
    body.append(note);
  }
  const list = document.createElement("ul");
  if (item.entries.length) {
    for (const entry of item.entries) {
      const li = document.createElement("li");
      li.textContent = entry;
      list.append(li);
    }
  } else {
    const li = document.createElement("li");
    li.textContent = item.emptyLabel || "Nessuna giornata registrata.";
    list.append(li);
  }
  body.append(list);
  details.append(summary, body);
  return details;
}

function fillHistoryList(target, entries, emptyLabel) {
  const list = typeof target === "string" ? $(target) : target;
  list.replaceChildren();
  if (!entries.length) {
    const li = document.createElement("li");
    li.className = "history-empty";
    li.textContent = emptyLabel;
    list.append(li);
    return;
  }
  for (const entry of entries) {
    const li = document.createElement("li");
    li.textContent = entry;
    list.append(li);
  }
}

function renderReconciliationDetails(selected, selectedMonthDays) {
  const decorated = decoratedSummaryDays(selectedMonthDays).sort((a, b) => a.work_date.localeCompare(b.work_date));
  const grossDays = decorated.filter((day) => day.overtime_minutes > 0);
  const recoveryDays = selectedMonthDays
    .filter((day) => (day.actual_type || day.planned_type) === "absence" && day.absence_type === "recovery")
    .sort((a, b) => a.work_date.localeCompare(b.work_date));
  const gross = Number(selected.overtimeMinutes) || 0;
  const recovered = Number(selected.performanceRecoveryMinutes) || 0;
  const residual = Number(selected.netOvertimeMinutes) || 0;
  $("#summary-overtime-residual").textContent = minutesToDuration(residual);
  $("#summary-overtime-gross").textContent = minutesToDuration(gross);
  $("#summary-overtime-recovered").textContent = minutesToDuration(recovered);
  $("#summary-overtime-net").textContent = minutesToDuration(residual);
  fillHistoryList("#summary-overtime-gross-dates", grossDays.map((day) => `${shortDate(day.work_date)} · +${minutesToDuration(day.overtime_minutes)}`), "Nessuno straordinario maturato nel mese.");
  fillHistoryList("#summary-overtime-recovery-dates", recoveryDays.map((day) => `${shortDate(day.work_date)} · −${minutesToDuration(state.profile.target_minutes)}`), "Nessun recupero o compensazione nel mese.");

  const total = selected.mealVouchers === null ? "—" : String(selected.mealVouchers);
  const period = selected.mealVouchers === null
    ? "Non disponibile"
    : `${MONTH_NAMES[selected.mealVoucherSourceMonth]} ${selected.mealVoucherSourceYear}`;
  const adjustment = Number(selected.mealVoucherCompetenceAdjustments) || 0;
  const earnedAdjustment = Number(selected.mealVoucherEarnedAdjustments) || 0;
  $("#summary-meal-total").textContent = total;
  $("#summary-meal-period").textContent = period;
  $("#summary-meal-credited").textContent = total;
  $("#summary-meal-adjustment").textContent = adjustment > 0 ? `+${adjustment}` : String(adjustment);
  $("#summary-meal-earned").textContent = String(selected.mealVouchersEarned || 0);
  $("#summary-meal-earned-adjustment").textContent = earnedAdjustment > 0 ? `+${earnedAdjustment}` : String(earnedAdjustment);
  $("#meal-competence-note").textContent = selected.mealVouchers === null
    ? `Il valore di ${MONTH_NAMES[selected.month]} non è disponibile perché richiede giornate precedenti non presenti nell’account.`
    : `Il totale di ${MONTH_NAMES[selected.month]} deriva dalle giornate di ${period} e include le rettifiche interne già applicate.`;

  const sourcePrefix = `${selected.mealVoucherSourceYear}-${String(selected.mealVoucherSourceMonth + 1).padStart(2, "0")}`;
  const sourceDays = [...state.summaryPreviousYearDays, ...state.summaryYearDays]
    .filter((day) => String(day.work_date || "").startsWith(sourcePrefix))
    .sort((a, b) => a.work_date.localeCompare(b.work_date));
  const adjustments = sourceDays.flatMap((day) => {
    const baseline = baselineTicketForDay({ ...day, ticket_override: null });
    const applied = ticketForDay(state.profile, day);
    if (baseline === applied) return [];
    return [`${shortDate(day.work_date)} · ${applied ? "+1" : "−1"}`];
  });
  fillHistoryList("#summary-meal-adjustment-dates", adjustments, "Nessuna rettifica registrata per il periodo di competenza.");
}

function unresolvedHistoryGroups(yearDays) {
  const sorted = [...yearDays]
    .filter((day) => (day.actual_type || day.planned_type) === "absence")
    .sort((a, b) => a.work_date.localeCompare(b.work_date));
  const definitions = [
    { key: "leave", type: "leave", label: "Congedo non classificato (storico)", linked: false },
    { key: "mandatory_leave", type: "mandatory_leave", label: "Congedo obbligatorio (storico)", linked: false },
    { key: "child_sickness-unlinked", type: "child_sickness", label: "Malattia bambino · non collegato", linked: true },
    { key: "parental_leave-unlinked", type: "parental_leave", label: "Congedo parentale facoltativo · non collegato", linked: true },
    { key: "paternity_mandatory-unlinked", type: "paternity_mandatory", label: "Paternità obbligatoria · non collegato", linked: true },
    { key: "maternity_leave-unlinked", type: "maternity_leave", label: "Maternità obbligatoria · non collegato", linked: true },
    { key: "paternity_alternative-unlinked", type: "paternity_alternative", label: "Paternità alternativa · non collegato", linked: true }
  ];
  return definitions.map((definition) => ({
    ...definition,
    days: sorted.filter((day) => day.absence_type === definition.type && (!definition.linked || !day.child_id))
  })).filter((group) => group.days.length);
}

function unresolvedGroupCard(group) {
  const details = document.createElement("details");
  details.className = "trace-item unresolved-group";
  const summary = document.createElement("summary");
  const label = document.createElement("span");
  const count = document.createElement("strong");
  label.textContent = group.label;
  count.textContent = String(group.days.length);
  summary.append(label, count);
  const body = document.createElement("div");
  body.className = "trace-item-body";
  const copy = document.createElement("p");
  copy.textContent = "Verifica le giornate, quindi associa il figlio/evento o scegli la causale corretta.";
  const list = document.createElement("ul");
  for (const day of group.days) {
    const item = document.createElement("li");
    item.textContent = `${shortDate(day.work_date)} · ${ABSENCE_TYPES[day.absence_type] || day.absence_type}`;
    list.append(item);
  }
  const action = document.createElement("button");
  action.type = "button";
  action.className = "button secondary";
  action.textContent = `Sistema ${group.days.length} giornat${group.days.length === 1 ? "a" : "e"}`;
  action.addEventListener("click", () => openClassificationDialog(group));
  body.append(copy, list, action);
  details.append(summary, body);
  return details;
}

function renderHistoricalUnclassified(yearDays) {
  const groups = unresolvedHistoryGroups(yearDays);
  const total = groups.reduce((sum, group) => sum + group.days.length, 0);
  $("#legacy-history-disclosure").hidden = total === 0;
  $("#legacy-history-count").textContent = total === 1
    ? "1 giornata da associare o riclassificare"
    : `${total} giornate da associare o riclassificare`;
  $("#legacy-history-list").replaceChildren(...groups.map(unresolvedGroupCard));
}

const CLASSIFICATION_TARGETS = [
  "vacation", "sickness", "child_sickness", "parental_leave", "maternity_leave",
  "paternity_mandatory", "paternity_alternative", "marriage_leave", "recovery",
  "sunday_holiday_recovery", "holiday"
];

function selectedClassificationDays() {
  const selected = new Set($$("#classification-days input[type='checkbox']:checked").map((input) => input.value));
  return (state.classificationGroup?.days || []).filter((day) => selected.has(day.work_date));
}

function fillClassificationChildren(targetType, selectedValue = "") {
  const select = $("#classification-child-id");
  select.replaceChildren();
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "Seleziona figlio / evento";
  select.append(empty);
  for (const child of familyChildren().filter((item) => childInstituteEnabled(item, targetType))) {
    const option = document.createElement("option");
    option.value = child.id;
    option.textContent = child.name;
    select.append(option);
  }
  select.value = selectedValue;
}

function classificationCompatibilityErrors(days, targetType, childId) {
  const errors = [];
  if (!days.length) return ["Seleziona almeno una giornata."];
  if (!CHILD_LINKED_ABSENCE_TYPES.has(targetType)) return errors;
  const child = familyChildren().find((item) => item.id === childId);
  if (!child) return ["Seleziona un figlio/evento configurato per questa causale."];

  if (targetType === "paternity_mandatory") {
    const selectedDates = new Set(days.map((day) => day.work_date));
    const existing = state.childSicknessDays.filter((day) => day.child_id === child.id
      && day.absence_type === targetType && !selectedDates.has(day.work_date)).length;
    days.slice().sort((a, b) => a.work_date.localeCompare(b.work_date)).forEach((day, index) => {
      const entitlement = paternityMandatoryEntitlement(child, day.work_date, existing + index);
      if (!entitlement.eligible) errors.push(`${shortDate(day.work_date)}: ${entitlement.reason || "fuori dalla finestra prevista"}.`);
    });
    return errors;
  }

  for (const day of days) {
    if (targetType === "child_sickness" || targetType === "parental_leave") {
      const ageWindow = childSicknessEntitlement(child, day.work_date);
      if (!ageWindow.eligible) errors.push(`${shortDate(day.work_date)}: ${ageWindow.reason || "data non compatibile con l’età del figlio"}.`);
    } else if (targetType === "maternity_leave") {
      const entitlement = maternityMandatoryEntitlement(child, day.work_date, 0);
      if (!entitlement.eligible) errors.push(`${shortDate(day.work_date)}: ${entitlement.reason || "fuori dal periodo di maternità"}.`);
    }
  }
  return errors;
}

function updateClassificationPreview() {
  const targetType = $("#classification-absence-type").value;
  const linked = CHILD_LINKED_ABSENCE_TYPES.has(targetType);
  const currentChild = $("#classification-child-id").value;
  $("#classification-child-field").hidden = !linked;
  if (linked) fillClassificationChildren(targetType, currentChild);
  const days = selectedClassificationDays();
  const count = days.length;
  $("#classification-selection-count").textContent = `${count} giornat${count === 1 ? "a verrà" : "e verranno"} modificat${count === 1 ? "a" : "e"}`;
  const errors = classificationCompatibilityErrors(days, targetType, $("#classification-child-id").value);
  const errorBox = $("#classification-errors");
  errorBox.hidden = errors.length === 0;
  errorBox.replaceChildren(...errors.map((message) => Object.assign(document.createElement("p"), { textContent: message })));
  $("#apply-classification").disabled = errors.length > 0 || !$("#classification-confirm").checked;
}

function openClassificationDialog(group) {
  state.classificationGroup = group;
  $("#classification-title").textContent = group.label;
  const targetSelect = $("#classification-absence-type");
  targetSelect.replaceChildren(...CLASSIFICATION_TARGETS.map((type) => {
    const option = document.createElement("option");
    option.value = type;
    option.textContent = ABSENCE_TYPES[type] || type;
    return option;
  }));
  targetSelect.value = CLASSIFICATION_TARGETS.includes(group.type) ? group.type : "parental_leave";
  $("#classification-days").replaceChildren(...group.days.map((day) => {
    const label = document.createElement("label");
    label.className = "classification-day";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = day.work_date;
    input.checked = true;
    const copy = document.createElement("span");
    const date = document.createElement("strong");
    const cause = document.createElement("small");
    date.textContent = shortDate(day.work_date);
    cause.textContent = `Causale attuale: ${ABSENCE_TYPES[day.absence_type] || day.absence_type}`;
    copy.append(date, cause);
    label.append(input, copy);
    return label;
  }));
  $("#classification-confirm").checked = false;
  fillClassificationChildren(targetSelect.value);
  updateClassificationPreview();
  $("#classification-dialog").showModal();
}

async function applyClassification(event) {
  event.preventDefault();
  const days = selectedClassificationDays();
  const targetType = $("#classification-absence-type").value;
  const childId = CHILD_LINKED_ABSENCE_TYPES.has(targetType) ? $("#classification-child-id").value : null;
  const errors = classificationCompatibilityErrors(days, targetType, childId);
  if (errors.length || !$("#classification-confirm").checked) return updateClassificationPreview();
  const before = days.map((day) => structuredClone(state.days.get(day.work_date) || day));
  const updates = before.map((day) => normalizeDay({
    ...day,
    planned_type: "absence",
    actual_type: "absence",
    absence_type: targetType,
    child_id: childId,
    ticket_override: null,
    events: []
  }));
  const button = $("#apply-classification");
  button.disabled = true;
  button.textContent = "Aggiornamento…";
  for (const day of updates) await saveDay(day, { silent: true });
  state.classificationGroup = null;
  $("#classification-dialog").close();
  button.textContent = "Conferma modifica";
  renderSummary();
  showToast(`${updates.length} giornat${updates.length === 1 ? "a aggiornata" : "e aggiornate"}. Saldi e plafond ricalcolati.`, async () => {
    for (const day of before) await saveDay(day, { silent: true });
    renderSummary();
    showToast("Riclassificazione annullata: lo storico precedente è stato ripristinato.");
  });
}

function renderTraceabilityLedger(yearDays, year) {
  const sorted = reconcileChildSicknessDays(yearDays, familyChildren())
    .sort((a, b) => a.work_date.localeCompare(b.work_date));
  const balance = annualLeaveBalanceForYear(year);
  const recovery = sundayHolidayBalance(year);
  const vacations = sorted.filter((day) => (day.actual_type || day.planned_type) === "absence" && day.absence_type === "vacation");
  const previousVacation = vacations.slice(0, balance.vacation.previous.used);
  const currentVacation = vacations.slice(balance.vacation.previous.used);
  const suppressed = sorted.filter((day) => isSuppressedHolidayDay(day, sundayHolidayContract().local_holiday));
  const publicHolidays = sorted.filter((day) => (day.actual_type || day.planned_type) === "absence"
    && day.absence_type === "holiday" && !isSuppressedHolidayDay(day, sundayHolidayContract().local_holiday));
  const usedRecovery = sorted.filter((day) => (day.actual_type || day.planned_type) === "absence"
    && day.absence_type === "sunday_holiday_recovery");

  const items = [];
  if (balance.vacation.previous.total || previousVacation.length) items.push({
    label: "Ferie anno precedente",
    value: `${balance.vacation.previous.used} / ${balance.vacation.previous.total}`,
    entries: previousVacation.map((day) => shortDate(day.work_date)),
    note: "Le prime giornate dell’anno consumano il riporto."
  });
  if (balance.vacation.current.total || currentVacation.length) items.push({
    label: "Ferie anno corrente",
    value: `${balance.vacation.current.used} / ${balance.vacation.current.total}`,
    entries: currentVacation.map((day) => shortDate(day.work_date)),
    note: `${balance.vacation.current.remaining} giorni disponibili.`
  });
  if (balance.suppressedHolidays.total || suppressed.length) items.push({
    label: "Festività soppresse",
    value: `${balance.suppressedHolidays.used} / ${balance.suppressedHolidays.total}`,
    entries: suppressed.map((day) => shortDate(day.work_date)),
    note: `${balance.suppressedHolidays.remaining} giorni disponibili.`
  });
  if (recovery.accrued || recovery.used) items.push({
    label: "Recupero riposo festività",
    value: `${recovery.used} / ${recovery.accrued}`,
    entries: usedRecovery.map((day) => shortDate(day.work_date)),
    note: `${recovery.available} ancora disponibili secondo la regola contrattuale configurata.`
  });
  if (publicHolidays.length) items.push({
    label: "Festività riconosciute",
    value: String(publicHolidays.length),
    entries: publicHolidays.map((day) => shortDate(day.work_date))
  });

  for (const [type, label] of TRACE_ABSENCE_TYPES) {
    const days = sorted.filter((day) => (day.actual_type || day.planned_type) === "absence" && day.absence_type === type);
    if (days.length) items.push({ label, value: String(days.length), entries: days.map((day) => shortDate(day.work_date)) });
  }

  for (const child of familyChildren()) {
    const activeSickness = childSicknessEntitlement(child, new Date());
    if (activeSickness.eligible && childInstituteEnabled(child, "child_sickness")) {
      const sicknessDays = sorted.filter((day) => day.absence_type === "child_sickness"
        && day.child_id === child.id && day.work_date >= activeSickness.periodStart && day.work_date <= activeSickness.periodEnd);
      const outside = Number(child.external_usage?.[activeSickness.periodKey] || 0);
      const used = sicknessDays.length + outside;
      const limit = activeSickness.tier === "under_three" ? activeSickness.paidDaysLimit : activeSickness.totalDaysLimit;
      const periodLabel = activeSickness.tier === "under_three" ? `${activeSickness.lifeYear}° anno di vita` : `anno ${activeSickness.periodStart.slice(0, 4)}`;
      items.push({
        label: `Malattia bambino · ${child.name} · ${periodLabel}`,
        value: `${used} / ${limit}`,
        entries: sicknessDays.map((day) => `${shortDate(day.work_date)}${day.child_link_reconciled ? " · riconciliata dallo storico" : ""}`),
        note: `${Math.max(0, limit - used)} giorni disponibili · periodo ${activeSickness.periodStart}–${activeSickness.periodEnd}${outside ? ` · ${outside} registrati fuori app` : ""}.`
      });
    }

    const linkedTypes = [
      ["parental_leave", "Congedo parentale facoltativo"],
      ["maternity_leave", "Maternità obbligatoria"],
      ["paternity_mandatory", "Paternità obbligatoria"],
      ["paternity_alternative", "Paternità alternativa"]
    ];
    for (const [type, label] of linkedTypes) {
      const days = sorted.filter((day) => day.absence_type === type && day.child_id === child.id);
      const configured = childInstituteEnabled(child, type);
      if (["maternity_leave", "paternity_mandatory", "paternity_alternative"].includes(type)
        && !roleAllowsAbsenceType(type, sorted)) continue;
      if (!configured && !days.length) continue;
      let value = String(days.length);
      let note = "Evento separato e collegato al figlio selezionato.";
      let applicableWithoutUsage = configured;
      if (type === "paternity_mandatory") {
        const entitlement = paternityMandatoryEntitlement(child, `${year}-12-31`, days.length);
        value = `${days.length} / ${entitlement.totalDays}`;
        note = `${entitlement.remainingDays} residui · termine ${entitlement.windowEnd} · ${entitlement.status === "expired" ? `${entitlement.expiredUnusedDays} non più fruibili` : entitlement.status}.`;
        applicableWithoutUsage = ["active", "upcoming"].includes(entitlement.status);
      } else if (type === "maternity_leave") {
        const entitlement = maternityMandatoryEntitlement(child, `${year}-12-31`, days.length);
        value = `${days.length} giorni · ${entitlement.mode}`;
        note = `Periodo ${entitlement.windowStart}–${entitlement.windowEnd} · ${entitlement.status}${entitlement.requiresCertification ? " · certificazione richiesta" : ""}.`;
        applicableWithoutUsage = ["active", "upcoming"].includes(entitlement.status);
      } else if (type === "parental_leave") {
        applicableWithoutUsage = configured;
        note = `Utilizzi registrati; termine indicativo ${addYears(child.birth_date, 14)}.`;
      } else if (type === "paternity_alternative") {
        applicableWithoutUsage = configured || paternityAlternativeEnabled();
        note = "Mostrata perché attivata esplicitamente o già utilizzata.";
      }
      if (days.length || applicableWithoutUsage) {
        items.push({ label: `${label} · ${child.name}`, value, entries: days.map((day) => shortDate(day.work_date)), note });
      }
    }
  }

  $("#traceability-list").replaceChildren(...items.map(traceDetails));
  renderHistoricalUnclassified(yearDays);
}

function renderProjectSummary(selectedYear, start, end) {
  const disclosure = $("#summary-projects");
  if (!disclosure) return;
  disclosure.hidden = !projectsEnabled();
  if (disclosure.hidden) return;
  const monthAllocations = allAllocations().filter((allocation) => allocation.work_date >= start && allocation.work_date <= end);
  const monthTotal = monthAllocations.reduce((total, allocation) => total + allocation.duration_minutes, 0);
  $("#summary-projects-total").textContent = minutesToDuration(monthTotal);
  const worked = [...state.days.values()]
    .filter((day) => day.work_date >= start && day.work_date <= end)
    .reduce((total, day) => total + calculateTrackedDay(day, calculationNow(day)).ordinaryWorkedMinutes, 0);
  const balance = allocationBalanceCopy(monthTotal, worked);
  $("#summary-projects-caption").textContent = `${minutesToDuration(monthTotal)} allocate su ${minutesToDuration(worked)} lavorate · ${balance.label}.`;

  const byProject = new Map();
  monthAllocations.forEach((allocation) => byProject.set(allocation.project_id, (byProject.get(allocation.project_id) || 0) + allocation.duration_minutes));
  const projectRows = [...byProject.entries()].sort((a, b) => b[1] - a[1]).map(([projectId, minutes]) => {
    const row = document.createElement("div");
    row.className = "project-hours-row";
    const name = document.createElement("span");
    name.textContent = projectLabel(state.projects.get(projectId));
    const value = document.createElement("strong");
    value.textContent = minutesToDuration(minutes);
    row.append(name, value);
    return row;
  });
  if (!projectRows.length) {
    const empty = document.createElement("p");
    empty.className = "empty-allocation-copy";
    empty.textContent = "Nessuna ora allocata nel mese selezionato.";
    projectRows.push(empty);
  }
  $("#summary-project-hours").replaceChildren(...projectRows);

  const monthTotals = Array.from({ length: 12 }, () => 0);
  allAllocations().forEach((allocation) => {
    if (!allocation.work_date.startsWith(`${selectedYear}-`)) return;
    monthTotals[Number(allocation.work_date.slice(5, 7)) - 1] += allocation.duration_minutes;
  });
  const maximum = Math.max(1, ...monthTotals);
  $("#summary-project-trend").replaceChildren(...monthTotals.map((minutes, month) => {
    const bar = document.createElement("div");
    bar.className = "project-trend-item";
    bar.setAttribute("aria-label", `${MONTH_NAMES[month]}: ${minutesToDuration(minutes)}`);
    const value = document.createElement("span");
    value.className = "project-trend-value";
    value.style.height = `${Math.max(minutes ? 8 : 2, (minutes / maximum) * 88)}px`;
    value.title = minutesToDuration(minutes);
    const label = document.createElement("small");
    label.textContent = MONTH_NAMES[month].slice(0, 3);
    bar.append(value, label);
    return bar;
  }));

  const byDate = new Map();
  monthAllocations.forEach((allocation) => byDate.set(allocation.work_date, (byDate.get(allocation.work_date) || 0) + allocation.duration_minutes));
  const dayLinks = [...byDate.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, minutes]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "project-day-link";
    button.innerHTML = `<span>${shortDate(date)}</span><strong>${minutesToDuration(minutes)}</strong>`;
    button.addEventListener("click", () => openDayDialog(date));
    return button;
  });
  if (!dayLinks.length) {
    const empty = document.createElement("p");
    empty.className = "empty-allocation-copy";
    empty.textContent = "Nessuna giornata da aprire.";
    dayLinks.push(empty);
  }
  $("#summary-project-days").replaceChildren(...dayLinks);
}

function renderSummary() {
  if (!state.user) return;
  renderMonthSelector("summary", state.summaryMonth);
  const selectedYear = state.summaryMonth.getFullYear();
  const selectedMonthName = MONTH_NAMES[state.summaryMonth.getMonth()];
  $("#summary-period-title").textContent = `${selectedMonthName} ${selectedYear}`;
  $("#summary-period-caption").textContent = "Valori essenziali, giornate e assenze del mese selezionato.";
  const rows = summaryRowsForYear(selectedYear);
  const selected = rows[state.summaryMonth.getMonth()];
  const { start, end } = monthBounds(state.summaryMonth);
  const sourceDays = state.summaryYearLoaded === selectedYear ? state.summaryYearDays : [...state.days.values()];
  const days = sourceDays.filter((day) => day.work_date >= start && day.work_date <= end);
  const totals = { office: 0, smart: 0, travel: 0, absence: 0, saturday: 0, absenceTypes: {} };
  for (const day of days) {
    const effectiveType = day.actual_type || day.planned_type || "office";
    const absenceType = day.absence_type || "leave";
    if (effectiveType === "absence" && absenceType === "holiday"
      && !isSuppressedHolidayDay(day, sundayHolidayContract().local_holiday)) continue;
    totals[effectiveType] = (totals[effectiveType] || 0) + 1;
    if (isWorkingSaturday(day)) totals.saturday += 1;
    if (effectiveType === "absence") {
      totals.absenceTypes[absenceType] = (totals.absenceTypes[absenceType] || 0) + 1;
    }
  }

  const overtimeConfigured = state.profile.overtime_threshold > 0
    && (workModeEnabled("office") || overtimeSettings().smart || overtimeSettings().travel);
  const overtimeRelevant = overtimeConfigured || rows.some((row) => row.overtimeMinutes || row.performanceRecoveryMinutes || row.netOvertimeMinutes);
  const mealConfigured = state.profile.ticket_office || state.profile.ticket_smart || state.profile.ticket_travel;
  const mealRelevant = mealConfigured || rows.some((row) => Number(row.mealVouchers) || Number(row.mealVoucherCompetenceAdjustments));
  const cards = [
    ["Ore lavorate", minutesToDuration(selected.workedMinutes)],
    ...(overtimeRelevant ? [["Straordinario", minutesToDuration(selected.netOvertimeMinutes)]] : []),
    ...(mealRelevant ? [["Buoni pasto", selected.mealVouchers === null ? "—" : String(selected.mealVouchers)]] : [])
  ];
  $("#summary-cards").replaceChildren(...cards.map(([label, value]) => {
    const card = document.createElement("article");
    card.className = "summary-card summary-card-primary";
    const span = document.createElement("span");
    span.textContent = label;
    const strong = document.createElement("strong");
    strong.textContent = value;
    card.append(span, strong);
    return card;
  }));

  $("#summary-overtime").hidden = !overtimeRelevant;
  $("#summary-meal-vouchers").hidden = !mealRelevant;
  renderMonthDetail(selected, rows);
  renderReconciliationDetails(selected, days);
  renderFamilyLimits(selectedYear);
  renderProjectSummary(selectedYear, start, end);

  const maximum = Math.max(1, totals.office, totals.smart, totals.travel, totals.absence, totals.saturday);
  const distributionRows = [
    ["Ufficio", totals.office, workModeEnabled("office")],
    ["Smart", totals.smart, workModeEnabled("smart")],
    ["Trasferta", totals.travel, workModeEnabled("travel")],
    ["Assenza", totals.absence, true],
    ["Sabato lavorativo", totals.saturday, applicabilitySettings().work_modes.saturday]
  ].filter(([, count, configured]) => configured || count > 0);
  $("#summary-distribution-panel").hidden = !summaryPreferences().show_distribution;
  $("#summary-types").replaceChildren(...distributionRows.map(([label, count]) => {
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
  renderAnnualLeaveBalance(selectedYear);
  renderRecoveryBalance("summary", state.summaryMonth.getFullYear());
  renderTraceabilityLedger(yearDays, selectedYear);
  $("#annual-history-disclosure").hidden = !summaryPreferences().show_annual_table;
}

function renderChildren() {
  const list = $("#children-list");
  list.replaceChildren();
  const children = familyChildren();
  const roleLabels = { father: "Padre", mother: "Madre", custom: "Personalizzato", unspecified: "Da configurare" };
  setSettingsSummary("family-settings-summary", children.length
    ? `${children.length} event${children.length === 1 ? "o" : "i"} · ${roleLabels[parentalRole()]}`
    : `Nessun figlio · ${roleLabels[parentalRole()]}`);
  if (!children.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state compact";
    empty.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3.5 20v-2.5A4.5 4.5 0 0 1 8 13h2a4.5 4.5 0 0 1 4.5 4.5V20M17 8v6m-3-3h6"/></svg><strong>Nessun figlio o evento configurato</strong><span>Aggiungi solo gli istituti che vuoi monitorare.</span>';
    list.append(empty);
    return;
  }

  const role = parentalRole();
  children.forEach((child) => {
    const institutes = childInstitutes(child);
    const row = document.createElement("div");
    row.className = "child-row";
    const info = document.createElement("div");
    info.className = "child-info";
    const name = document.createElement("strong");
    name.textContent = child.name;
    const date = document.createElement("span");
    date.textContent = child.birth_date ? `Evento del ${new Intl.DateTimeFormat("it-IT").format(new Date(`${child.birth_date}T12:00:00`))}` : "Data non indicata";
    info.append(name, date);

    const fieldset = document.createElement("fieldset");
    fieldset.className = "settings-choice child-institutes-choice existing-child-institutes";
    const legend = document.createElement("legend");
    legend.textContent = "Istituti attivi";
    fieldset.append(legend);
    const instituteOptions = [
      ["child_sickness", "Malattia bambino", true],
      ["parental_leave", "Congedo parentale", true],
      ["maternity_leave", "Maternità obbligatoria", role === "mother" || role === "custom"],
      ["paternity_mandatory", "Paternità obbligatoria", role === "father" || role === "custom"],
      ["paternity_alternative", "Paternità alternativa", role === "father" || role === "custom"]
    ];
    for (const [type, label, applicable] of instituteOptions) {
      const hasData = childAbsenceCount(child.id, type) > 0;
      if (!applicable && !hasData) continue;
      const control = document.createElement("label");
      control.className = "check-row";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = institutes[type];
      input.addEventListener("change", () => {
        child.institutes = { ...childInstitutes(child), [type]: input.checked };
        renderChildren();
        applyApplicabilityToUi();
        announce(`${label} ${input.checked ? "attivato" : "disattivato"}. Salva le impostazioni per confermare.`);
      });
      const copy = document.createElement("span");
      copy.textContent = hasData && !applicable ? `${label} · storico presente` : label;
      control.append(input, copy);
      fieldset.append(control);
    }
    info.append(fieldset);

    if (institutes.child_sickness || childAbsenceCount(child.id, "child_sickness") > 0) {
      const entitlementPreview = childSicknessEntitlement(child, new Date());
      const policy = document.createElement("p");
      policy.className = "child-policy";
      if (entitlementPreview.eligible) {
        const inApp = childAbsenceCount(child.id, "child_sickness", entitlementPreview.periodStart, entitlementPreview.periodEnd);
        const outside = Number(child.external_usage?.[entitlementPreview.periodKey] || 0);
        const entitlement = childSicknessEntitlement(child, new Date(), inApp, outside);
        policy.textContent = entitlement.tier === "under_three"
          ? `Malattia bambino: ${entitlement.remainingPaidDays}/30 giorni retribuiti residui nel ${entitlement.lifeYear}° anno di vita.`
          : `Malattia bambino: ${entitlement.remainingDays}/10 giorni lavorativi residui nel ${entitlement.periodStart.slice(0, 4)}.`;
        const usageField = document.createElement("div");
        usageField.className = "child-usage-field";
        const usageLabel = document.createElement("label");
        const usageId = `child-usage-${child.id}`;
        usageLabel.htmlFor = usageId;
        usageLabel.textContent = "Giorni usati fuori app nel periodo";
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
        info.append(policy, usageField);
      } else {
        policy.textContent = entitlementPreview.reason || "Nessun plafond calcolabile per la data odierna.";
        info.append(policy);
      }
    }

    if (institutes.parental_leave || childAbsenceCount(child.id, "parental_leave") > 0) {
      const quota = parentalQuotaForChild(child);
      const quotaPanel = document.createElement("div");
      quotaPanel.className = "parental-quota-settings";
      const quotaCopy = document.createElement("p");
      quotaCopy.className = "child-policy";
      quotaCopy.textContent = quota.valid
        ? `Quota personale: ${quota.requestedMonths} mesi = ${quota.requestedDays} giorni. Limite legale applicabile: massimo ${quota.maximumForPersonalQuota} mesi.`
        : `${quota.reason} Il limite di legge non viene aumentato dalla quota scelta.`;

      const quotaField = document.createElement("div");
      quotaField.className = "child-usage-field";
      const quotaLabel = document.createElement("label");
      const quotaId = `parental-quota-${child.id}`;
      quotaLabel.htmlFor = quotaId;
      quotaLabel.textContent = "Congedo parentale che voglio monitorare/usare (mesi)";
      const quotaInput = document.createElement("input");
      quotaInput.id = quotaId;
      quotaInput.type = "number";
      quotaInput.min = "0.5";
      quotaInput.max = "11";
      quotaInput.step = "0.5";
      quotaInput.value = child.parental_leave_quota_months || "";
      quotaInput.addEventListener("change", () => {
        child.parental_leave_quota_months = Number(quotaInput.value) || null;
        const validation = parentalQuotaForChild(child);
        if (!validation.valid) {
          showToast(validation.reason);
          quotaInput.focus();
          return;
        }
        renderChildren();
        announce("Quota personale aggiornata. Salva le impostazioni per confermare.");
      });
      quotaField.append(quotaLabel, quotaInput);

      const singleControl = document.createElement("label");
      singleControl.className = "check-row";
      const singleInput = document.createElement("input");
      singleInput.type = "checkbox";
      singleInput.checked = child.parental_leave_single_parent === true;
      singleInput.addEventListener("change", () => {
        child.parental_leave_single_parent = singleInput.checked;
        renderChildren();
      });
      singleControl.append(singleInput, Object.assign(document.createElement("span"), { textContent: "Genitore solo per questo figlio/evento" }));

      const threeControl = document.createElement("label");
      threeControl.className = "check-row";
      const threeInput = document.createElement("input");
      threeInput.type = "checkbox";
      threeInput.checked = role === "father"
        ? child.parental_leave_father_three_months === true
        : child.parental_leave_other_parent_three_months === true;
      threeInput.addEventListener("change", () => {
        if (role === "father") child.parental_leave_father_three_months = threeInput.checked;
        else child.parental_leave_other_parent_three_months = threeInput.checked;
        renderChildren();
      });
      threeControl.append(threeInput, Object.assign(document.createElement("span"), {
        textContent: role === "father" ? "Fruisco di almeno 3 mesi" : "Il padre fruisce di almeno 3 mesi"
      }));

      const otherField = document.createElement("div");
      otherField.className = "child-usage-field";
      const otherLabel = document.createElement("label");
      const otherId = `parental-other-${child.id}`;
      otherLabel.htmlFor = otherId;
      otherLabel.textContent = "Mesi già fruiti dall’altro genitore";
      const otherInput = document.createElement("input");
      otherInput.id = otherId;
      otherInput.type = "number";
      otherInput.min = "0";
      otherInput.max = "11";
      otherInput.step = "0.5";
      otherInput.value = String(child.parental_leave_other_parent_months || 0);
      otherInput.addEventListener("change", () => {
        child.parental_leave_other_parent_months = Math.max(0, Number(otherInput.value) || 0);
        renderChildren();
      });
      otherField.append(otherLabel, otherInput);
      quotaPanel.append(quotaCopy, quotaField, singleControl, threeControl, otherField);
      info.append(quotaPanel);
    }

    if ((role === "father" || role === "custom") && (institutes.paternity_mandatory || childAbsenceCount(child.id, "paternity_mandatory") > 0)) {
      const used = childAbsenceCount(child.id, "paternity_mandatory");
      const entitlement = paternityMandatoryEntitlement(child, new Date(), used);
      const copy = document.createElement("p");
      copy.className = "child-policy event-policy";
      copy.textContent = `Paternità obbligatoria: ${used}/${entitlement.totalDays}, residui ${entitlement.remainingDays} · termine ${entitlement.windowEnd} · ${entitlement.status}.`;
      info.append(copy);
    }

    if ((role === "mother" || role === "custom") && (institutes.maternity_leave || childAbsenceCount(child.id, "maternity_leave") > 0)) {
      const used = childAbsenceCount(child.id, "maternity_leave");
      const entitlement = maternityMandatoryEntitlement(child, new Date(), used);
      const copy = document.createElement("p");
      copy.className = "child-policy event-policy";
      copy.textContent = `Maternità ${entitlement.mode}: ${used} giornate registrate · ${entitlement.windowStart}–${entitlement.windowEnd} · ${entitlement.status}.`;
      const modeField = document.createElement("div");
      modeField.className = "child-usage-field";
      const modeLabel = document.createElement("label");
      const modeId = `maternity-mode-${child.id}`;
      modeLabel.htmlFor = modeId;
      modeLabel.textContent = "Modalità maternità";
      const modeSelect = document.createElement("select");
      modeSelect.id = modeId;
      [["2+3", "2+3 · ordinaria"], ["1+4", "1+4 · flessibile"], ["0+5", "0+5 · dopo il parto"]].forEach(([value, label]) => {
        const option = document.createElement("option"); option.value = value; option.textContent = label; modeSelect.append(option);
      });
      modeSelect.value = entitlement.mode;
      modeSelect.addEventListener("change", () => {
        if (used > 0 && !window.confirm(`Sono già registrate ${used} giornate di maternità per ${child.name}. Il periodo verrà ricalcolato senza cancellare le giornate. Continuare?`)) {
          modeSelect.value = entitlement.mode;
          return;
        }
        child.maternity_mode = modeSelect.value;
        renderChildren();
        announce("Modalità di maternità aggiornata. Salva le impostazioni per confermare.");
      });
      modeField.append(modeLabel, modeSelect);
      info.append(copy, modeField);
    }

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

function leaveSettingsDraft() {
  const settings = annualLeaveSettings();
  const year = clampInt($("#leave-settings-year")?.value, 2000, 2100, new Date().getFullYear());
  const overrideValue = $("#leave-carryover-override")?.value;
  return {
    ...settings,
    years: {
      ...settings.years,
      [String(year)]: {
        vacation_days: clampInt($("#leave-current-days")?.value, 0, 366, settings.default_vacation_days),
        suppressed_holiday_days: clampInt($("#leave-suppressed-days")?.value, 0, 366, settings.default_suppressed_holiday_days),
        carryover_override: overrideValue === "" || overrideValue === undefined ? null : clampInt(overrideValue, 0, 366, 0)
      }
    }
  };
}

function fillLeaveSettingsFields(year) {
  const settings = annualLeaveSettings();
  const annual = settings.years[String(year)] || {};
  const resolved = annualLeaveBalance({ year, days: [], settings });
  $("#leave-current-days").value = String(resolved.vacation.current.total);
  $("#leave-suppressed-days").value = String(resolved.suppressedHolidays.total);
  $("#leave-carryover-override").value = annual.carryover_override === null || annual.carryover_override === undefined
    ? ""
    : String(clampInt(annual.carryover_override, 0, 366, 0));
  updateLeaveSettingsPreview();
}

function updateLeaveSettingsPreview() {
  const year = clampInt($("#leave-settings-year")?.value, 2000, 2100, new Date().getFullYear());
  const output = $("#leave-carryover-preview");
  if (!output) return;
  if (state.summaryYearLoaded !== year) {
    output.textContent = "Calcolo in corso…";
    return;
  }
  const balance = annualLeaveBalanceForYear(year, leaveSettingsDraft());
  output.textContent = `${balance.vacation.previous.total} giorn${balance.vacation.previous.total === 1 ? "o" : "i"}`;
}

function setSettingsSummary(id, text) {
  const target = $(`#${id}`);
  if (target) target.textContent = text;
}

function updateSettingsSummaries() {
  const hours = clampInt($("#target-hours")?.value, 1, 15, 7);
  const minutes = clampInt($("#target-minutes")?.value, 0, 59, 36);
  setSettingsSummary("profile-settings-summary", `${hours}h ${String(minutes).padStart(2, "0")}m · pause ${clampInt($("#office-break")?.value, 0, 240, 30)}/${clampInt($("#smart-break")?.value, 0, 240, 60)}/${clampInt($("#travel-break")?.value, 0, 240, 30)} min`);
  const modeLabels = [["#mode-office", "Ufficio"], ["#mode-smart", "Smart"], ["#mode-travel", "Trasferta"], ["#mode-saturday", "Sabato"]]
    .filter(([selector]) => $(selector)?.checked).map(([, label]) => label);
  const smartOvertime = $("#overtime-smart")?.checked ? "Smart con straordinario" : "Smart con uscita automatica";
  setSettingsSummary("work-mode-settings-summary", `${modeLabels.length ? modeLabels.join(" · ") : "Nessuna modalità attiva"} · soglia ${clampInt($("#overtime-threshold")?.value, 0, 240, 10)} min · ${smartOvertime}`);
  const leaveYear = clampInt($("#leave-settings-year")?.value, 2000, 2100, new Date().getFullYear());
  const leaveSummaryBase = `${clampInt($("#leave-current-days")?.value, 0, 366, 20)} ferie · ${clampInt($("#leave-suppressed-days")?.value, 0, 366, 4)} festività soppresse · ${leaveYear}`;
  const ticketLabels = [
    ["#ticket-office", "Ufficio"], ["#ticket-smart", "Smart"], ["#ticket-travel", "Trasferta"]
  ].filter(([selector]) => $(selector)?.checked).map(([, label]) => label);
  setSettingsSummary("ticket-settings-summary", ticketLabels.length ? `Attivi: ${ticketLabels.join(", ")}` : "Nessun buono automatico");
  setSettingsSummary("notification-settings-summary", $("#exit-notification-enabled")?.checked
    ? `Attiva · ${$("#exit-notification-lead")?.selectedOptions?.[0]?.textContent || "orario previsto"}`
    : "Disattivata");
  const projectsOn = $("#projects-enabled")?.checked;
  const activeProjects = [...state.projects.values()].filter((project) => project.is_active).length;
  setSettingsSummary("project-settings-summary", projectsOn
    ? `${activeProjects} commess${activeProjects === 1 ? "a attiva" : "e attive"}`
    : "Funzione disattivata");
  const childCount = familyChildren().length;
  const roleLabels = { father: "Padre", mother: "Madre", custom: "Personalizzato", unspecified: "Da configurare" };
  setSettingsSummary("family-settings-summary", `${roleLabels[$("#parental-role")?.value || parentalRole()]} · ${childCount} event${childCount === 1 ? "o" : "i"}`);
  const absenceLabels = [["#feature-sickness", "Malattia"], ["#feature-marriage", "Matrimoniale"], ["#feature-performance-recovery", "Recuperi"]]
    .filter(([selector]) => $(selector)?.checked).map(([, label]) => label);
  setSettingsSummary("absence-settings-summary", absenceLabels.length ? absenceLabels.join(" · ") : "Solo causali già usate");
  const summaryLabels = [];
  if ($("#summary-show-distribution")?.checked) summaryLabels.push("Distribuzione");
  if ($("#summary-show-annual-table")?.checked) summaryLabels.push("Storico annuale");
  setSettingsSummary("summary-preferences-summary", summaryLabels.length ? summaryLabels.join(" · ") : "Vista essenziale");
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
  setSettingsSummary("leave-settings-summary", `${leaveSummaryBase} · ${ruleLabels[rule]}`);
}

function causeHasUsage(type) {
  return [...state.days.values(), ...state.summaryYearDays, ...state.childSicknessDays]
    .some((day) => (day.actual_type || day.planned_type) === "absence" && day.absence_type === type);
}

function updateParentalRoleUi() {
  const role = $("#parental-role")?.value || parentalRole();
  const showMother = role === "mother" || role === "custom";
  const showFather = role === "father" || role === "custom";
  if ($("#child-maternity-mode-field")) $("#child-maternity-mode-field").hidden = !showMother;
  if ($("#child-multiple-birth-field")) $("#child-multiple-birth-field").hidden = !showFather;
  if ($("#alternative-paternity-field")) $("#alternative-paternity-field").hidden = !showFather;
  if ($("#child-enable-maternity-field")) $("#child-enable-maternity-field").hidden = !showMother;
  if ($("#child-enable-paternity-field")) $("#child-enable-paternity-field").hidden = !showFather;
  if ($("#child-enable-paternity-alternative-field")) $("#child-enable-paternity-alternative-field").hidden = !showFather;
  updateNewChildParentalSettings();
}

function newChildParentalQuotaDraft() {
  const role = $("#parental-role")?.value || parentalRole();
  return parentalLeaveMonitoringQuota({
    role,
    requestedMonths: $("#child-parental-quota-months")?.value,
    singleParent: $("#child-parental-single-parent")?.checked === true,
    fatherAtLeastThreeMonths: role === "father" && $("#child-parental-father-three")?.checked === true,
    otherParentAtLeastThreeMonths: role !== "father" && $("#child-parental-father-three")?.checked === true,
    otherParentMonths: $("#child-parental-other-months")?.value
  });
}

function updateNewChildParentalSettings() {
  const panel = $("#child-parental-settings");
  if (!panel) return;
  const enabled = $("#child-enable-parental")?.checked === true;
  panel.hidden = !enabled;
  const input = $("#child-parental-quota-months");
  if (!enabled) {
    input.required = false;
    input.setCustomValidity("");
    return;
  }
  input.required = true;
  const quota = newChildParentalQuotaDraft();
  input.setCustomValidity(quota.valid ? "" : quota.reason);
  const preview = $("#child-parental-limit-preview");
  preview.textContent = quota.valid
    ? `Quota personale: ${quota.requestedMonths} mesi = ${quota.requestedDays} giorni. Limite legale applicabile: ${quota.maximumForPersonalQuota} mesi; limite complessivo di coppia: ${quota.coupleMaximum} mesi.`
    : `${quota.reason} La quota scelta non modifica il limite di legge.`;
}

function applyApplicabilityToUi() {
  setProjectFeatureVisibility();
  const locationButtons = $$(".location-option");
  locationButtons.forEach((button) => {
    const enabled = workModeEnabled(button.dataset.location);
    button.hidden = !enabled;
    button.disabled = !enabled;
  });
  const locationChoice = $(".location-choice");
  if (locationChoice) {
    const visibleLocations = Math.max(1, locationButtons.filter((button) => !button.hidden).length);
    locationChoice.style.setProperty("--location-columns", String(visibleLocations));
  }
  for (const selector of ["#today-planned-type", "#today-actual-type", "#bulk-type", "#day-planned-type", "#day-actual-type"]) {
    const select = $(selector);
    if (!select) continue;
    const selected = select.value;
    for (const option of select.options) {
      if (!["office", "smart", "travel"].includes(option.value)) continue;
      const used = [...state.days.values()].some((day) => (day.actual_type || day.planned_type) === option.value);
      const visible = workModeEnabled(option.value) || used || option.value === selected;
      option.hidden = !visible;
      option.disabled = !visible;
    }
  }
  for (const selector of ["#today-absence-type", "#day-absence-type"]) {
    const select = $(selector);
    if (!select) continue;
    const selected = select.value;
    for (const option of select.options) {
      const type = option.value;
      const historicalOnly = ["mandatory_leave", "leave"].includes(type);
      const familyType = ["maternity_leave", "paternity_mandatory", "paternity_alternative"].includes(type);
      const visible = type === selected || causeHasUsage(type)
        || (!historicalOnly && absenceFeatureEnabled(type) && (!familyType || roleAllowsAbsenceType(type)));
      option.hidden = !visible;
      option.disabled = !visible;
    }
  }
  const overtimeRelevant = state.profile.overtime_threshold > 0
    && (workModeEnabled("office") || overtimeSettings().smart || overtimeSettings().travel);
  if ($("#today-overtime-card")) $("#today-overtime-card").hidden = !overtimeRelevant;
  const ticketRelevant = state.profile.ticket_office || state.profile.ticket_smart || state.profile.ticket_travel;
  if ($("#today-ticket-card")) $("#today-ticket-card").hidden = !ticketRelevant;
}

function renderProjectSettings(enabledOverride = null) {
  const enabled = enabledOverride === null ? projectsEnabled() : enabledOverride;
  const draftDefaultProjectId = enabledOverride === null ? "" : $("#default-project")?.value || "";
  $("#projects-enabled").checked = enabled;
  $("#project-settings-content").hidden = !enabled;
  const list = $("#project-list");
  const projects = [...state.projects.values()].sort((left, right) => {
    if (left.is_active !== right.is_active) return left.is_active ? -1 : 1;
    return left.code.localeCompare(right.code, "it", { numeric: true });
  });
  if (!projects.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state compact project-empty-state";
    empty.innerHTML = '<strong>Nessuna commessa configurata</strong><span>Aggiungi codice e descrizione breve per iniziare.</span>';
    list.replaceChildren(empty);
  } else {
    list.replaceChildren(...projects.map((project) => {
      const row = document.createElement("div");
      row.className = `project-admin-row${project.is_active ? "" : " archived"}`;
      const copy = document.createElement("div");
      copy.className = "project-admin-copy";
      const title = document.createElement("strong");
      title.textContent = project.code;
      const description = document.createElement("span");
      description.textContent = project.description;
      const status = document.createElement("small");
      status.textContent = project.is_active ? "Attiva" : "Archiviata · storico conservato";
      copy.append(title, description, status);
      const action = document.createElement("button");
      action.type = "button";
      action.className = "button secondary project-status-action";
      action.textContent = project.is_active ? "Archivia" : "Riattiva";
      action.setAttribute("aria-label", `${project.is_active ? "Archivia" : "Riattiva"} ${projectLabel(project)}`);
      action.addEventListener("click", () => setProjectActive(project.id, !project.is_active));
      row.append(copy, action);
      return row;
    }));
  }
  const defaultSelect = $("#default-project");
  const current = draftDefaultProjectId || normalizeFamilySettings(state.profile.family_settings).default_project_id || "";
  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = "Nessuna";
  const options = projects.filter((project) => project.is_active).map((project) => {
    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = projectLabel(project);
    return option;
  });
  defaultSelect.replaceChildren(emptyOption, ...options);
  defaultSelect.value = options.some((option) => option.value === current) ? current : "";
  updateSettingsSummaries();
}

async function upsertProject(project) {
  const normalized = normalizeProject(project);
  const previous = state.projects.get(normalized.id) || null;
  state.projects.set(normalized.id, normalized);
  persistProjectCache();
  renderProjectSettings($("#projects-enabled")?.checked ?? projectsEnabled());
  setProjectFeatureVisibility();
  if (!navigator.onLine) {
    queueProjectOperation({ entity: "project", op: "upsert", id: normalized.id, payload: normalized });
    showToast("Commessa salvata sul dispositivo; sincronizzazione in attesa.");
    return normalized;
  }
  const { data, error } = await state.supabase.from("work_projects").upsert(normalized, { onConflict: "id" }).select().single();
  if (error) {
    if (previous) state.projects.set(previous.id, previous);
    else state.projects.delete(normalized.id);
    persistProjectCache();
    renderProjectSettings($("#projects-enabled")?.checked ?? projectsEnabled());
    throw error;
  }
  const saved = normalizeProject(data);
  state.projects.set(saved.id, saved);
  persistProjectCache();
  renderProjectSettings($("#projects-enabled")?.checked ?? projectsEnabled());
  return saved;
}

async function setProjectActive(projectId, active) {
  const project = state.projects.get(projectId);
  if (!project) return;
  try {
    await upsertProject({ ...project, is_active: active, updated_at: new Date().toISOString() });
    if (!active && $("#default-project").value === projectId) $("#default-project").value = "";
    renderProjectSettings($("#projects-enabled")?.checked ?? projectsEnabled());
    renderCurrentViews();
    showToast(active ? "Commessa riattivata." : "Commessa archiviata. Lo storico resta disponibile.");
  } catch (error) {
    showToast(`Commessa non aggiornata: ${friendlyError(error)}`);
  }
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
  const applicability = applicabilitySettings();
  const overtime = overtimeSettings();
  $("#overtime-smart").checked = overtime.smart;
  $("#overtime-travel").checked = overtime.travel;
  $("#mode-office").checked = applicability.work_modes.office;
  $("#mode-smart").checked = applicability.work_modes.smart;
  $("#mode-travel").checked = applicability.work_modes.travel;
  $("#mode-saturday").checked = applicability.work_modes.saturday;
  $("#feature-sickness").checked = applicability.absence_features.sickness;
  $("#feature-marriage").checked = applicability.absence_features.marriage_leave;
  $("#feature-performance-recovery").checked = applicability.absence_features.recovery;
  $("#summary-show-distribution").checked = applicability.summary_preferences.show_distribution;
  $("#summary-show-annual-table").checked = applicability.summary_preferences.show_annual_table;
  $("#parental-role").value = applicability.parental_role;
  $("#show-paternity-alternative").checked = applicability.show_paternity_alternative;
  $("#ticket-office").checked = Boolean(profile.ticket_office);
  $("#ticket-smart").checked = Boolean(profile.ticket_smart);
  $("#ticket-travel").checked = Boolean(profile.ticket_travel);
  const contract = normalizeFamilySettings(profile.family_settings).contract_settings;
  const selectedRule = $(`input[name="sunday-holiday-rule"][value="${contract.sunday_holiday_rule || "none"}"]`);
  if (selectedRule) selectedRule.checked = true;
  const currentYear = referenceYearForDate();
  state.settingsReferenceYear = currentYear;
  $("#leave-settings-year").value = String(currentYear);
  fillLeaveSettingsFields(currentYear);
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
  updateParentalRoleUi();
  renderChildren();
  renderProjectSettings();
  applyApplicabilityToUi();
  updateSettingsSummaries();
}

async function syncAnnualSettingsYearAfterRollover() {
  if (!state.user) return false;
  const currentYear = referenceYearForDate();
  if (currentYear === state.settingsReferenceYear) return false;
  state.settingsReferenceYear = currentYear;
  const yearInput = $("#leave-settings-year");
  if (!yearInput) return false;
  yearInput.value = String(currentYear);
  fillLeaveSettingsFields(currentYear);
  $("#sunday-holiday-adjustment-year").value = String(currentYear);
  fillSundayHolidayAdjustmentFields(currentYear);
  await fetchSummaryYear(currentYear).catch(() => {});
  updateLeaveSettingsPreview();
  previewSundayHolidaySettings();
  updateSettingsSummaries();
  if (!$("#settings-screen").hidden) showToast(`Anno di riferimento aggiornato automaticamente al ${currentYear}.`);
  return true;
}

function renderAccount() {
  const name = state.profile.display_name || state.user.email.split("@")[0];
  $("#account-name").textContent = name;
  $("#account-email").textContent = state.user.email;
  $("#account-initial").textContent = name.trim().charAt(0).toUpperCase() || "U";
}

function renderCurrentViews() {
  applyApplicabilityToUi();
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
  if (name === "today") {
    renderToday();
    void refreshTodayFromCloud().catch((error) => console.warn("[Chrono Flow] giornata di oggi non sincronizzata", error));
  }
  if (name === "calendar") void setCalendarScope("mine");
  syncHomeClock();
  if (name === "summary") {
    renderSummary();
    Promise.all([
      fetchSummaryYear(state.summaryMonth.getFullYear()),
      projectsEnabled() ? fetchProjectData({
        start: `${state.summaryMonth.getFullYear()}-01-01`,
        end: `${state.summaryMonth.getFullYear()}-12-31`,
        includeProjects: !state.projectDataLoaded
      }) : Promise.resolve()
    ])
      .then(renderSummary)
      .catch((error) => showToast(`Riepilogo annuale non disponibile: ${friendlyError(error)}`));
  }
  if (name === "settings") {
    renderSettings();
    const settingsYear = clampInt($("#leave-settings-year")?.value, 2000, 2100, new Date().getFullYear());
    fetchChildSicknessUsage().then(renderChildren).catch(() => {});
    fetchSummaryYear(settingsYear)
      .then(updateLeaveSettingsPreview)
      .catch(() => { $("#leave-carryover-preview").textContent = "Non disponibile offline"; });
    if (projectsEnabled() && !state.projectDataLoaded) {
      fetchProjectData().then(() => renderProjectSettings()).catch((error) => {
        $("#project-settings-status").textContent = `Commesse non caricate: ${friendlyError(error)}. Verifica di aver eseguito la migration 3.3.0.`;
      });
    }
  }
  $("#main-content").focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

function settingsAccordionSections() {
  return $$("#settings-screen details.settings-disclosure[data-settings-section]");
}

function enforceSingleOpenSettingsSection(activeSection = null) {
  const sections = settingsAccordionSections();
  const openSection = activeSection?.open ? activeSection : sections.find((section) => section.open) || null;
  for (const section of sections) {
    const shouldOpen = section === openSection;
    if (section.open !== shouldOpen) section.open = shouldOpen;
    section.querySelector(":scope > summary")?.setAttribute("aria-expanded", String(shouldOpen));
  }
  return openSection;
}

function openSettingsSection(section, { focus = false, scroll = false } = {}) {
  if (!section) return;
  section.open = true;
  enforceSingleOpenSettingsSection(section);
  const summary = section.querySelector(":scope > summary");
  if (!focus && !scroll) return;
  window.requestAnimationFrame(() => {
    if (scroll) {
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      summary?.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
    }
    if (focus) summary?.focus({ preventScroll: true });
  });
}

function revealInvalidSettingsControl(form) {
  const invalid = [...form.elements].find((control) => typeof control.checkValidity === "function" && !control.checkValidity());
  if (!invalid) return false;
  openSettingsSection(invalid.closest("details[data-settings-section]"), { scroll: true });
  window.requestAnimationFrame(() => {
    invalid.focus({ preventScroll: true });
    invalid.reportValidity?.();
  });
  return true;
}

function initSettingsAccordion() {
  const sections = settingsAccordionSections();
  enforceSingleOpenSettingsSection(sections.find((section) => section.open) || sections[0]);
  for (const section of sections) {
    const summary = section.querySelector(":scope > summary");
    if (!summary) continue;
    const markUserActivation = () => { section.dataset.userAccordionAction = "true"; };
    summary.addEventListener("pointerdown", markUserActivation);
    summary.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") markUserActivation();
    });
    section.addEventListener("toggle", () => {
      if (!section.open) {
        summary.setAttribute("aria-expanded", "false");
        delete section.dataset.userAccordionAction;
        return;
      }
      enforceSingleOpenSettingsSection(section);
      if (section.dataset.userAccordionAction === "true") {
        delete section.dataset.userAccordionAction;
        const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        window.requestAnimationFrame(() => {
          summary.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
          summary.focus({ preventScroll: true });
        });
      }
    });
  }
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
  state.projects.clear();
  state.allocations.clear();
  state.projectDataLoaded = false;
  state.summaryYearDays = [];
  state.summaryPreviousYearDays = [];
  state.summaryYearLoaded = null;
  state.summaryYearLoading = false;
  loadLocalCache();
  loadProjectCache();
  try {
    await fetchProfile();
    await Promise.all([
      refreshTodayFromCloud({ render: false }),
      fetchMonth(state.calendarMonth),
      fetchChildSicknessUsage(),
      fetchSundayHolidayRecoveryUsage(),
      projectsEnabled() ? fetchProjectData({
        start: `${state.calendarMonth.getFullYear()}-01-01`,
        end: `${state.calendarMonth.getFullYear()}-12-31`
      }) : Promise.resolve()
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
  state.calendarScope = "mine";
  showScreen("today");
  syncHomeClock();
  updateSyncStatus();
  flushQueue();
  flushProjectQueue();
  offerLegacyMigration();
}

function showAuth() {
  homeClock.stop();
  state.calendarSharingView?.destroy();
  state.calendarSharingView = null;
  state.calendarSharingSettingsView?.destroy();
  state.calendarSharingSettingsView = null;
  state.calendarSharingService = null;
  state.user = null;
  state.days.clear();
  state.projects.clear();
  state.allocations.clear();
  state.projectDataLoaded = false;
  state.sundayHolidayRecoveryDays = [];
  state.summaryYearDays = [];
  state.summaryPreviousYearDays = [];
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
    .register("./sw.v3.3.3.js", { updateViaCache: "none" })
    .then((registration) => registration.update())
    .catch(() => {});
}

async function initialize() {
  bindEvents();
  setupInstallExperience();
  if (!configured || !supabase) {
    $("#loading-view").hidden = true;
    $("#configuration-view").hidden = false;
    return;
  }
  state.supabase = supabase;
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
  document.addEventListener("visibilitychange", () => {
    syncHomeClock();
    if (!document.hidden) {
      syncAnnualSettingsYearAfterRollover();
      void refreshTodayFromCloud().catch(() => {});
    }
  });
  window.addEventListener("pageshow", () => {
    syncHomeClock();
    syncAnnualSettingsYearAfterRollover();
    void refreshTodayFromCloud().catch(() => {});
  });
  window.addEventListener("focus", () => {
    syncHomeClock();
    void refreshTodayFromCloud().catch(() => {});
  });
  window.addEventListener("pagehide", () => homeClock.stop());
}

function bindEvents() {
  bindPersonalCalendarEditor();
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
  $("#classification-form").addEventListener("submit", applyClassification);
  $("#close-classification-dialog").addEventListener("click", () => $("#classification-dialog").close());
  $("#cancel-classification").addEventListener("click", () => $("#classification-dialog").close());
  $("#classification-absence-type").addEventListener("change", () => {
    $("#classification-child-id").value = "";
    $("#classification-confirm").checked = false;
    updateClassificationPreview();
  });
  $("#classification-child-id").addEventListener("change", () => {
    $("#classification-confirm").checked = false;
    updateClassificationPreview();
  });
  $("#classification-days").addEventListener("change", () => {
    $("#classification-confirm").checked = false;
    updateClassificationPreview();
  });
  $("#classification-confirm").addEventListener("change", updateClassificationPreview);
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
  $$('[data-calendar-scope]').forEach((button) => button.addEventListener("click", () => {
    setCalendarScope(button.dataset.calendarScope).catch((error) => {
      console.error("[Chrono Flow] apertura calendario condiviso", error);
      showToast("Calendari condivisi non disponibili. Il tuo calendario personale resta utilizzabile.");
    });
  }));
  $("#calendar-shared-panel").addEventListener("click", (event) => {
    if (!event.target.closest("[data-calendar-retry]")) return;
    state.calendarSharingView = null;
    ensureCalendarSharingView("shared").catch(() => {});
  });
  $("#calendar-sharing-settings").addEventListener("toggle", (event) => {
    if (!event.currentTarget.open) return;
    ensureCalendarSharingSettingsView().catch(() => {});
  });
  $$('[data-disclosure]').forEach((details) => {
    const summary = details.querySelector(":scope > summary");
    const updateExpanded = () => summary?.setAttribute("aria-expanded", String(details.open));
    details.addEventListener("toggle", updateExpanded);
    updateExpanded();
  });
  initSettingsAccordion();
  $("#projects-enabled").addEventListener("change", () => {
    $("#project-settings-content").hidden = !$("#projects-enabled").checked;
    updateSettingsSummaries();
    if ($("#projects-enabled").checked && !state.projectDataLoaded) {
      fetchProjectData({ force: true }).then(() => renderProjectSettings(true)).catch((error) => {
        $("#project-settings-status").textContent = `Commesse non caricate: ${friendlyError(error)}. Esegui la migration 3.3.0 prima di attivare la funzione.`;
      });
    }
  });
  $("#add-project").addEventListener("click", async () => {
    const code = $("#project-code").value.trim().toUpperCase();
    const description = $("#project-description").value.trim();
    if (!code || !description) {
      (!code ? $("#project-code") : $("#project-description")).focus();
      return showToast("Inserisci codice e descrizione breve della commessa.");
    }
    if ([...state.projects.values()].some((project) => project.code.toLocaleLowerCase("it") === code.toLocaleLowerCase("it"))) {
      $("#project-code").focus();
      return showToast("Esiste già una commessa con questo codice.");
    }
    try {
      await upsertProject({ id: crypto.randomUUID(), user_id: state.user.id, code, description, is_active: true });
      $("#project-code").value = "";
      $("#project-description").value = "";
      showToast("Commessa aggiunta.");
    } catch (error) {
      showToast(`Commessa non aggiunta: ${friendlyError(error)}`);
    }
  });
  $("#add-today-allocation").addEventListener("click", () => openAllocationDialog(isoDateLocal()));
  $("#add-day-allocation").addEventListener("click", () => openAllocationDialog($("#day-date").value));
  $("#close-allocation-dialog").addEventListener("click", () => $("#allocation-dialog").close());
  $("#allocation-dialog").addEventListener("cancel", () => { state.editingAllocationId = null; });
  $("#allocation-project-search").addEventListener("input", renderAllocationProjectPicker);
  $$('input[name="allocation-method"]').forEach((control) => control.addEventListener("change", renderAllocationHoursEditor));
  $("#allocation-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const errorBox = $("#allocation-error");
    errorBox.hidden = true;
    try {
      const date = $("#allocation-date").value;
      const projectIds = allocationSelectedProjectIds();
      const existingByProject = new Map(allocationsForDate(date).map((item) => [item.project_id, item]));
      const manualHours = Object.fromEntries(state.allocationManualHours);
      const durations = buildAllocationDurations({
        mode: allocationMethod(),
        projectIds,
        workedMinutes: workedMinutesForDate(date),
        manualHours
      });
      const note = $("#allocation-note").value.trim();
      const method = allocationMethod();
      await replaceDayAllocations(date, durations.map(({ projectId, durationMinutes }) => ({
        id: existingByProject.get(projectId)?.id || crypto.randomUUID(),
        user_id: state.user.id,
        project_id: projectId,
        work_date: date,
        start_time: null,
        end_time: null,
        duration_minutes: durationMinutes,
        allocation_method: method,
        note: note || existingByProject.get(projectId)?.note || ""
      })));
      $("#allocation-dialog").close();
      state.editingAllocationId = null;
      showToast("Commesse della giornata salvate.");
    } catch (error) {
      errorBox.textContent = friendlyError(error);
      errorBox.hidden = false;
      errorBox.focus();
    }
  });
  $("#delete-allocation").addEventListener("click", async () => {
    const id = $("#allocation-id").value;
    const date = $("#allocation-date").value;
    if (!id) return;
    await deleteAllocation(id, date);
    $("#allocation-dialog").close();
    state.editingAllocationId = null;
    showToast("Attività eliminata.");
  });
  $$(".location-option").forEach((button) => button.addEventListener("click", async () => {
    updateHeroMode(button.dataset.location);
    updateLocationChoice(button.dataset.location);
    const date = isoDateLocal();
    const day = normalizeDay(applyHomeModeToDay(state.days.get(date) || defaultDay(date), date, button.dataset.location));
    await saveDay(day, { silent: true });
    if (projectsEnabled()) await recalculateAutomaticAllocationsForDay(date);
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
    if (CHILD_LINKED_ABSENCE_TYPES.has(day.absence_type) && !day.child_id) {
      $("#today-child-id").focus();
      return showToast("Seleziona il figlio: i plafond sono separati e non possono essere condivisi.");
    }
    const childEventError = childEventAbsenceError(day.absence_type, day.child_id, day.work_date);
    if (childEventError) return showToast(childEventError);
    day.ticket_override = day.actual_type === "absence" || $("#today-ticket").value === "auto" ? null : $("#today-ticket").value === "yes";
    day.notes = $("#today-notes").value.trim();
    await saveDay(day, { silent: true });
    if (projectsEnabled()) await recalculateAutomaticAllocationsForDay(date);
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
      if (!dayHasRecordedActivity(day)) day.actual_type = null;
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
  $("#today-child-id").addEventListener("change", () => updateChildPolicyHint("today"));

  $("#previous-summary-month").addEventListener("click", () => selectMonth("summary", new Date(state.summaryMonth.getFullYear(), state.summaryMonth.getMonth() - 1, 1)));
  $("#next-summary-month").addEventListener("click", () => selectMonth("summary", new Date(state.summaryMonth.getFullYear(), state.summaryMonth.getMonth() + 1, 1)));
  ["#summary-month-select", "#summary-year-select"].forEach((selector) => {
    $(selector).addEventListener("change", () => selectMonth("summary", selectedMonthFromControls("summary", state.summaryMonth)));
  });

  $("#parental-role").addEventListener("change", () => {
    state.profile.family_settings = {
      ...state.profile.family_settings,
      parental_role: $("#parental-role").value,
      show_paternity_alternative: $("#show-paternity-alternative").checked
    };
    updateParentalRoleUi();
    const role = parentalRole();
    $("#child-enable-maternity").checked = role === "mother";
    $("#child-enable-paternity").checked = role === "father";
    renderChildren();
    applyApplicabilityToUi();
    updateSettingsSummaries();
  });
  $("#show-paternity-alternative").addEventListener("change", () => {
    state.profile.family_settings = { ...state.profile.family_settings, show_paternity_alternative: $("#show-paternity-alternative").checked };
    applyApplicabilityToUi();
    updateSettingsSummaries();
  });
  for (const selector of [
    "#child-enable-parental", "#child-parental-quota-months", "#child-parental-single-parent",
    "#child-parental-father-three", "#child-parental-other-months"
  ]) {
    $(selector).addEventListener("input", updateNewChildParentalSettings);
    $(selector).addEventListener("change", updateNewChildParentalSettings);
  }

  $("#add-child").addEventListener("click", () => {
    const name = $("#child-name").value.trim();
    const birthDate = $("#child-birth-date").value;
    if (!name || !birthDate) {
      showToast("Inserisci nome e data di nascita prima di aggiungere il figlio.");
      (!name ? $("#child-name") : $("#child-birth-date")).focus();
      return;
    }
    const parentalEnabled = $("#child-enable-parental").checked;
    const parentalQuota = newChildParentalQuotaDraft();
    if (parentalEnabled && !parentalQuota.valid) {
      updateNewChildParentalSettings();
      $("#child-parental-quota-months").reportValidity();
      return;
    }
    const role = $("#parental-role").value;
    state.profile.family_settings = {
      ...state.profile.family_settings,
      children: [...familyChildren(), {
        id: crypto.randomUUID(),
        name,
        birth_date: birthDate,
        paternity_event_date: birthDate,
        maternity_event_date: birthDate,
        expected_birth_date: $("#child-expected-date").value || birthDate,
        paternity_event_type: $("#child-event-type").value,
        multiple_birth: $("#child-multiple-birth").checked,
        maternity_mode: $("#child-maternity-mode").value,
        institutes: {
          child_sickness: $("#child-enable-sickness").checked,
          parental_leave: $("#child-enable-parental").checked,
          maternity_leave: $("#child-enable-maternity").checked,
          paternity_mandatory: $("#child-enable-paternity").checked,
          paternity_alternative: $("#child-enable-paternity-alternative").checked
        },
         parental_leave_quota_months: parentalEnabled ? parentalQuota.requestedMonths : null,
         parental_leave_single_parent: parentalEnabled && $("#child-parental-single-parent").checked,
         parental_leave_father_three_months: parentalEnabled && role === "father" && $("#child-parental-father-three").checked,
         parental_leave_other_parent_three_months: parentalEnabled && role !== "father" && $("#child-parental-father-three").checked,
         parental_leave_other_parent_months: parentalEnabled ? Math.max(0, Number($("#child-parental-other-months").value) || 0) : 0,
        external_usage: {}
      }]
    };
    $("#child-name").value = "";
    $("#child-birth-date").value = "";
    $("#child-expected-date").value = "";
    $("#child-event-type").value = "birth";
    $("#child-multiple-birth").checked = false;
    $("#child-maternity-mode").value = "2+3";
    $("#child-enable-sickness").checked = true;
    $("#child-enable-parental").checked = false;
    $("#child-enable-maternity").checked = false;
    $("#child-enable-paternity").checked = false;
    $("#child-enable-paternity-alternative").checked = false;
    $("#child-parental-quota-months").value = "";
    $("#child-parental-single-parent").checked = false;
    $("#child-parental-father-three").checked = false;
    $("#child-parental-other-months").value = "0";
    updateNewChildParentalSettings();
    renderChildren();
    applyApplicabilityToUi();
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

  $("#leave-settings-year").addEventListener("change", async (event) => {
    const year = clampInt(event.target.value, 2000, 2100, new Date().getFullYear());
    fillLeaveSettingsFields(year);
    updateSettingsSummaries();
    try {
      await fetchSummaryYear(year);
      updateLeaveSettingsPreview();
    } catch {
      $("#leave-carryover-preview").textContent = "Non disponibile offline";
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
    } else if (event.target.matches("#leave-current-days, #leave-suppressed-days, #leave-carryover-override")) {
      updateLeaveSettingsPreview();
      updateSettingsSummaries();
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
    if (revealInvalidSettingsControl(event.currentTarget)) return;
    if (!event.currentTarget.reportValidity()) return;
    const familySettings = normalizeFamilySettings(state.profile.family_settings);
    const invalidParentalChild = familySettings.children.find((child) => childInstituteEnabled(child, "parental_leave")
      && !parentalQuotaForChild(child).valid);
    if (invalidParentalChild) {
      showToast(`${invalidParentalChild.name}: ${parentalQuotaForChild(invalidParentalChild).reason}`);
      $(`#parental-quota-${CSS.escape(invalidParentalChild.id)}`)?.focus();
      return;
    }
    const adjustmentYear = clampInt($("#sunday-holiday-adjustment-year").value, 2000, 2100, new Date().getFullYear());
    const adjustmentDays = clampInt($("#sunday-holiday-adjustment-days").value, -366, 366, 0);
    const adjustmentReason = $("#sunday-holiday-adjustment-reason").value.trim();
    const updatedLeaveSettings = leaveSettingsDraft();
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
    familySettings.parental_role = $("#parental-role").value;
    familySettings.show_paternity_alternative = $("#show-paternity-alternative").checked;
    familySettings.work_modes = {
      office: $("#mode-office").checked,
      smart: $("#mode-smart").checked,
      travel: $("#mode-travel").checked,
      saturday: $("#mode-saturday").checked
    };
    if (!familySettings.work_modes.office && !familySettings.work_modes.smart && !familySettings.work_modes.travel) {
      showToast("Attiva almeno una modalità di lavoro.");
      return;
    }
    familySettings.absence_features = {
      vacation: true,
      sickness: $("#feature-sickness").checked,
      marriage_leave: $("#feature-marriage").checked,
      recovery: $("#feature-performance-recovery").checked
    };
    familySettings.summary_preferences = {
      show_distribution: $("#summary-show-distribution").checked,
      show_annual_table: $("#summary-show-annual-table").checked
    };
    familySettings.projects_enabled = $("#projects-enabled").checked;
    familySettings.default_project_id = familySettings.projects_enabled && $("#default-project").value
      ? $("#default-project").value
      : null;
    familySettings.contract_settings = {
      ...familySettings.contract_settings,
      sunday_holiday_rule: $("input[name='sunday-holiday-rule']:checked")?.value || "none",
      sunday_holiday_adjustments: adjustments,
      local_holiday: localHoliday.name ? localHoliday : null,
      leave_settings: updatedLeaveSettings
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
    const today = isoDateLocal();
    const currentDay = state.days.get(today);
    if (currentDay) {
      const reconciled = reconcileDayAutomaticExit(currentDay, new Date());
      if (reconciled.changed) await saveDay(reconciled.day, { silent: true, skipAutoExitReconcile: true });
    }
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
    let projectData = {};
    if (projectsEnabled()) {
      const [projectsResult, allocationsResult] = await Promise.all([
        state.supabase.from("work_projects").select("*").order("code"),
        state.supabase.from("work_allocations").select("*").order("work_date")
      ]);
      if (projectsResult.error || allocationsResult.error) return showToast(`Backup non creato: ${friendlyError(projectsResult.error || allocationsResult.error)}`);
      projectData = { projects: projectsResult.data || [], allocations: allocationsResult.data || [] };
    }
    const backup = { version: projectsEnabled() ? 3 : 2, exported_at: new Date().toISOString(), profile: state.profile, days: data || [], ...projectData };
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
      if (Array.isArray(backup.projects) && backup.projects.length) {
        const projectPayload = backup.projects.map((project) => ({ ...normalizeProject(project), user_id: state.user.id }));
        const projectResult = await state.supabase.from("work_projects").upsert(projectPayload, { onConflict: "id" }).select();
        if (projectResult.error) throw projectResult.error;
        (projectResult.data || []).forEach((project) => state.projects.set(project.id, normalizeProject(project)));
      }
      if (Array.isArray(backup.allocations) && backup.allocations.length) {
        const allocationPayload = backup.allocations.map((allocation) => ({ ...normalizeAllocation(allocation), user_id: state.user.id }));
        const allocationResult = await state.supabase.from("work_allocations").upsert(allocationPayload, { onConflict: "id" }).select();
        if (allocationResult.error) throw allocationResult.error;
        (allocationResult.data || []).forEach(setAllocationInState);
        persistProjectCache();
      }
      renderCurrentViews();
      showToast(`${payload.length} giornate importate o aggiornate${Array.isArray(backup.allocations) ? ` · ${backup.allocations.length} attività` : ""}.`);
    } catch (error) {
      showToast(`Importazione non riuscita: ${friendlyError(error)}`);
    } finally {
      event.target.value = "";
    }
  });

  window.addEventListener("online", () => { flushQueue(); flushProjectQueue(); });
  window.addEventListener("offline", () => updateSyncStatus());
}

initialize();
