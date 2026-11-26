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

test('3.0.2 imports with the exact 2.9.4 config contract', async () => {
  const fixture = await createBootstrapFixture();
  try {
    const moduleUrl = pathToFileURL(join(fixture.root, 'config', 'supabase-client.mjs')).href;
    const client = await import(`${moduleUrl}?bootstrap=${Date.now()}`);
    assert.equal(client.hasSupabaseConfig(), true);
    assert.equal(client.supabase.url, 'https://xmrvfmtqcsyrtobztzdh.supabase.co');
    assert.equal(client.supabase.key, 'sb_publishable_v5t7fJK_test_format_294');
    assert.equal(client.supabase.options.auth.persistSession, true);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('real published URL and sb_publishable format create a non-null client', async () => {
  const fixture = await createBootstrapFixture();
  try {
    const moduleUrl = pathToFileURL(join(fixture.root, 'config', 'supabase-client.mjs')).href;
    const client = await import(`${moduleUrl}?real-values=${Date.now()}`);
    const realFormat = {
      SUPABASE_URL: 'https://xmrvfmtqcsyrtobztzdh.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example_value'
    };
    assert.equal(client.hasSupabaseConfig(realFormat), true);
    let invocation;
    const created = client.createConfiguredSupabaseClient(realFormat, (url, key, options) => {
      invocation = { url, key, options };
      return { connected: true };
    });
    assert.deepEqual(created, { connected: true });
    assert.equal(invocation.url, realFormat.SUPABASE_URL);
    assert.equal(invocation.key, realFormat.SUPABASE_PUBLISHABLE_KEY);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('normalization accepts surrounding whitespace and one trailing slash', async () => {
  const fixture = await createBootstrapFixture();
  try {
    const moduleUrl = pathToFileURL(join(fixture.root, 'config', 'supabase-client.mjs')).href;
    const client = await import(`${moduleUrl}?normalization=${Date.now()}`);
    const source = {
      SUPABASE_URL: '  https://xmrvfmtqcsyrtobztzdh.supabase.co/  ',
      SUPABASE_PUBLISHABLE_KEY: '  sb_publishable_example_value  '
    };
    assert.equal(client.hasSupabaseConfig(source), true);
    const created = client.createConfiguredSupabaseClient(source, (url, key) => ({ url, key }));
    assert.deepEqual(created, {
      url: 'https://xmrvfmtqcsyrtobztzdh.supabase.co',
      key: 'sb_publishable_example_value'
    });
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('bootstrap never requests SUPABASE_ANON_KEY', async () => {
  const fixture = await createBootstrapFixture();
  try {
    assert.doesNotMatch(fixture.source, /import\s*\{[^}]*SUPABASE_ANON_KEY/s);
    assert.doesNotMatch(fixture.source, /(?:config|source)\.SUPABASE_ANON_KEY/);
    assert.match(fixture.source, /source\?\.SUPABASE_PUBLISHABLE_KEY/);
    assert.match(fixture.source, /import\s+\*\s+as\s+config\s+from\s+['"]\.\.\/config\.js['"]/);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
