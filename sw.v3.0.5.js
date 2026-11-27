const CACHE = 'chrono-flow-v3.0.5-stable-calendar';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './src/app.v3.0.5.mjs',
  './src/config.js?v=3.0.3',
  './src/supabase-client.v3.0.3.mjs',
  './src/today.mjs',
  './src/home-display.mjs',
  './src/calendar-date.mjs',
  './src/calendar-record.v3.0.5.mjs',
  './src/calendar-privacy.v3.0.5.mjs',
  './src/calendar-sharing.v3.0.5.mjs',
  './src/calendar-sharing-view.v3.0.5.mjs',
  './src/route-controller.v3.0.5.mjs',
  './src/personal-day-service.v3.0.5.mjs'
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
  // A previous worker may have enabled navigation preload. Awaiting this promise
  // settles that request before falling back and prevents the browser warning.
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
  const isLocalAsset = url.origin === self.location.origin;
  const isCodeOrStyle = isLocalAsset && /\.(?:css|m?js)$/.test(url.pathname);

  if (event.request.mode === 'navigate') {
    event.respondWith(navigationResponse(event));
    return;
  }
  if (isCodeOrStyle) {
    event.respondWith(networkFirst(event.request));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
