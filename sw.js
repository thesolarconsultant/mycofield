// Bump CACHE on every release so old index.html versions are dropped.
const CACHE = 'mycofield-v2.19.0';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './favicon.png', './assets/logo-mark.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Weather, elevation and search APIs are cached by the app itself (with live/cached/offline labels).
  if (/(^|\.)(open-meteo\.com|overpass-api\.de|nominatim\.openstreetmap\.org|api\.postcodes\.io|datamap\.gov\.wales|arcgis\.com|supabase\.co)$/.test(new URL(e.request.url).hostname)) return;
  // Network-first so new deployments are picked up; cache is the offline fallback.
  e.respondWith(
    fetch(e.request)
      .then(r => {
        if (r.ok || r.type === 'opaque') {
          const copy = r.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        }
        return r;
      })
      .catch(() => caches.match(e.request).then(r => r || (e.request.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});
