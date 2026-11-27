function unwrap(response, fallback) {
  const { data, error } = response && typeof response === 'object' ? response : {};
  if (error) throw new Error(error.message || fallback, { cause: error });
  return data;
}

export class PersonalDayService {
  constructor(client) {
    if (!client) throw new Error('Client dati non configurato.');
    this.client = client;
  }

  async getDashboard() {
    return unwrap(
      await this.client.rpc('cf_get_calendar_sharing_dashboard'),
      'Impossibile caricare la giornata.'
    ) || { space: null };
  }

  async getSharedCalendar(spaceId, fromDate, toDate) {
    return unwrap(await this.client.rpc('cf_get_shared_calendar', {
      p_space_id: spaceId,
      p_from: fromDate,
      p_to: toDate
    }), 'Impossibile caricare la giornata.') || [];
  }

  async upsertProjection(entries) {
    if (!Array.isArray(entries) || entries.length === 0) return 0;
    return unwrap(
      await this.client.rpc('cf_upsert_calendar_projection', { p_entries: entries }),
      'Impossibile registrare la giornata.'
    );
  }
}
