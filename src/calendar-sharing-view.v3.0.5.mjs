import { addDays, enumerateDays, formatDay, formatMonth, monthRange, shiftMonth, toIsoDate, weekRange } from './calendar-date.mjs';
import { DEFAULT_SHARING_SETTINGS, entrySummary, MODE_META, minutesToDuration } from './calendar-privacy.v3.0.5.mjs';
import { normalizeCalendarRecord, normalizeCalendarRows } from './calendar-record.v3.0.5.mjs';

const SETTING_LABELS = {
  share_work_mode: ['Modalità di lavoro', 'Ufficio, Smart Working e Trasferta.', true],
  share_generic_absence: ['Stato generico di assenza', 'Mostra solo “Assente”, senza causale.', false],
  share_times: ['Orari di ingresso e uscita', 'Informazione personale: disattivata per default.', false],
  share_overtime: ['Straordinari', 'Informazione personale: disattivata per default.', false],
  share_meal_vouchers: ['Buoni pasto', 'Informazione personale: disattivata per default.', false],
  share_leave_balance: ['Ferie residue', 'Informazione personale: disattivata per default.', false],
  share_absence_details: ['Tipologia dettagliata di assenza', 'Può rivelare dati sanitari o familiari.', false],
  share_personal_notes: ['Note personali', 'Potrebbero contenere informazioni riservate.', false],
  share_children_info: ['Informazioni sui figli', 'Dato familiare: condividilo solo se necessario.', false]
};

const esc = (value) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

function monthGrid(year, month) {
  const { start, end } = monthRange(year, month);
  const days = enumerateDays(start, end);
  const leading = (new Date(year, month, 1, 12).getDay() || 7) - 1;
  return [...Array(leading).fill(null), ...days];
}

function personName(calendar) {
  return calendar?.owner_display_name || calendar?.name || calendar?.owner_email_masked || 'Calendario condiviso';
}

function modeBadge(value) {
  const entry = normalizeCalendarRecord(value);
  const { mode: modeKey, generic_absence_label, absence_type } = entry;
  const mode = MODE_META[modeKey];
  if (!mode && !generic_absence_label && !absence_type) return '';
  const label = entrySummary(entry);
  const klass = absence_type || generic_absence_label ? 'absence' : (modeKey || 'other');
  return `<span class="day-badge ${esc(klass)}">${mode ? `<span aria-hidden="true">${mode.icon}</span> ` : ''}${esc(label)}</span>`;
}

function details(value) {
  const { clock_in, clock_out, overtime_minutes, meal_voucher, leave_balance_days, personal_notes } = normalizeCalendarRecord(value);
  const rows = [];
  if (clock_in || clock_out) rows.push(`Orario ${clock_in || '—'}–${clock_out || '—'}`);
  if (overtime_minutes !== null) rows.push(`Straordinario ${minutesToDuration(overtime_minutes)}`);
  if (meal_voucher !== null) rows.push(meal_voucher ? 'Buono pasto' : 'Nessun buono');
  if (leave_balance_days !== null) rows.push(`Ferie residue ${leave_balance_days}`);
  if (personal_notes) rows.push(personal_notes);
  return rows.map((row) => `<small>${esc(row)}</small>`).join('');
}

export class CalendarSharingView {
  constructor(root, service, {
    announce = () => {},
    logger = console,
    includeMine = true,
    initialSection = includeMine ? 'mine' : 'shared'
  } = {}) {
    this.root = root;
    this.service = service;
    this.announce = announce;
    this.logger = logger;
    this.includeMine = includeMine;
    const now = new Date();
    this.state = {
      section: initialSection, year: now.getFullYear(), month: now.getMonth(), week: toIsoDate(now),
      dashboard: null, incoming: [], calendars: [], selectedSpace: null, compareSpaces: [], entries: new Map(), busy: false, error: null
    };
    this.onClick = this.onClick.bind(this);
    this.onChange = this.onChange.bind(this);
    this.onSubmit = this.onSubmit.bind(this);
  }

  async init() {
    this.root.addEventListener('click', this.onClick);
    this.root.addEventListener('change', this.onChange);
    this.root.addEventListener('submit', this.onSubmit);
    await this.refresh();
  }

  destroy() {
    this.root.removeEventListener('click', this.onClick);
    this.root.removeEventListener('change', this.onChange);
    this.root.removeEventListener('submit', this.onSubmit);
  }

  async setSection(section) {
    const allowed = this.includeMine
      ? new Set(['mine', 'shared', 'compare', 'settings'])
      : new Set(['shared', 'compare', 'settings']);
    this.state.section = allowed.has(section) ? section : (this.includeMine ? 'mine' : 'shared');
    this.safeRender();
    await this.loadVisibleEntries();
  }

  async refresh() {
    return this.run(() => this.reloadData());
  }

  async reloadData() {
    await this.service.ensurePersonalSpace();
    const [dashboard, incoming, calendars] = await Promise.all([
      this.service.getDashboard(), this.service.listIncomingInvitations(), this.service.listSharedCalendars()
    ]);
    this.state.dashboard = dashboard && typeof dashboard === 'object' ? dashboard : { space: null };
    this.state.incoming = Array.isArray(incoming) ? incoming.filter(Boolean) : [];
    this.state.calendars = Array.isArray(calendars) ? calendars.filter(Boolean) : [];
    if (!this.state.calendars.some((item) => item?.space_id === this.state.selectedSpace)) {
      this.state.selectedSpace = this.state.calendars[0]?.space_id || null;
    }
    this.safeRender();
    await this.loadVisibleEntries();
  }

  reportError(error, source = 'Calendar route') {
    const caught = error instanceof Error ? error : new Error(String(error || 'Operazione non riuscita.'));
    this.logger.error(`[Chrono Flow] ${source}`, caught);
    this.state.error = 'Non è stato possibile caricare il calendario. Puoi riprovare oppure tornare a Oggi.';
    this.announce(this.state.error, 'error');
    return caught;
  }

  safeRender() {
    try {
      this.render();
      return true;
    } catch (error) {
      this.reportError(error, 'Calendar render');
      this.root.innerHTML = `<section class="empty-state" role="alert"><h1>Calendario non disponibile</h1><p>${esc(this.state.error)}</p><button data-action="refresh">Riprova</button></section>`;
      return false;
    }
  }

  async run(action) {
    if (this.state.busy) return;
    this.state.busy = true;
    this.state.error = null;
    this.safeRender();
    try { await action(); }
    catch (error) { this.reportError(error); }
    finally { this.state.busy = false; this.safeRender(); }
  }

  async loadVisibleEntries() {
    const spaces = this.activeSpaces();
    if (!spaces.length) { this.safeRender(); return; }
    const range = this.state.section === 'compare'
      ? weekRange(this.state.week)
      : monthRange(this.state.year, this.state.month);
    await Promise.all(spaces.map(async (spaceId) => {
      const rows = normalizeCalendarRows(await this.service.getSharedCalendar(spaceId, range.start, range.end));
      this.state.entries.set(spaceId, new Map(rows.map((row) => [row.work_date, row])));
    }));
    this.safeRender();
  }

  activeSpaces() {
    if (this.state.section === 'mine') return this.state.dashboard?.space?.id ? [this.state.dashboard.space.id] : [];
    if (this.state.section === 'shared') return this.state.selectedSpace ? [this.state.selectedSpace] : [];
    if (this.state.section === 'compare') return this.state.compareSpaces;
    return [];
  }

  render() {
    const s = this.state;
    const pendingCount = s.incoming.filter((item) => item.status === 'pending').length;
    this.root.innerHTML = `
      <section class="calendar-shell" aria-busy="${s.busy}">
        <div class="section-heading">
          <div><p class="eyebrow">CALENDARIO</p><h1>Organizza e confronta le giornate</h1></div>
          <button class="icon-button" data-action="refresh" aria-label="Aggiorna calendario">↻</button>
        </div>
        <div class="segmented" role="tablist" aria-label="Sezioni calendario">
          ${this.includeMine ? this.tab('mine', 'Il mio') : ''}${this.tab('shared', `Condivisi${pendingCount ? ` · ${pendingCount}` : ''}`)}${this.tab('compare', 'Confronta')}
        </div>
        ${s.busy ? '<p class="calendar-status" role="status">Caricamento calendario…</p>' : ''}
        ${s.error ? `<div class="notice-card" role="alert"><strong>Calendario temporaneamente non disponibile</strong><p>${esc(s.error)}</p></div>` : ''}
        <div class="calendar-content" role="tabpanel">
          ${s.section === 'settings' ? this.renderSettings() : ''}
          ${s.section === 'mine' ? this.renderMonth(s.dashboard?.space?.id, 'Il mio calendario') : ''}
          ${s.section === 'shared' ? this.renderShared() : ''}
          ${s.section === 'compare' ? this.renderCompare() : ''}
        </div>
        ${s.section !== 'settings' ? `<button class="floating-settings" data-section="settings"><span aria-hidden="true">⚙</span> Condivisione</button>` : ''}
      </section>`;
  }

  tab(section, label) {
    const active = this.state.section === section;
    return `<button role="tab" aria-selected="${active}" class="segment ${active ? 'active' : ''}" data-section="${section}">${esc(label)}</button>`;
  }

  renderMonth(spaceId, title) {
    const entries = this.state.entries.get(spaceId) || new Map();
    const cells = monthGrid(this.state.year, this.state.month);
    const emptyMessage = !this.state.busy && entries.size === 0
      ? '<div class="empty-state compact"><h2>Nessuna giornata registrata</h2><p>In questo mese non risultano ancora giornate da mostrare.</p></div>'
      : '';
    return `
      <div class="toolbar">
        <button class="icon-button" data-month="-1" aria-label="Mese precedente">‹</button>
        <h2>${esc(title)}<span>${esc(formatMonth(this.state.year, this.state.month))}</span></h2>
        <button class="icon-button" data-month="1" aria-label="Mese successivo">›</button>
      </div>
      ${emptyMessage}
      <div class="weekday-row" aria-hidden="true">${['L','M','M','G','V','S','D'].map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="month-grid" aria-label="${esc(formatMonth(this.state.year, this.state.month))}">
        ${cells.map((date) => {
          if (!date) return '<div class="day-cell empty" aria-hidden="true"></div>';
          const entry = normalizeCalendarRecord(entries.get(date), date);
          const { mode } = entry;
          const n = Number(date.slice(-2));
          return `<article class="day-cell ${mode || ''}" aria-label="${esc(formatDay(date))}: ${esc(entrySummary(entry))}">
            <strong>${n}</strong>${modeBadge(entry)}${details(entry)}
          </article>`;
        }).join('')}
      </div>`;
  }

  renderShared() {
    const invitations = this.state.incoming.filter((item) => item.status === 'pending');
    const selected = this.state.calendars.find((item) => item.space_id === this.state.selectedSpace);
    return `
      ${invitations.length ? `<section class="notice-card"><h2>Inviti ricevuti</h2>${invitations.map((invite) => `
        <div class="invite-row"><div><strong>${esc(invite.owner_display_name)}</strong><small>Vuole condividere il suo calendario con te.</small></div>
        <div class="row-actions"><button data-invite-response="accept" data-id="${esc(invite.id)}">Accetta</button><button class="secondary" data-invite-response="reject" data-id="${esc(invite.id)}">Rifiuta</button></div></div>`).join('')}</section>` : ''}
      ${this.state.calendars.length ? `
        <label class="field"><span>Calendario di</span><select id="shared-person-select">
          ${this.state.calendars.map((item) => `<option value="${esc(item.space_id)}" ${item.space_id === this.state.selectedSpace ? 'selected' : ''}>${esc(personName(item))}</option>`).join('')}
        </select></label>
        ${this.renderMonth(this.state.selectedSpace, personName(selected))}` : `
        <div class="empty-state"><span aria-hidden="true">👥</span><h2>Nessun calendario condiviso</h2><p>Gli inviti accettati appariranno qui. Per consultare un calendario è sempre necessario accedere a Chrono Flow.</p></div>`}`;
  }

  renderCompare() {
    const range = weekRange(this.state.week);
    const people = this.state.calendars;
    const days = enumerateDays(range.start, range.end);
    return `
      <fieldset class="people-picker"><legend>Persone da confrontare</legend>
        ${people.length ? people.map((item) => `<label><input type="checkbox" name="compare-space" value="${esc(item.space_id)}" ${this.state.compareSpaces.includes(item.space_id) ? 'checked' : ''}> <span>${esc(personName(item))}</span></label>`).join('') : '<p>Nessun calendario disponibile.</p>'}
      </fieldset>
      <div class="toolbar week-toolbar"><button class="icon-button" data-week="-7" aria-label="Settimana precedente">‹</button><h2>Settimana<span>${esc(formatDay(range.start))} – ${esc(formatDay(range.end))}</span></h2><button class="icon-button" data-week="7" aria-label="Settimana successiva">›</button></div>
      ${this.state.compareSpaces.length ? `<div class="week-cards">${days.map((date) => `
        <article class="week-card"><h3>${esc(formatDay(date))}</h3><div class="person-list">
          ${this.state.compareSpaces.map((spaceId) => {
            const calendar = people.find((item) => item.space_id === spaceId);
            const entry = this.state.entries.get(spaceId)?.get(date);
            return `<div class="person-row"><strong>${esc(personName(calendar))}</strong><div>${modeBadge(entry) || '<span class="muted">Nessuna informazione</span>'}${details(entry)}</div></div>`;
          }).join('')}
        </div></article>`).join('')}</div>` : `<div class="empty-state compact"><h2>Scegli almeno una persona</h2><p>Puoi confrontare più calendari in una vista settimanale a card.</p></div>`}`;
  }

  renderSettings() {
    const dashboard = this.state.dashboard || {};
    const settings = { ...DEFAULT_SHARING_SETTINGS, ...(dashboard.settings || {}) };
    const members = dashboard.members || [];
    const invitations = dashboard.invitations || [];
    return `
      <div class="settings-header"><button class="back-button" data-section="mine">← Calendario</button><p class="eyebrow">PRIVACY</p><h1>Condivisione calendario</h1><p>Accesso in sola lettura. Le informazioni non abilitate non sono restituite dal database.</p></div>
      <section class="settings-card emphasis">
        <label class="switch-row"><span><strong>Condivisione attiva</strong><small>Disattivandola, tutti gli accessi vengono sospesi immediatamente.</small></span><input type="checkbox" id="sharing-enabled" ${dashboard.space?.is_enabled ? 'checked' : ''}></label>
      </section>
      <section class="settings-card"><h2>Invita una persona</h2><p>L’indirizzo deve corrispondere all’account Chrono Flow del destinatario.</p>
        <form id="invite-form" class="inline-form"><label class="sr-only" for="invite-email">Email</label><input id="invite-email" name="email" type="email" autocomplete="email" placeholder="nome@esempio.it" required><button type="submit">Invita</button></form>
      </section>
      <form id="privacy-form" class="settings-card"><div class="card-heading"><div><h2>Informazioni condivise</h2><p>Solo la modalità di lavoro è attiva per default.</p></div><button type="submit">Salva</button></div>
        <div class="privacy-list">${Object.entries(SETTING_LABELS).map(([key, [label, hint, recommended]]) => `<label class="switch-row ${!recommended ? 'sensitive' : ''}"><span><strong>${esc(label)}</strong><small>${esc(hint)}</small></span><input type="checkbox" name="${key}" ${settings[key] ? 'checked' : ''}></label>`).join('')}</div>
      </form>
      <section class="settings-card"><h2>Accessi attivi</h2>${members.length ? members.map((member) => `<div class="member-row"><div><strong>${esc(member.display_name || member.email_masked)}</strong><small>Sola lettura</small></div><button class="danger secondary" data-revoke="${esc(member.id)}">Revoca</button></div>`).join('') : '<p class="muted">Nessuna persona ha accesso.</p>'}</section>
      <section class="settings-card"><h2>Inviti inviati</h2>${invitations.length ? invitations.map((invite) => `<div class="member-row"><div><strong>${esc(invite.invitee_email)}</strong><small>${invite.status === 'pending' ? 'In attesa' : esc(invite.status)}</small></div>${invite.status === 'pending' ? `<button class="secondary" data-cancel-invite="${esc(invite.id)}">Annulla</button>` : ''}</div>`).join('') : '<p class="muted">Nessun invito.</p>'}</section>`;
  }

  async onClick(event) {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.section) { await this.setSection(button.dataset.section); return; }
    if (button.dataset.action === 'refresh') return this.refresh();
    if (button.dataset.month) { const next = shiftMonth(this.state.year, this.state.month, Number(button.dataset.month)); Object.assign(this.state, next); this.safeRender(); return this.loadVisibleEntries(); }
    if (button.dataset.week) { this.state.week = toIsoDate(addDays(this.state.week, Number(button.dataset.week))); this.safeRender(); return this.loadVisibleEntries(); }
    if (button.dataset.inviteResponse) return this.run(async () => { await this.service.respondInvitation(button.dataset.id, button.dataset.inviteResponse === 'accept'); await this.reloadData(); });
    if (button.dataset.revoke) return this.run(async () => { await this.service.revoke(button.dataset.revoke); this.announce('Accesso revocato.'); await this.reloadData(); });
    if (button.dataset.cancelInvite) return this.run(async () => { await this.service.cancelInvitation(button.dataset.cancelInvite); this.announce('Invito annullato.'); await this.reloadData(); });
  }

  async onChange(event) {
    if (event.target.id === 'shared-person-select') { this.state.selectedSpace = event.target.value; return this.loadVisibleEntries(); }
    if (event.target.id === 'sharing-enabled') return this.run(async () => { await this.service.setEnabled(event.target.checked); this.announce(event.target.checked ? 'Condivisione attivata.' : 'Condivisione sospesa.'); await this.reloadData(); });
    if (event.target.name === 'compare-space') {
      this.state.compareSpaces = [...this.root.querySelectorAll('input[name="compare-space"]:checked')].map((input) => input.value);
      this.safeRender(); return this.loadVisibleEntries();
    }
  }

  async onSubmit(event) {
    if (event.target.id === 'invite-form') {
      event.preventDefault();
      const email = new FormData(event.target).get('email');
      return this.run(async () => { await this.service.invite(email); this.announce('Invito creato.'); await this.reloadData(); });
    }
    if (event.target.id === 'privacy-form') {
      event.preventDefault();
      const form = new FormData(event.target);
      const settings = Object.fromEntries(Object.keys(DEFAULT_SHARING_SETTINGS).map((key) => [key, form.get(key) === 'on']));
      return this.run(async () => { await this.service.updateSettings(settings); this.announce('Preferenze di condivisione salvate.'); await this.reloadData(); });
    }
  }
}
