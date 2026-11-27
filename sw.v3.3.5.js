const CACHE = 'chrono-flow-v3.3.5-configurable-break-fix-1';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css?v=3.3.5-break-fix-1',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './src/app.v3.3.5.mjs',
  './src/app.js?v=3.3.5-break-fix-1',
  './src/config.js?v=3.0.3',
  './src/supabase-client.v3.0.3.mjs',
  './src/calculations.mjs',
  './src/home-display.mjs',
  './src/live-clock.mjs',
  './src/migration.mjs',
  './src/pwa-install.mjs',
  './src/smart-auto-exit.mjs',
  './src/project-allocation-policy.mjs',
  './src/day-source-of-truth.mjs',
  './src/calendar-date.mjs',
  './src/calendar-record.v3.0.5.mjs',
  './src/calendar-privacy.v3.0.5.mjs',
  './src/calendar-sharing.v3.0.5.mjs',
  './src/calendar-sharing-view.v3.0.5.mjs',
  './src/stale-shell-recovery.v3.2.1.mjs'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
    if ('navigationPreload' in self.registration) await self.registration.navigationPreload.disable();
    await self.clients.claim();
  })());
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(new Request(request, { cache: 'reload' }));
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function navigationResponse(event) {
  try {
    const preloaded = await event.preloadResponse;
    if (preloaded) return preloaded;
  } catch (error) {
    console.warn('[Chrono Flow] navigation preload unavailable', error);
  }
  return networkFirst(event.request);
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const local = url.origin === self.location.origin;
  const codeOrStyle = local && /\.(?:css|m?js)$/.test(url.pathname);
  if (event.request.mode === 'navigate') {
    event.respondWith(navigationResponse(event));
    return;
  }
  if (codeOrStyle) {
    event.respondWith(networkFirst(event.request));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
