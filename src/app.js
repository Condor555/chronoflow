import {
  ABSENCE_TYPES, MODE_LABELS, minutesFromTime, timeFromMinutes, formatMinutes,
  dateKeyLocal, dateFromKey, dayMode, getDayMetrics, eachDate, summarize,
  childLeaveBalance, ageOnDate, validateTimeSequence
} from './engine.js';
import { loadState, saveState, replaceState, clearState, emptyState } from './storage.js';

let state = loadState();
let calendarDate = new Date();
let installPrompt = null;
let toastTimer = null;

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const nowTime = () => new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', hour12: false });
const uid = prefix => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function persist(message = '') {
  saveState(state);
  renderAll();
  if (message) showToast(message);
}

function ensureDay(key) {
  if (!state.days[key]) state.days[key] = { plannedMode: '', actualMode: '', absenceType: '', status: 'confirmed', breaks: [] };
  if (!Array.isArray(state.days[key].breaks)) state.days[key].breaks = [];
  return state.days[key];
}

function formatDate(key, options = { weekday: 'long', day: 'numeric', month: 'long' }) {
  return new Intl.DateTimeFormat('it-IT', options).format(dateFromKey(key));
}

function switchView(name) {
  $$('.view').forEach(view => view.classList.toggle('active', view.id === `view-${name}`));
  $$('.nav-button').forEach(button => button.classList.toggle('active', button.dataset.view === name));
  if (name === 'calendar') renderCalendar();
  if (name === 'summary') renderSummary();
  if (name === 'settings') renderSettings();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderHeader() {
  $('#headerProfile').textContent = state.settings.profileName || 'Profilo';
}

function renderToday() {
  const key = dateKeyLocal();
  const day = state.days[key] || {};
  const settings = state.settings;
  const metrics = getDayMetrics(day, settings, new Date());
  $('#todayTitle').textContent = formatDate(key);
  $('#liveClock').textContent = nowTime();

  const planned = day.plannedMode;
  const plannedBadge = $('#plannedBadge');
  plannedBadge.className = `pill ${planned || 'neutral'}`;
  plannedBadge.textContent = planned ? `Pianificato: ${MODE_LABELS[planned] || planned}` : 'Non pianificato';

  const mode = day.actualMode || '';
  $$('.mode-button').forEach(button => button.classList.toggle('active', button.dataset.mode === mode));

  let status = 'Nessuna attività registrata';
  if (day.absenceType) status = `${ABSENCE_TYPES[day.absenceType] || 'Assenza'} · ${day.status === 'planned' ? 'pianificata' : 'confermata'}`;
  else if (day.end) status = `Giornata conclusa alle ${day.end}`;
  else if (day.start) status = `Ingresso ${day.start} · ${MODE_LABELS[dayMode(day, settings)]}`;
  else if (planned) status = `${MODE_LABELS[planned]} pianificato`;
  $('#todayStatus').textContent = status;

  $('#expectedExit').textContent = metrics.expected === null ? '—' : timeFromMinutes(metrics.expected);
  $('#expectedHint').textContent = day.start ? `pausa prevista ${settings[dayMode(day, settings) === 'smart' ? 'pauseSmart' : dayMode(day, settings) === 'travel' ? 'pauseTravel' : 'pauseOffice']} min` : 'Registra l’ingresso';
  $('#workedTime').textContent = formatMinutes(metrics.worked);
  $('#workedHint').textContent = `su ${formatMinutes(Number(settings.workMinutes))}`;
  $('#overtimeTime').textContent = formatMinutes(metrics.overtime.counted);
  $('#overtimeHint').textContent = settings.overtimeEnabled ? `grezzo ${formatMinutes(metrics.overtime.raw)} · soglia ${settings.overtimeThreshold} min` : 'calcolo disattivato';
  $('#ticketValue').textContent = day.end ? (metrics.ticket ? 'Sì' : 'No') : '—';
  $('#ticketHint').textContent = day.ticketOverride !== null && day.ticketOverride !== undefined ? 'valore forzato' : `minimo ${settings.ticketMinMinutes} min`;

  const activeBreak = (day.breaks || []).find(item => item.start && !item.end);
  $('#checkInButton').disabled = Boolean(day.start || day.absenceType);
  $('#checkInButton').textContent = day.start ? `Ingresso ${day.start}` : 'Registra ingresso';
  $('#breakButton').disabled = Boolean(!day.start || day.end || day.absenceType);
  $('#breakButton').textContent = activeBreak ? 'Termina pausa' : 'Inizia pausa';
  $('#checkOutButton').disabled = Boolean(!day.start || day.end || day.absenceType);
  $('#checkOutButton').textContent = day.end ? `Uscita ${day.end}` : 'Registra uscita';

  const events = [];
  if (day.start) events.push([day.start, 'Ingresso']);
  (day.breaks || []).forEach(item => {
    if (item.start) events.push([item.start, 'Inizio pausa']);
    if (item.end) events.push([item.end, 'Fine pausa']);
  });
  if (day.end) events.push([day.end, 'Uscita effettiva']);
  $('#todayTimeline').innerHTML = events.length
    ? events.map(([time, label]) => `<li><time>${escapeHtml(time)}</time><span></span><strong>${escapeHtml(label)}</strong></li>`).join('')
    : '<li class="empty">Nessun evento</li>';
}

function calendarStyle(day) {
  if (!day) return { className: '', label: '' };
  if (day.absenceType) {
    const map = {
      vacation: 'vacation', sick: 'sick', childSick: 'childSick', publicHoliday: 'publicHoliday',
      mandatoryLeave: 'leave', optionalLeave: 'leave', suppressedHoliday: 'leave', restRecovery: 'leave', other: 'leave'
    };
    return { className: map[day.absenceType] || 'leave', label: ABSENCE_TYPES[day.absenceType] || 'Assenza' };
  }
  const mode = day.actualMode || day.plannedMode;
  return { className: mode || '', label: MODE_LABELS[mode] || '' };
}

function renderCalendar() {
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  $('#calendarMonth').textContent = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' }).format(calendarDate);
  const first = new Date(year, month, 1, 12);
  const offset = (first.getDay() + 6) % 7;
  const cursor = new Date(year, month, 1 - offset, 12);
  const todayKey = dateKeyLocal();
  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const key = dateKeyLocal(cursor);
    const day = state.days[key];
    const style = calendarStyle(day);
    const outside = cursor.getMonth() !== month;
    const planned = day?.status === 'planned' && !day?.end;
    const className = ['calendar-day', outside ? 'outside' : '', key === todayKey ? 'today' : '', planned ? 'planned' : '', style.className].filter(Boolean).join(' ');
    cells.push(`<button type="button" class="${className}" data-date="${key}" role="gridcell" aria-label="${escapeHtml(formatDate(key, { day:'numeric', month:'long', year:'numeric' }))}">
      <span class="number">${cursor.getDate()}</span>${style.label ? `<span class="day-label">${escapeHtml(style.label)}</span>` : ''}
    </button>`);
    cursor.setDate(cursor.getDate() + 1);
  }
  $('#calendarGrid').innerHTML = cells.join('');
  const currentKey = dateKeyLocal();
  if (!$('#bulkStart').value) $('#bulkStart').value = currentKey;
  if (!$('#bulkEnd').value) $('#bulkEnd').value = currentKey;
  renderChildOptions();
}

function renderChildOptions() {
  const options = state.settings.children.map(child => `<option value="${escapeHtml(child.id)}">${escapeHtml(child.name)}</option>`).join('');
  $('#bulkChild').innerHTML = options || '<option value="">Configura prima un figlio</option>';
  $('#dayChild').innerHTML = `<option value="">Seleziona</option>${options}`;
}

function openDayDialog(key) {
  const day = state.days[key] || { plannedMode: '', actualMode: '', absenceType: '', status: 'planned', breaks: [] };
  $('#dayKey').value = key;
  $('#dayDialogTitle').textContent = formatDate(key, { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  $('#dayPlannedMode').value = day.plannedMode || (day.absenceType ? 'absence' : '');
  $('#dayActualMode').value = day.actualMode || (day.absenceType && day.status !== 'planned' ? 'absence' : '');
  $('#dayAbsenceType').value = day.absenceType || '';
  $('#dayChild').value = day.childId || '';
  $('#dayStatus').value = day.status || 'planned';
  $('#dayStart').value = day.start || '';
  $('#dayBreakStart').value = day.breaks?.[0]?.start || '';
  $('#dayBreakEnd').value = day.breaks?.[0]?.end || '';
  $('#dayEnd').value = day.end || '';
  $('#dayTicketOverride').value = day.ticketOverride === true ? 'true' : day.ticketOverride === false ? 'false' : '';
  $('#dayOvertimeTreatment').value = day.overtimeTreatmentOverride || '';
  $('#dayTripDestination').value = day.tripDestination || '';
  $('#dayNotes').value = day.notes || '';
  updateDayFormVisibility();
  updateDayPreview();
  $('#dayDialog').showModal();
}

function dayFromForm() {
  const absenceType = $('#dayAbsenceType').value;
  const breakStart = $('#dayBreakStart').value;
  const ticketValue = $('#dayTicketOverride').value;
  const day = {
    plannedMode: absenceType ? 'absence' : $('#dayPlannedMode').value,
    actualMode: absenceType && $('#dayStatus').value !== 'planned' ? 'absence' : $('#dayActualMode').value,
    absenceType,
    childId: absenceType === 'childSick' ? $('#dayChild').value : '',
    status: $('#dayStatus').value,
    start: absenceType ? '' : $('#dayStart').value,
    end: absenceType ? '' : $('#dayEnd').value,
    breaks: absenceType || !breakStart ? [] : [{ start: breakStart, end: $('#dayBreakEnd').value }],
    ticketOverride: ticketValue === '' ? null : ticketValue === 'true',
    overtimeTreatmentOverride: $('#dayOvertimeTreatment').value,
    tripDestination: $('#dayTripDestination').value.trim(),
    notes: $('#dayNotes').value.trim()
  };
  return day;
}

function updateDayFormVisibility() {
  const absence = $('#dayAbsenceType').value;
  const mode = $('#dayActualMode').value || $('#dayPlannedMode').value;
  $('#dayChildWrap').hidden = absence !== 'childSick';
  $('#tripDestinationWrap').hidden = mode !== 'travel';
  ['#dayStart','#dayBreakStart','#dayBreakEnd','#dayEnd'].forEach(selector => $(selector).disabled = Boolean(absence));
}

function updateDayPreview() {
  const day = dayFromForm();
  const metrics = getDayMetrics(day, state.settings, new Date());
  $('#dayPreview').innerHTML = day.absenceType
    ? `<strong>${escapeHtml(ABSENCE_TYPES[day.absenceType])}</strong><br>Stato: ${day.status === 'planned' ? 'pianificato' : 'confermato'}`
    : `Uscita prevista: <strong>${metrics.expected === null ? '—' : timeFromMinutes(metrics.expected)}</strong> · Lavorato: <strong>${formatMinutes(metrics.worked)}</strong> · Straordinario: <strong>${formatMinutes(metrics.overtime.counted)}</strong> · Ticket: <strong>${day.end ? (metrics.ticket ? 'Sì' : 'No') : 'alla chiusura'}</strong>`;
}

function settingsToForm() {
  const s = state.settings;
  $('#profileName').value = s.profileName;
  $('#workDuration').value = timeFromMinutes(Number(s.workMinutes));
  $('#defaultMode').value = s.defaultMode;
  $('#pauseOffice').value = s.pauseOffice;
  $('#pauseSmart').value = s.pauseSmart;
  $('#pauseTravel').value = s.pauseTravel;
  $('#smartDefaultStart').value = s.smartDefaultStart;
  $('#ticketOffice').checked = Boolean(s.ticketOffice);
  $('#ticketSmart').checked = Boolean(s.ticketSmart);
  $('#ticketTravel').checked = Boolean(s.ticketTravel);
  $('#ticketMinMinutes').value = s.ticketMinMinutes;
  $('#ticketDelayMonths').value = s.ticketDelayMonths;
  $('#overtimeEnabled').checked = Boolean(s.overtimeEnabled);
  $('#overtimeThreshold').value = s.overtimeThreshold;
  $('#overtimeThresholdMode').value = s.overtimeThresholdMode;
  $('#overtimeRounding').value = String(s.overtimeRounding);
  $('#overtimeRoundingMode').value = s.overtimeRoundingMode;
  $('#overtimeTreatment').value = s.overtimeTreatment;
  $('#overtimeDailyLimit').value = s.overtimeDailyLimit;
  $('#vacationPrevious').value = s.vacationPrevious;
  $('#vacationCurrent').value = s.vacationCurrent;
  $('#suppressedHolidayAllowance').value = s.suppressedHolidayAllowance;
  $('#restRecoveryAllowance').value = s.restRecoveryAllowance;
}

function renderSettings() {
  settingsToForm();
  renderChildren();
  renderPolicies();
  renderChildOptions();
}

function renderChildren() {
  const container = $('#childrenList');
  if (!state.settings.children.length) {
    container.innerHTML = '<p class="empty">Nessun figlio configurato.</p>';
    return;
  }
  container.innerHTML = state.settings.children.map(child => {
    const age = ageOnDate(child.birthDate, dateKeyLocal());
    return `<article class="list-card"><div><h3>${escapeHtml(child.name)}</h3><p>Nascita ${escapeHtml(new Intl.DateTimeFormat('it-IT').format(dateFromKey(child.birthDate)))} · ${age ?? '—'} anni<br>Fuori app ${Number(child.usedExternal || 0)} gg · altro genitore ${Number(child.usedOtherParent || 0)} gg</p></div><div class="list-actions"><button type="button" class="secondary-button" data-edit-child="${escapeHtml(child.id)}" aria-label="Modifica">✎</button><button type="button" class="danger-button" data-delete-child="${escapeHtml(child.id)}" aria-label="Elimina">×</button></div></article>`;
  }).join('');
}

function renderPolicies() {
  const container = $('#policiesList');
  if (!state.settings.childPolicies.length) {
    container.innerHTML = '<p class="empty">Nessuna fascia configurata.</p>';
    return;
  }
  const policies = [...state.settings.childPolicies].sort((a,b) => Number(a.minAge)-Number(b.minAge));
  container.innerHTML = policies.map(policy => `<article class="list-card"><div><h3>${escapeHtml(policy.label)}</h3><p>Da ${Number(policy.minAge)} a ${Number(policy.maxAge)} anni · limite ${Number(policy.limitDays)} giorni/anno</p></div><div class="list-actions"><button type="button" class="secondary-button" data-edit-policy="${escapeHtml(policy.id)}" aria-label="Modifica">✎</button><button type="button" class="danger-button" data-delete-policy="${escapeHtml(policy.id)}" aria-label="Elimina">×</button></div></article>`).join('');
}

function summaryYears() {
  const years = new Set([new Date().getFullYear()]);
  Object.keys(state.days).forEach(key => years.add(Number(key.slice(0,4))));
  return [...years].filter(Number.isFinite).sort((a,b) => b-a);
}

function countAbsenceForYear(type, year) {
  return Object.entries(state.days).filter(([key, day]) => key.startsWith(String(year)) && day.absenceType === type && day.status !== 'planned').length;
}

function renderSummary() {
  const yearSelect = $('#summaryYear');
  const previousYear = Number(yearSelect.value) || new Date().getFullYear();
  yearSelect.innerHTML = summaryYears().map(year => `<option value="${year}">${year}</option>`).join('');
  yearSelect.value = summaryYears().includes(previousYear) ? String(previousYear) : String(summaryYears()[0]);
  if ($('#summaryMonth').options.length === 1) {
    const names = [...Array(12)].map((_, month) => new Intl.DateTimeFormat('it-IT', { month:'long' }).format(new Date(2026, month, 1)));
    $('#summaryMonth').insertAdjacentHTML('beforeend', names.map((name,index) => `<option value="${index+1}">${name[0].toUpperCase()+name.slice(1)}</option>`).join(''));
  }
  const year = Number(yearSelect.value);
  const month = Number($('#summaryMonth').value);
  const summary = summarize(state.days, state.settings, { year, month: month || undefined });
  let ticketCount = summary.tickets;
  let ticketHint = month ? 'nel mese selezionato' : 'nell’anno selezionato';
  const ticketDelay = Math.max(0, Number(state.settings.ticketDelayMonths || 0));
  if (month && ticketDelay > 0) {
    const sourceDate = new Date(year, month - 1 - ticketDelay, 1, 12);
    const sourceYear = sourceDate.getFullYear();
    const sourceMonth = sourceDate.getMonth() + 1;
    ticketCount = summarize(state.days, state.settings, { year: sourceYear, month: sourceMonth }).tickets;
    const sourceLabel = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' }).format(sourceDate);
    ticketHint = `maturati ${sourceLabel}`;
  }
  const kpis = [
    ['Giorni lavorati', summary.workedDays, 'consuntivati'],
    ['Smart effettivi', summary.smartActual, `${summary.smartPlanned} pianificati`],
    ['Ticket', ticketCount, ticketHint],
    ['Straordinario', formatMinutes(summary.overtimePaid + summary.overtimeRecovery + summary.overtimeInfo), `pagato ${formatMinutes(summary.overtimePaid)}`]
  ];
  $('#summaryKpis').innerHTML = kpis.map(([label,value,hint],index) => `<article class="metric-card ${index===0?'accent':''}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(hint)}</small></article>`).join('');

  const rows = [
    ['Ufficio', summary.office], ['Smart working', summary.smartActual], ['Trasferte', summary.travel],
    ['Ferie', summary.absences.vacation || 0], ['Malattia', summary.absences.sick || 0],
    ['Malattia bambino', summary.absences.childSick || 0], ['Congedo obbligatorio', summary.absences.mandatoryLeave || 0],
    ['Congedo facoltativo', summary.absences.optionalLeave || 0], ['Festività soppresse', summary.absences.suppressedHoliday || 0],
    ['Recupero riposo', summary.absences.restRecovery || 0], ['Pianificati da consuntivare', summary.plannedOnly]
  ];
  const max = Math.max(1, ...rows.map(row => row[1]));
  $('#summaryBreakdown').innerHTML = rows.map(([label,value]) => `<div class="breakdown-row"><span>${escapeHtml(label)}</span><span class="bar"><i style="width:${Math.round(value/max*100)}%"></i></span><strong>${value}</strong></div>`).join('');

  const vacationUsed = countAbsenceForYear('vacation', year);
  const suppressedUsed = countAbsenceForYear('suppressedHoliday', year);
  const recoveryUsed = countAbsenceForYear('restRecovery', year);
  const allowances = [
    ['Ferie residue', Math.max(0, Number(state.settings.vacationPrevious)+Number(state.settings.vacationCurrent)-vacationUsed), `usate ${vacationUsed}`],
    ['Festività soppresse', Math.max(0, Number(state.settings.suppressedHolidayAllowance)-suppressedUsed), `usate ${suppressedUsed}`],
    ['Recuperi riposo', Math.max(0, Number(state.settings.restRecoveryAllowance)-recoveryUsed), `usati ${recoveryUsed}`],
    ['Ore lavorate', formatMinutes(summary.workedMinutes), month ? 'nel mese' : 'nell’anno']
  ];
  $('#allowanceSummary').innerHTML = allowances.map(([label,value,hint]) => `<div class="allowance-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(hint)}</small></div>`).join('');

  const asOf = year === new Date().getFullYear() ? dateKeyLocal() : `${year}-12-31`;
  $('#childSummary').innerHTML = state.settings.children.length ? state.settings.children.map(child => {
    const balance = childLeaveBalance(child, state.days, state.settings, asOf);
    const policyName = balance.policy?.label || 'Nessuna policy applicabile';
    return `<article class="list-card"><div><h3>${escapeHtml(child.name)} · ${balance.age ?? '—'} anni</h3><p>${escapeHtml(policyName)}<br>Diritto ${balance.allowance} · usato app ${balance.ownUsed} · esterno ${balance.external} · altro genitore ${balance.otherParent}</p></div><div class="allowance-item"><span>Residuo</span><strong>${balance.remaining}</strong></div></article>`;
  }).join('') : '<p class="empty">Nessun figlio configurato.</p>';
}

function renderAll() {
  renderHeader();
  renderToday();
  renderCalendar();
  renderSummary();
  renderChildOptions();
}

function downloadFile(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportCsv() {
  const year = Number($('#summaryYear').value);
  const month = Number($('#summaryMonth').value);
  const prefix = month ? `${year}-${String(month).padStart(2,'0')}` : String(year);
  const header = ['Data','Pianificato','Effettivo','Assenza','Stato','Ingresso','Pausa inizio','Pausa fine','Uscita','Ore lavorate','Straordinario','Trattamento','Ticket','Destinazione','Note'];
  const lines = [header];
  Object.entries(state.days).sort(([a],[b]) => a.localeCompare(b)).forEach(([key,day]) => {
    if (!key.startsWith(prefix)) return;
    const metrics = getDayMetrics(day, state.settings, dateFromKey(key));
    lines.push([
      key, MODE_LABELS[day.plannedMode] || '', MODE_LABELS[day.actualMode] || '', ABSENCE_TYPES[day.absenceType] || '', day.status || '',
      day.start || '', day.breaks?.[0]?.start || '', day.breaks?.[0]?.end || '', day.end || '', formatMinutes(metrics.worked),
      formatMinutes(metrics.overtime.counted), metrics.overtime.treatment, metrics.ticket ? 'SI' : 'NO', day.tripDestination || '', day.notes || ''
    ]);
  });
  const escapeCsv = value => `"${String(value ?? '').replaceAll('"','""')}"`;
  downloadFile(`orari-${prefix}.csv`, `\ufeff${lines.map(row => row.map(escapeCsv).join(';')).join('\r\n')}`, 'text/csv;charset=utf-8');
}

function bindEvents() {
  $$('.nav-button').forEach(button => button.addEventListener('click', () => switchView(button.dataset.view)));
  $('#editToday').addEventListener('click', () => openDayDialog(dateKeyLocal()));
  $$('.mode-button').forEach(button => button.addEventListener('click', () => {
    const day = ensureDay(dateKeyLocal());
    day.actualMode = button.dataset.mode;
    day.plannedMode ||= button.dataset.mode;
    day.absenceType = '';
    day.status = 'confirmed';
    persist(`Modalità impostata: ${MODE_LABELS[button.dataset.mode]}`);
  }));

  $('#checkInButton').addEventListener('click', () => {
    const day = ensureDay(dateKeyLocal());
    day.actualMode ||= day.plannedMode && day.plannedMode !== 'absence' ? day.plannedMode : state.settings.defaultMode;
    day.plannedMode ||= day.actualMode;
    day.status = 'confirmed';
    day.start = nowTime();
    persist(`Ingresso registrato alle ${day.start}`);
  });

  $('#breakButton').addEventListener('click', () => {
    const day = ensureDay(dateKeyLocal());
    const active = day.breaks.find(item => item.start && !item.end);
    if (active) {
      active.end = nowTime();
      persist(`Pausa terminata alle ${active.end}`);
    } else {
      day.breaks.push({ start: nowTime(), end: '' });
      persist('Pausa iniziata');
    }
  });

  $('#checkOutButton').addEventListener('click', () => {
    const day = ensureDay(dateKeyLocal());
    const active = day.breaks.find(item => item.start && !item.end);
    if (active) active.end = nowTime();
    day.end = nowTime();
    day.status = 'confirmed';
    persist(`Uscita registrata alle ${day.end}`);
  });

  $('#clearToday').addEventListener('click', () => {
    if (!state.days[dateKeyLocal()] || !confirm('Azzerare tutti i dati di oggi?')) return;
    delete state.days[dateKeyLocal()];
    persist('Giornata azzerata');
  });

  $('#prevMonth').addEventListener('click', () => { calendarDate.setMonth(calendarDate.getMonth()-1); renderCalendar(); });
  $('#nextMonth').addEventListener('click', () => { calendarDate.setMonth(calendarDate.getMonth()+1); renderCalendar(); });
  $('#calendarGrid').addEventListener('click', event => {
    const button = event.target.closest('[data-date]');
    if (button) openDayDialog(button.dataset.date);
  });
  $('#bulkType').addEventListener('change', () => $('#bulkChildWrap').hidden = $('#bulkType').value !== 'childSick');
  $('#bulkPlanForm').addEventListener('submit', event => {
    event.preventDefault();
    const start = $('#bulkStart').value;
    const end = $('#bulkEnd').value;
    if (!start || !end || start > end) return showToast('Controlla l’intervallo di date.');
    const weekdays = new Set($$('input[name="weekday"]:checked').map(input => Number(input.value)));
    if (!weekdays.size) return showToast('Seleziona almeno un giorno della settimana.');
    const type = $('#bulkType').value;
    const isMode = ['office','smart','travel'].includes(type);
    const childId = $('#bulkChild').value;
    if (type === 'childSick' && !childId) return showToast('Seleziona un figlio.');
    let count = 0;
    for (const key of eachDate(start,end)) {
      if (!weekdays.has(dateFromKey(key).getDay())) continue;
      const day = ensureDay(key);
      day.plannedMode = isMode ? type : 'absence';
      day.absenceType = isMode ? '' : type;
      day.childId = type === 'childSick' ? childId : '';
      day.status = 'planned';
      count += 1;
    }
    persist(`${count} giornate pianificate`);
  });

  ['#dayPlannedMode','#dayActualMode','#dayAbsenceType','#dayStatus','#dayStart','#dayBreakStart','#dayBreakEnd','#dayEnd','#dayTicketOverride','#dayOvertimeTreatment'].forEach(selector => {
    $(selector).addEventListener('input', () => {
      if (selector === '#dayActualMode' && $('#dayActualMode').value === 'smart' && !$('#dayStart').value) $('#dayStart').value = state.settings.smartDefaultStart;
      updateDayFormVisibility();
      updateDayPreview();
    });
  });
  $$('[data-close-dialog]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  $('#dayForm').addEventListener('submit', event => {
    event.preventDefault();
    const key = $('#dayKey').value;
    const day = dayFromForm();
    const errors = validateTimeSequence(day);
    if (day.absenceType === 'childSick' && !day.childId) errors.push('Seleziona il figlio interessato.');
    if (errors.length) return showToast(errors[0]);
    state.days[key] = day;
    $('#dayDialog').close();
    persist('Giornata salvata');
  });
  $('#deleteDay').addEventListener('click', () => {
    const key = $('#dayKey').value;
    if (!state.days[key] || !confirm('Eliminare questa giornata?')) return;
    delete state.days[key];
    $('#dayDialog').close();
    persist('Giornata eliminata');
  });

  $('#settingsForm').addEventListener('submit', event => {
    event.preventDefault();
    const workMinutes = minutesFromTime($('#workDuration').value);
    if (!workMinutes) return showToast('Inserisci una durata lavorativa valida.');
    Object.assign(state.settings, {
      profileName: $('#profileName').value.trim() || 'Profilo', defaultMode: $('#defaultMode').value, workMinutes,
      pauseOffice: Number($('#pauseOffice').value), pauseSmart: Number($('#pauseSmart').value), pauseTravel: Number($('#pauseTravel').value),
      smartDefaultStart: $('#smartDefaultStart').value || '09:00', ticketOffice: $('#ticketOffice').checked, ticketSmart: $('#ticketSmart').checked,
      ticketTravel: $('#ticketTravel').checked, ticketMinMinutes: Number($('#ticketMinMinutes').value), ticketDelayMonths: Number($('#ticketDelayMonths').value),
      overtimeEnabled: $('#overtimeEnabled').checked, overtimeThreshold: Number($('#overtimeThreshold').value), overtimeThresholdMode: $('#overtimeThresholdMode').value,
      overtimeRounding: Number($('#overtimeRounding').value), overtimeRoundingMode: $('#overtimeRoundingMode').value, overtimeTreatment: $('#overtimeTreatment').value,
      overtimeDailyLimit: Number($('#overtimeDailyLimit').value), vacationPrevious: Number($('#vacationPrevious').value), vacationCurrent: Number($('#vacationCurrent').value),
      suppressedHolidayAllowance: Number($('#suppressedHolidayAllowance').value), restRecoveryAllowance: Number($('#restRecoveryAllowance').value)
    });
    persist('Impostazioni salvate');
  });

  $('#addChild').addEventListener('click', () => openChildDialog());
  $('#childrenList').addEventListener('click', event => {
    const edit = event.target.closest('[data-edit-child]');
    const remove = event.target.closest('[data-delete-child]');
    if (edit) openChildDialog(edit.dataset.editChild);
    if (remove && confirm('Eliminare questo figlio? Le giornate esistenti resteranno registrate.')) {
      state.settings.children = state.settings.children.filter(child => child.id !== remove.dataset.deleteChild);
      persist('Figlio eliminato');
      renderSettings();
    }
  });
  $('#childForm').addEventListener('submit', event => {
    event.preventDefault();
    const id = $('#childId').value || uid('child');
    const child = { id, name: $('#childName').value.trim(), birthDate: $('#childBirthDate').value, usedExternal: Number($('#childUsedExternal').value), usedOtherParent: Number($('#childUsedOtherParent').value), notes: $('#childNotes').value.trim() };
    const index = state.settings.children.findIndex(item => item.id === id);
    if (index >= 0) state.settings.children[index] = child; else state.settings.children.push(child);
    $('#childDialog').close();
    persist('Dati figlio salvati');
    renderSettings();
  });

  $('#addPolicy').addEventListener('click', () => openPolicyDialog());
  $('#policiesList').addEventListener('click', event => {
    const edit = event.target.closest('[data-edit-policy]');
    const remove = event.target.closest('[data-delete-policy]');
    if (edit) openPolicyDialog(edit.dataset.editPolicy);
    if (remove && confirm('Eliminare questa fascia policy?')) {
      state.settings.childPolicies = state.settings.childPolicies.filter(policy => policy.id !== remove.dataset.deletePolicy);
      persist('Fascia eliminata');
      renderSettings();
    }
  });
  $('#policyForm').addEventListener('submit', event => {
    event.preventDefault();
    const minAge = Number($('#policyMinAge').value);
    const maxAge = Number($('#policyMaxAge').value);
    if (maxAge < minAge) return showToast('L’età massima deve essere maggiore o uguale alla minima.');
    const id = $('#policyId').value || uid('policy');
    const policy = { id, label: $('#policyLabel').value.trim(), minAge, maxAge, limitDays: Number($('#policyLimitDays').value) };
    const index = state.settings.childPolicies.findIndex(item => item.id === id);
    if (index >= 0) state.settings.childPolicies[index] = policy; else state.settings.childPolicies.push(policy);
    $('#policyDialog').close();
    persist('Fascia policy salvata');
    renderSettings();
  });

  $('#summaryYear').addEventListener('change', renderSummary);
  $('#summaryMonth').addEventListener('change', renderSummary);
  $('#exportCsv').addEventListener('click', exportCsv);
  $('#exportBackup').addEventListener('click', () => downloadFile(`orari-backup-${dateKeyLocal()}.json`, JSON.stringify(state, null, 2), 'application/json'));
  $('#importBackup').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== 'object' || !parsed.settings || !parsed.days) throw new Error('Formato non riconosciuto');
      if (!confirm('Sostituire tutti i dati locali con il backup selezionato?')) return;
      state = replaceState(parsed);
      renderAll();
      renderSettings();
      showToast('Backup importato');
    } catch (error) {
      showToast(`Importazione non riuscita: ${error.message}`);
    } finally {
      event.target.value = '';
    }
  });
  $('#clearAll').addEventListener('click', () => {
    if (!confirm('Cancellare definitivamente tutti i dati da questo dispositivo?')) return;
    clearState();
    state = emptyState();
    saveState(state);
    renderAll();
    renderSettings();
    showToast('Dati cancellati');
  });

  window.addEventListener('online', renderNetwork);
  window.addEventListener('offline', renderNetwork);
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    $('#installButton').hidden = false;
  });
  $('#installButton').addEventListener('click', async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    $('#installButton').hidden = true;
  });
}

function openChildDialog(id = '') {
  const child = state.settings.children.find(item => item.id === id) || {};
  $('#childId').value = child.id || '';
  $('#childName').value = child.name || '';
  $('#childBirthDate').value = child.birthDate || '';
  $('#childUsedExternal').value = child.usedExternal || 0;
  $('#childUsedOtherParent').value = child.usedOtherParent || 0;
  $('#childNotes').value = child.notes || '';
  $('#childDialog').showModal();
}

function openPolicyDialog(id = '') {
  const policy = state.settings.childPolicies.find(item => item.id === id) || {};
  $('#policyId').value = policy.id || '';
  $('#policyLabel').value = policy.label || '';
  $('#policyMinAge').value = policy.minAge ?? 0;
  $('#policyMaxAge').value = policy.maxAge ?? 3;
  $('#policyLimitDays').value = policy.limitDays ?? 0;
  $('#policyDialog').showModal();
}

function renderNetwork() {
  const badge = $('#networkBadge');
  badge.classList.toggle('offline', !navigator.onLine);
  badge.querySelector('span').textContent = navigator.onLine ? 'Online' : 'Offline';
}

function init() {
  bindEvents();
  renderNetwork();
  renderAll();
  renderSettings();
  setInterval(() => {
    $('#liveClock').textContent = nowTime();
    if (!document.hidden) renderToday();
  }, 30000);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(error => console.warn('Service worker non registrato', error));
}

init();
