const CACHE = 'chrono-flow-v3.0.4-safe-today-loading';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './src/app.mjs?v=3.0.4',
  './src/config.js?v=3.0.3',
  './src/supabase-client.v3.0.3.mjs',
  './src/today.mjs',
  './src/calendar-date.mjs',
  './src/calendar-privacy.mjs',
  './src/calendar-sharing.mjs',
  './src/calendar-sharing-view.mjs',
  './src/home-display.mjs'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
    if ('navigationPreload' in self.registration) {
      await self.registration.navigationPreload.disable();
    }
    await self.clients.claim();
  })());
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const freshRequest = new Request(request, { cache: 'reload' });
    const response = await fetch(freshRequest);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isLocalAsset = url.origin === self.location.origin;
  const isCodeOrStyle = isLocalAsset && /\.(?:css|m?js)$/.test(url.pathname);

  if (event.request.mode === 'navigate' || isCodeOrStyle) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
