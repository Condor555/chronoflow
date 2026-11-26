import { DEFAULT_SHARING_SETTINGS, isEmail, normalizeEmail } from './calendar-privacy.mjs';

function unwrap({ data, error }) {
  if (error) throw new Error(error.message || 'Operazione non riuscita.');
  return data;
}

export class CalendarSharingService {
  constructor(client) {
    if (!client) throw new Error('Client Supabase non configurato.');
    this.client = client;
  }

  async ensurePersonalSpace() {
    const data = unwrap(await this.client.rpc('cf_ensure_personal_calendar_space'));
    return Array.isArray(data) ? data[0] : data;
  }

  async getDashboard() {
    const data = unwrap(await this.client.rpc('cf_get_calendar_sharing_dashboard'));
    return data || { space: null, settings: DEFAULT_SHARING_SETTINGS, invitations: [], members: [] };
  }

  async setEnabled(enabled) {
    return unwrap(await this.client.rpc('cf_set_calendar_sharing_enabled', { p_enabled: Boolean(enabled) }));
  }

  async updateSettings(settings) {
    const safe = {};
    for (const key of Object.keys(DEFAULT_SHARING_SETTINGS)) safe[key] = Boolean(settings[key]);
    return unwrap(await this.client.rpc('cf_update_calendar_sharing_settings', { p_settings: safe }));
  }

  async invite(email) {
    const normalized = normalizeEmail(email);
    if (!isEmail(normalized)) throw new Error('Inserisci un indirizzo email valido.');
    return unwrap(await this.client.rpc('cf_invite_calendar_viewer', { p_email: normalized }));
  }

  async revoke(memberId) {
    return unwrap(await this.client.rpc('cf_revoke_calendar_member', { p_member_id: memberId }));
  }

  async cancelInvitation(invitationId) {
    return unwrap(await this.client.rpc('cf_cancel_calendar_invitation', { p_invitation_id: invitationId }));
  }

  async listIncomingInvitations() {
    return unwrap(await this.client.rpc('cf_list_calendar_invitations')) || [];
  }

  async respondInvitation(invitationId, accept) {
    return unwrap(await this.client.rpc('cf_respond_calendar_invitation', {
      p_invitation_id: invitationId,
      p_accept: Boolean(accept)
    }));
  }

  async listSharedCalendars() {
    return unwrap(await this.client.rpc('cf_list_shared_calendars')) || [];
  }

  async getSharedCalendar(spaceId, fromDate, toDate) {
    return unwrap(await this.client.rpc('cf_get_shared_calendar', {
      p_space_id: spaceId,
      p_from: fromDate,
      p_to: toDate
    })) || [];
  }

  async upsertProjection(entries) {
    if (!Array.isArray(entries) || entries.length === 0) return [];
    if (entries.length > 400) throw new Error('Sincronizza al massimo 400 giornate alla volta.');
    return unwrap(await this.client.rpc('cf_upsert_calendar_projection', { p_entries: entries }));
  }

  async deleteProjection(fromDate, toDate) {
    return unwrap(await this.client.rpc('cf_delete_calendar_projection', {
      p_from: fromDate,
      p_to: toDate
    }));
  }
}

/**
 * Adapter non distruttivo per collegare la baseline 2.9.4.
 * Passare giornate già lette dal calendario personale; nessun dato è inviato a terzi.
 * I campi restano nella tabella privata del proprietario e sono mascherati dalla RPC.
 */
export function mapChronoDaysToProjection(days) {
  return (days || []).map((day) => ({
    work_date: day.work_date || day.date,
    mode: day.mode || null,
    is_absent: Boolean(day.is_absent || day.absence_type),
    generic_absence_label: day.is_absent || day.absence_type ? 'Assente' : null,
    clock_in: day.clock_in || day.start_time || null,
    clock_out: day.clock_out || day.end_time || null,
    overtime_minutes: day.overtime_minutes ?? null,
    meal_voucher: day.meal_voucher ?? null,
    leave_balance_days: day.leave_balance_days ?? null,
    absence_type: day.absence_type || null,
    personal_notes: day.notes || day.personal_notes || null,
    children_info: day.children_info || null
  })).filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry.work_date));
}
