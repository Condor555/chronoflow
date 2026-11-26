import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const clientUrl = new URL('../src/config/supabase-client.mjs', import.meta.url);
const configFixtureUrl = new URL('./fixtures/config-2.9.4.js', import.meta.url);

async function createBootstrapFixture() {
  const root = await mkdtemp(join(tmpdir(), 'chrono-flow-294-bootstrap-'));
  const configDirectory = join(root, 'config');
  await import('node:fs/promises').then(({ mkdir }) => mkdir(configDirectory, { recursive: true }));

  const source = await readFile(clientUrl, 'utf8');
  const localSource = source.replace(
    "'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'",
    "'./supabase-js-stub.mjs'"
  );
  assert.notEqual(localSource, source, 'Il test deve sostituire esclusivamente il modulo CDN.');
  await writeFile(join(configDirectory, 'supabase-client.mjs'), localSource);
  await copyFile(configFixtureUrl, join(root, 'config.js'));
  await writeFile(join(configDirectory, 'supabase-js-stub.mjs'), `
    export function createClient(url, key, options) {
      return { url, key, options, auth: { bootstrapFixture: true } };
    }
  `);
  return { root, source };
}

test('3.0.1 imports with the exact 2.9.4 config contract', async () => {
  const fixture = await createBootstrapFixture();
  try {
    const moduleUrl = pathToFileURL(join(fixture.root, 'config', 'supabase-client.mjs')).href;
    const client = await import(`${moduleUrl}?bootstrap=${Date.now()}`);
    assert.equal(client.hasSupabaseConfig(), true);
    assert.equal(client.supabase.url, 'https://chrono-flow-294.supabase.co');
    assert.equal(client.supabase.key, 'sb_publishable_test_294');
    assert.equal(client.supabase.options.auth.persistSession, true);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('bootstrap never requests SUPABASE_ANON_KEY', async () => {
  const fixture = await createBootstrapFixture();
  try {
    assert.doesNotMatch(fixture.source, /import\s*\{[^}]*SUPABASE_ANON_KEY/s);
    assert.doesNotMatch(fixture.source, /(?:config|source)\.SUPABASE_ANON_KEY/);
    assert.match(fixture.source, /source\.SUPABASE_PUBLISHABLE_KEY/);
    assert.match(fixture.source, /import\s+\*\s+as\s+config\s+from\s+['"]\.\.\/config\.js['"]/);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
