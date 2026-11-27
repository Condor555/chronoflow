import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const clientUrl = new URL('../src/supabase-client.v3.0.3.mjs', import.meta.url);
const configFixtureUrl = new URL('./fixtures/config-2.9.4.js', import.meta.url);
const VERSIONED_CLIENT = './supabase-client.v3.0.3.mjs';

async function createBootstrapFixture() {
  const root = await mkdtemp(join(tmpdir(), 'chrono-flow-303-bootstrap-'));
  const source = await readFile(clientUrl, 'utf8');
  const localSource = source.replace(
    "'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'",
    "'./supabase-js-stub.mjs'"
  );

  assert.notEqual(localSource, source, 'Il test deve sostituire esclusivamente il modulo CDN.');
  await writeFile(join(root, 'supabase-client.v3.0.3.mjs'), localSource);
  await copyFile(configFixtureUrl, join(root, 'config.js'));
  await writeFile(join(root, 'supabase-js-stub.mjs'), `
    export function createClient(url, key, options) {
      return { url, key, options, auth: { bootstrapFixture: true } };
    }
  `);
  return { root, source };
}

async function readProjectFile(relativePath) {
  return readFile(join(projectRoot, relativePath), 'utf8');
}

function localModuleSpecifiers(source) {
  const specifiers = [];
  const pattern = /(?:import|export)\s+(?:[^'\"]*?\sfrom\s*)?['\"]([^'\"]+)['\"]/g;
  for (const match of source.matchAll(pattern)) {
    if (match[1].startsWith('.')) specifiers.push(match[1]);
  }
  return specifiers;
}

async function collectStaticGraph(entryRelativePath) {
  const pending = [entryRelativePath];
  const visited = new Map();

  while (pending.length) {
    const relativePath = pending.pop();
    if (visited.has(relativePath)) continue;
    const source = await readProjectFile(relativePath);
    visited.set(relativePath, source);

    for (const specifier of localModuleSpecifiers(source)) {
      const cleanSpecifier = specifier.split(/[?#]/, 1)[0];
      const dependency = join(dirname(relativePath), cleanSpecifier)
        .replaceAll('\\', '/');
      pending.push(dependency);
    }
  }

  return visited;
}

test('3.0.3 imports with the exact 2.9.4 config contract', async () => {
  const fixture = await createBootstrapFixture();
  try {
    const moduleUrl = pathToFileURL(join(fixture.root, 'supabase-client.v3.0.3.mjs')).href;
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
    const moduleUrl = pathToFileURL(join(fixture.root, 'supabase-client.v3.0.3.mjs')).href;
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
    const moduleUrl = pathToFileURL(join(fixture.root, 'supabase-client.v3.0.3.mjs')).href;
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

test('restored bootstrap uses the stable client and immutable 3.2 service worker', async () => {
  const [indexSource, appSource, workerSource, legacySource] = await Promise.all([
    readProjectFile('index.html'),
    readProjectFile('src/app.js'),
    readProjectFile('sw.v3.3.3.js'),
    readProjectFile('src/supabase-client.mjs')
  ]);

  assert.match(indexSource, /src=["']src\/app\.v3\.3\.3\.mjs["']/);
  assert.match(appSource, /from\s+['"]\.\/supabase-client\.v3\.0\.3\.mjs['"]/);
  assert.doesNotMatch(appSource, /from\s+['"]\.\/supabase-client\.mjs['"]/);
  assert.match(appSource, /register\(["']\.\/sw\.v3\.3\.3\.js["']/);
  assert.match(workerSource, /\.\/src\/supabase-client\.v3\.0\.3\.mjs/);
  assert.doesNotMatch(workerSource, /['"]\.\/src\/(?:config\/)?supabase-client\.mjs['"]/);
  assert.match(legacySource, /from\s+['"]\.\/supabase-client\.v3\.0\.3\.mjs['"]/);

  const graph = await collectStaticGraph('src/app.js');
  const clientReferences = [];
  for (const [relativePath, source] of graph) {
    assert.doesNotMatch(
      source,
      /import\s*\{[^}]*SUPABASE_ANON_KEY|(?:config|source)\?*\.SUPABASE_ANON_KEY/s,
      `${relativePath} non deve dipendere da SUPABASE_ANON_KEY`
    );
    for (const specifier of localModuleSpecifiers(source)) {
      if (specifier.includes('supabase-client')) clientReferences.push(specifier);
    }
  }

  assert.deepEqual([...new Set(clientReferences)], [VERSIONED_CLIENT]);
});
