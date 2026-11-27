import { DEFAULT_SHARING_SETTINGS, isEmail, normalizeEmail } from './calendar-privacy.v3.0.5.mjs';
import { normalizeCalendarRecord, normalizeCalendarRows } from './calendar-record.v3.0.5.mjs';

function unwrap(response) {
  const { data, error } = response && typeof response === 'object' ? response : {};
  if (error) throw new Error(error.message || 'Operazione non riuscita.', { cause: error });
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
    return normalizeCalendarRows(unwrap(await this.client.rpc('cf_get_shared_calendar', {
      p_space_id: spaceId,
      p_from: fromDate,
      p_to: toDate
    })));
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
  return normalizeCalendarRows(days).map((value) => {
    const entry = normalizeCalendarRecord(value);
    const {
      work_date, mode, is_absent, generic_absence_label, clock_in, clock_out,
      overtime_minutes, meal_voucher, leave_balance_days, absence_type,
      personal_notes, children_info
    } = entry;
    return {
      work_date, mode, is_absent,
      generic_absence_label: generic_absence_label || (is_absent || absence_type ? 'Assente' : null),
      clock_in, clock_out, overtime_minutes, meal_voucher, leave_balance_days,
      absence_type, personal_notes, children_info
    };
  });
}
