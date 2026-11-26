import {
  ABSENCE_TYPES,
  DAY_TYPES,
  breakForType,
  calculateDay,
  clampInt,
  forecastExit,
  formatTime,
  isoDateLocal,
  minutesToDuration,
  ticketForDay
} from "./calculations.mjs";

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
  family_settings: { children: [] }
};

const state = {
  supabase: null,
  user: null,
  profile: { ...DEFAULT_PROFILE },
  days: new Map(),
  authMode: "login",
  calendarMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  summaryMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  toastTimer: null,
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
  } else if (result.absence_type !== "child_sickness") {
    result.child_id = null;
  }
  return result;
}

function familyChildren() {
  return Array.isArray(state.profile.family_settings?.children)
    ? state.profile.family_settings.children
    : [];
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
  $("#toast-message").textContent = message;
  $("#toast-action").hidden = !state.undo;
  $("#toast").hidden = false;
  state.toastTimer = window.setTimeout(() => {
    $("#toast").hidden = true;
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

function asCloudDay(day) {
  return {
    user_id: state.user.id,
    work_date: day.work_date,
    planned_type: day.planned_type,
    actual_type: day.actual_type,
    absence_type: day.absence_type || null,
    child_id: day.child_id || null,
    events: day.events || [],
    ticket_override: typeof day.ticket_override === "boolean" ? day.ticket_override : null,
    notes: day.notes || ""
  };
}

async function fetchProfile() {
  const { data, error } = await state.supabase.from("profiles").select("*").eq("id", state.user.id).maybeSingle();
  if (error) throw error;
  if (data) state.profile = { ...DEFAULT_PROFILE, ...data, family_settings: data.family_settings || { children: [] } };
  else {
    const payload = { ...DEFAULT_PROFILE, id: state.user.id, display_name: state.user.user_metadata?.display_name || state.user.email.split("@")[0] };
    const result = await state.supabase.from("profiles").upsert(payload).select().single();
    if (result.error) throw result.error;
    state.profile = { ...DEFAULT_PROFILE, ...result.data };
  }
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
  (data || []).forEach((day) => state.days.set(day.work_date, normalizeDay(day)));
  persistLocalCache();
}

async function saveDay(day, { silent = false } = {}) {
  const normalized = normalizeDay(day);
  state.days.set(normalized.work_date, normalized);
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
  persistLocalCache();
  updateSyncStatus();
  return data;
}

async function deleteDay(date, { silent = false } = {}) {
  state.days.delete(date);
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

function toggleAbsenceFields(scope) {
  const actual = $(`#${scope}-actual-type`).value || $(`#${scope}-planned-type`).value;
  const absenceField = $(`#${scope}-absence-field`);
  const absenceType = $(`#${scope}-absence-type`);
  absenceField.hidden = actual !== "absence";
  const childField = $(`#${scope}-child-field`);
  childField.hidden = actual !== "absence" || absenceType.value !== "child_sickness";
}

function calculationNow(day) {
  if (day.work_date === isoDateLocal()) return new Date();
  const dates = (day.events || []).map((event) => new Date(event.at)).filter((date) => !Number.isNaN(date.getTime()));
  return dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))) : new Date(`${day.work_date}T23:59:00`);
}

function renderToday() {
  if (!state.user) return;
  const now = new Date();
  const date = isoDateLocal(now);
  const day = state.days.get(date) || defaultDay(date);
  const effectiveType = day.actual_type || day.planned_type || "office";
  const result = calculateDay(day.events, state.profile.target_minutes, state.profile.overtime_threshold, now);
  const plannedBreak = breakForType(state.profile, effectiveType);
  const forecast = forecastExit(day.events, state.profile.target_minutes, plannedBreak, now);
  const dayType = DAY_TYPES[effectiveType] || DAY_TYPES.office;

  $("#today-date").textContent = formatLongDate(now);
  $("#today-type-badge").textContent = `${dayType.icon} ${dayType.label}`;
  $("#today-type-badge").className = `type-badge ${effectiveType}`;
  $("#worked-value").textContent = minutesToDuration(result.workedMinutes);
  $("#forecast-value").textContent = formatTime(forecast);
  $("#overtime-value").textContent = minutesToDuration(result.overtimeMinutes);
  $("#ticket-value").textContent = ticketForDay(state.profile, day) ? "Sì" : "No";

  const primary = $("#primary-action");
  const exit = $("#exit-action");
  primary.disabled = effectiveType === "absence";
  exit.hidden = !["working", "paused"].includes(result.state) || effectiveType === "absence";

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
    $("#work-main-value").textContent = minutesToDuration(result.workedMinutes);
    $("#work-main-caption").textContent = `Restano ${minutesToDuration(result.remainingMinutes)} di lavoro.`;
    primary.textContent = "Inizia pausa";
  } else if (result.state === "paused") {
    $("#work-state-label").textContent = "Pausa in corso";
    $("#work-main-value").textContent = minutesToDuration(result.pausedMinutes);
    $("#work-main-caption").textContent = "Il tempo di pausa non viene conteggiato come lavoro.";
    primary.textContent = "Termina pausa";
  } else {
    $("#work-state-label").textContent = "Giornata conclusa";
    $("#work-main-value").textContent = formatTime(result.lastExit);
    $("#work-main-caption").textContent = `Hai lavorato ${minutesToDuration(result.workedMinutes)}.`;
    primary.textContent = "Giornata conclusa";
    primary.disabled = true;
  }

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
  $("#calendar-month-label").textContent = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }).format(month);
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
    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-day";
    button.setAttribute("role", "gridcell");
    if (date.getMonth() !== month.getMonth()) button.classList.add("outside");
    if (key === isoDateLocal()) button.classList.add("today");
    const label = `${formatLongDate(date)}${info ? `, ${info.label}` : ", nessuna pianificazione"}${day?.events?.length ? ", orari registrati" : ""}`;
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
    button.addEventListener("click", () => openDayDialog(key));
    grid.append(button);
  }
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
  $("#delete-day").hidden = !state.days.has(date);
  toggleAbsenceFields("day");
  $("#day-dialog").showModal();
}

function renderSummary() {
  if (!state.user) return;
  const { start, end } = monthBounds(state.summaryMonth);
  const days = [...state.days.values()].filter((day) => day.work_date >= start && day.work_date <= end);
  const totals = { worked: 0, overtime: 0, tickets: 0, office: 0, smart: 0, travel: 0, absence: 0 };
  for (const day of days) {
    const result = calculateDay(day.events, state.profile.target_minutes, state.profile.overtime_threshold, calculationNow(day));
    totals.worked += result.workedMinutes;
    totals.overtime += result.overtimeMinutes;
    totals.tickets += ticketForDay(state.profile, day) ? 1 : 0;
    const effectiveType = day.actual_type || day.planned_type || "office";
    totals[effectiveType] = (totals[effectiveType] || 0) + 1;
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
}

function renderChildren() {
  const list = $("#children-list");
  list.replaceChildren();
  const children = familyChildren();
  if (!children.length) {
    const empty = document.createElement("p");
    empty.className = "supporting";
    empty.textContent = "Nessun figlio aggiunto.";
    list.append(empty);
    return;
  }
  children.forEach((child) => {
    const row = document.createElement("div");
    row.className = "child-row";
    const info = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = child.name;
    const date = document.createElement("span");
    date.textContent = child.birth_date ? `Nato/a il ${new Intl.DateTimeFormat("it-IT").format(new Date(`${child.birth_date}T12:00:00`))}` : "Data di nascita non indicata";
    info.append(name, date);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
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

function renderSettings() {
  const profile = state.profile;
  $("#settings-name").value = profile.display_name || "";
  $("#target-hours").value = Math.floor(profile.target_minutes / 60);
  $("#target-minutes").value = profile.target_minutes % 60;
  $("#office-break").value = profile.office_break_minutes;
  $("#smart-break").value = profile.smart_break_minutes;
  $("#travel-break").value = profile.travel_break_minutes;
  $("#overtime-threshold").value = profile.overtime_threshold;
  $("#ticket-office").checked = Boolean(profile.ticket_office);
  $("#ticket-smart").checked = Boolean(profile.ticket_smart);
  $("#ticket-travel").checked = Boolean(profile.ticket_travel);
  renderChildren();
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
  if (name === "summary") renderSummary();
  if (name === "settings") renderSettings();
  $("#main-content").focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function loadApplication(user) {
  state.user = user;
  state.days.clear();
  loadLocalCache();
  try {
    await Promise.all([fetchProfile(), fetchMonth(state.calendarMonth)]);
  } catch (error) {
    if (!state.days.size) {
      showToast(`Non riesco a caricare i dati: ${friendlyError(error)}`);
    }
  }
  $("#auth-view").hidden = true;
  $("#configuration-view").hidden = true;
  $("#app-shell").hidden = false;
  $("#summary-month").value = `${state.summaryMonth.getFullYear()}-${String(state.summaryMonth.getMonth() + 1).padStart(2, "0")}`;
  $("#bulk-start").value ||= isoDateLocal();
  $("#bulk-end").value ||= isoDateLocal();
  renderAccount();
  renderToday();
  updateSyncStatus();
  flushQueue();
}

function showAuth() {
  state.user = null;
  state.days.clear();
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

async function initialize() {
  bindEvents();
  if (!configured || !window.supabase?.createClient) {
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
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
  window.setInterval(() => {
    if (state.user && !$("#today-screen").hidden) renderToday();
  }, 60000);
}

function bindEvents() {
  $("#show-login").addEventListener("click", () => switchAuthMode("login"));
  $("#show-register").addEventListener("click", () => switchAuthMode("register"));
  $("#auth-form").addEventListener("submit", handleAuthSubmit);
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
  $("#primary-action").addEventListener("click", () => {
    const day = state.days.get(isoDateLocal()) || defaultDay(isoDateLocal());
    const result = calculateDay(day.events, state.profile.target_minutes, state.profile.overtime_threshold, new Date());
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
    day.child_id = day.absence_type === "child_sickness" ? $("#today-child-id").value || null : null;
    day.ticket_override = $("#today-ticket").value === "auto" ? null : $("#today-ticket").value === "yes";
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

  $("#previous-month").addEventListener("click", async () => {
    state.calendarMonth = new Date(state.calendarMonth.getFullYear(), state.calendarMonth.getMonth() - 1, 1);
    await fetchMonth(state.calendarMonth).catch((error) => showToast(friendlyError(error)));
    renderCalendar();
  });
  $("#next-month").addEventListener("click", async () => {
    state.calendarMonth = new Date(state.calendarMonth.getFullYear(), state.calendarMonth.getMonth() + 1, 1);
    await fetchMonth(state.calendarMonth).catch((error) => showToast(friendlyError(error)));
    renderCalendar();
  });
  $("#day-planned-type").addEventListener("change", () => toggleAbsenceFields("day"));
  $("#day-actual-type").addEventListener("change", () => toggleAbsenceFields("day"));
  $("#day-absence-type").addEventListener("change", () => toggleAbsenceFields("day"));
  $("#close-day-dialog").addEventListener("click", () => $("#day-dialog").close());
  $("#day-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const date = $("#day-date").value;
    const day = normalizeDay(state.days.get(date) || defaultDay(date));
    day.planned_type = $("#day-planned-type").value;
    day.actual_type = $("#day-actual-type").value || null;
    const effectiveType = day.actual_type || day.planned_type;
    day.absence_type = effectiveType === "absence" ? $("#day-absence-type").value : null;
    day.child_id = day.absence_type === "child_sickness" ? $("#day-child-id").value || null : null;
    day.ticket_override = $("#day-ticket").value === "auto" ? null : $("#day-ticket").value === "yes";
    day.notes = $("#day-notes").value.trim();
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

  $("#summary-month").addEventListener("change", async (event) => {
    const [year, month] = event.target.value.split("-").map(Number);
    state.summaryMonth = new Date(year, month - 1, 1);
    await fetchMonth(state.summaryMonth).catch((error) => showToast(friendlyError(error)));
    renderSummary();
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
      children: [...familyChildren(), { id: crypto.randomUUID(), name, birth_date: birthDate }]
    };
    $("#child-name").value = "";
    $("#child-birth-date").value = "";
    renderChildren();
    announce(`${name} aggiunto. Salva le impostazioni per confermare.`);
  });

  $("#settings-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
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
      family_settings: state.profile.family_settings || { children: [] }
    };
    updateSyncStatus("Salvataggio…");
    const { data, error } = await state.supabase.from("profiles").upsert(profile).select().single();
    if (error) return showToast(`Impostazioni non salvate: ${friendlyError(error)}`);
    state.profile = { ...DEFAULT_PROFILE, ...data };
    renderAccount();
    renderToday();
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
