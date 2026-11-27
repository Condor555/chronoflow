import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function loadWorker() {
  const source = await readFile(new URL('../sw.v3.3.0.js', import.meta.url), 'utf8');
  const listeners = new Map();
  const calls = { disable: 0, claim: 0, fetch: 0, put: 0 };
  const networkResponse = { ok: true, clone: () => networkResponse };
  const cache = {
    addAll: async () => {},
    match: async () => null,
    put: async () => { calls.put += 1; }
  };
  class RequestStub {
    constructor(input, options = {}) {
      Object.assign(this, input);
      this.cache = options.cache;
    }
  }
  const self = {
    location: { origin: 'https://example.test' },
    registration: { navigationPreload: { disable: async () => { calls.disable += 1; } } },
    clients: { claim: async () => { calls.claim += 1; } },
    skipWaiting() {},
    addEventListener(type, handler) { listeners.set(type, handler); }
  };
  const context = {
    self,
    URL,
    Request: RequestStub,
    caches: {
      open: async () => cache,
      keys: async () => ['chrono-flow-v3.0.3-supabase-module-url'],
      delete: async () => true,
      match: async () => null
    },
    fetch: async () => { calls.fetch += 1; return networkResponse; },
    Promise,
    console
  };
  vm.runInNewContext(source, context, { filename: 'sw.js' });
  return { source, listeners, calls, networkResponse };
}

test('activate disables navigation preload and waits for completion', async () => {
  const worker = await loadWorker();
  let activation;
  worker.listeners.get('activate')({ waitUntil(promise) { activation = promise; } });
  assert.equal(typeof activation?.then, 'function');
  await activation;
  assert.equal(worker.calls.disable, 1);
  assert.equal(worker.calls.claim, 1);
  assert.doesNotMatch(worker.source, /navigationPreload\.enable\s*\(/);
});

test('reload navigation is handled by one settled respondWith promise', async () => {
  const worker = await loadWorker();
  let responsePromise;
  let respondWithCalls = 0;
  worker.listeners.get('fetch')({
    request: { method: 'GET', url: 'https://example.test/chronoflow/', mode: 'navigate' },
    respondWith(promise) { respondWithCalls += 1; responsePromise = promise; }
  });

  assert.equal(respondWithCalls, 1);
  assert.equal(typeof responsePromise?.then, 'function');
  assert.equal(await responsePromise, worker.networkResponse);
  assert.equal(worker.calls.fetch, 1);
  assert.equal(worker.calls.put, 1);
});
