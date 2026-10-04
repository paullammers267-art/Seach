/* Offline-Unterstützung: App-Dateien zwischenspeichern, Netzwerk bevorzugen. */
const CACHE = 'alltagsheld-v25';
const FILES = ['./', 'index.html', 'style.css', 'logic.js', 'imageprep.js', 'recipes.js', 'sport.js', 'planner.js', 'app.js', 'alltag.js', 'life.js', 'life-ui.js', 'icon.svg', 'icon-180.png', 'icon-192.png', 'nutrition.js', 'nutrition-ui.js', 'extras.js', 'extras-ui.js', 'plus.js', 'plus-ui.js', 'daily.js', 'daily-ui.js', 'organize.js', 'organize-ui.js', 'deep.js', 'deep-ui.js', 'config.js', 'auth.js', 'auth-ui.js', 'push-ui.js', 'widgets-ui.js', 'calendar.js', 'calendar-ui.js', 'manifest.webmanifest'];

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

// Push-Erinnerungen vom Server (Supabase), auch wenn die App geschlossen ist
self.addEventListener('push', (e) => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch (err) { m = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(m.title || 'Alltagsheld', {
    body: m.body || '', tag: m.tag || undefined, icon: 'icon-192.png', badge: 'icon-192.png', data: { view: m.view || 'home' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const view = (e.notification.data && e.notification.data.view) || '';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    if (cs[0]) { cs[0].postMessage({ type: 'goto', view }); return cs[0].focus(); }
    return self.clients.openWindow(view ? `./?view=${encodeURIComponent(view)}` : './');
  }));
});
