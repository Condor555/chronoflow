const CACHE = 'chrono-flow-v3.0.1-bootstrap-hotfix';
const APP_SHELL = ['./', './index.html', './styles.css', './manifest.webmanifest', './src/app.mjs', './src/config.js', './src/config/supabase-client.mjs', './src/calendar-date.mjs', './src/calendar-privacy.mjs', './src/calendar-sharing.mjs', './src/calendar-sharing-view.mjs', './src/home-display.mjs'];

self.addEventListener('install', (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL))));
self.addEventListener('activate', (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))));
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin === location.origin && /\.(?:css|m?js)$/.test(url.pathname)) {
    event.respondWith(fetch(event.request).then((response) => { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(event.request, copy)); return response; }).catch(() => caches.match(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
