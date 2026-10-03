/* Offline-Unterstützung: App-Dateien zwischenspeichern, Netzwerk bevorzugen. */
const CACHE = 'alltagsheld-v9';
const FILES = ['./', 'index.html', 'style.css', 'logic.js', 'imageprep.js', 'recipes.js', 'sport.js', 'planner.js', 'app.js', 'alltag.js', 'life.js', 'life-ui.js', 'icon.svg', 'icon-180.png', 'icon-192.png', 'nutrition.js', 'nutrition-ui.js', 'manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Produktdaten immer live abfragen
  if (url.hostname.endsWith('openfoodfacts.org') && url.pathname.startsWith('/api/')) return;
  const cacheable = url.origin === location.origin || url.hostname === 'cdn.jsdelivr.net';
  if (!cacheable) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((cs) => (cs[0] ? cs[0].focus() : self.clients.openWindow('./'))));
});
