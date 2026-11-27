import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function workerHarness() {
  const source = await readFile(new URL('../sw.v3.1.0.js', import.meta.url), 'utf8');
  const listeners = new Map();
  const calls = { disable: 0, claim: 0, fetch: 0, put: 0, warnings: 0 };
  const network = { ok: true, clone: () => network };
  const cache = { addAll: async () => {}, match: async () => null, put: async () => { calls.put += 1; } };
  class RequestStub { constructor(input, options = {}) { Object.assign(this, input); this.cache = options.cache; } }
  const self = {
    location: { origin: 'https://example.test' },
    registration: { navigationPreload: { disable: async () => { calls.disable += 1; } } },
    clients: { claim: async () => { calls.claim += 1; } },
    skipWaiting() {},
    addEventListener(type, handler) { listeners.set(type, handler); }
  };
  vm.runInNewContext(source, {
    self, URL, Request: RequestStub, Promise,
    caches: { open: async () => cache, keys: async () => ['old'], delete: async () => true, match: async () => null },
    fetch: async () => { calls.fetch += 1; return network; },
    console: { warn() { calls.warnings += 1; } }
  });
  return { source, listeners, calls, network };
}

test('activate disabilita navigation preload e prende controllo', async () => {
  const h = await workerHarness();
  let promise;
  h.listeners.get('activate')({ waitUntil(value) { promise = value; } });
  await promise;
  assert.equal(h.calls.disable, 1);
  assert.equal(h.calls.claim, 1);
});

test('reload/PWA reopen attende preloadResponse prima di rispondere', async () => {
  const h = await workerHarness();
  const preloaded = { ok: true, preload: true };
  let response;
  let respondWithCalls = 0;
  h.listeners.get('fetch')({
    request: { method: 'GET', url: 'https://example.test/chronoflow/', mode: 'navigate' },
    preloadResponse: Promise.resolve(preloaded),
    respondWith(value) { respondWithCalls += 1; response = value; }
  });
  assert.equal(respondWithCalls, 1);
  assert.equal(await response, preloaded);
  assert.equal(h.calls.fetch, 0);
  assert.equal(h.calls.warnings, 0);
});

test('navigazione senza preload usa network-first e settle di respondWith', async () => {
  const h = await workerHarness();
  let response;
  h.listeners.get('fetch')({
    request: { method: 'GET', url: 'https://example.test/chronoflow/', mode: 'navigate' },
    preloadResponse: Promise.resolve(undefined),
    respondWith(value) { response = value; }
  });
  assert.equal(await response, h.network);
  assert.equal(h.calls.fetch, 1);
  assert.equal(h.calls.put, 1);
});
