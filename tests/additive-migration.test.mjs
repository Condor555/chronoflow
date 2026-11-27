import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../supabase/migrations/20261126_001_calendar_sharing.sql', import.meta.url), 'utf8');

test('la migration calendario è additiva rispetto a work_days, profiles e dati preesistenti', () => {
  assert.doesNotMatch(sql, /\bdrop\s+table\b/i);
  assert.doesNotMatch(sql, /\btruncate\b/i);
  assert.doesNotMatch(sql, /\b(?:delete\s+from|update|alter\s+table)\s+public\.(?:work_days|profiles)\b/i);
  assert.doesNotMatch(sql, /\bcreate\s+table\s+(?!if\s+not\s+exists)/i);
  const created = [...sql.matchAll(/create\s+table\s+if\s+not\s+exists\s+public\.([a-z0-9_]+)/gi)].map((match) => match[1]);
  assert.deepEqual(created.sort(), [
    'cf_calendar_entries', 'cf_calendar_invitations', 'cf_calendar_members',
    'cf_calendar_share_settings', 'cf_calendar_spaces'
  ]);
  assert.equal([...sql.matchAll(/\b(?:update|delete\s+from|alter\s+table)\s+public\.([a-z0-9_]+)/gi)]
    .every((match) => match[1].startsWith('cf_calendar_')), true);
});
