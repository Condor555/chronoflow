import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../supabase/migrations/20261126_001_calendar_sharing.sql', import.meta.url), 'utf8');

test('all sharing tables enable RLS', () => {
  for (const table of ['cf_calendar_spaces','cf_calendar_share_settings','cf_calendar_invitations','cf_calendar_members','cf_calendar_entries']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
});

test('raw projection is owner-only and shared reads use masked RPC', () => {
  assert.match(sql, /create policy cf_entries_owner_all[\s\S]*owner_id = auth\.uid\(\)/i);
  assert.match(sql, /create or replace function public\.cf_get_shared_calendar/i);
  assert.match(sql, /case when v_owner or st\.share_children_info then e\.children_info else null end/i);
  assert.doesNotMatch(sql, /create policy[^;]+cf_calendar_entries[^;]+user_id = auth\.uid\(\)/i);
});

test('anonymous users receive no sharing grants', () => {
  assert.match(sql, /revoke all on public\.cf_calendar_entries from anon/i);
  assert.doesNotMatch(sql, /grant execute[^;]+to anon/i);
});

test('future family and group spaces are represented in the schema', () => {
  assert.match(sql, /kind in \('personal','family','group'\)/i);
  assert.match(sql, /role in \('viewer','member','admin'\)/i);
});
