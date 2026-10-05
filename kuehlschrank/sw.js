/* Offline-Unterstützung: App-Dateien zwischenspeichern, Netzwerk bevorzugen. */
const CACHE = 'alltagsheld-v28';
const FILES = ['./', 'index.html', 'style.css', 'logic.js', 'imageprep.js', 'recipes.js', 'sport.js', 'planner.js', 'app.js', 'alltag.js', 'life.js', 'life-ui.js', 'icon.svg', 'icon-180.png', 'icon-192.png', 'nutrition.js', 'nutrition-ui.js', 'extras.js', 'extras-ui.js', 'plus.js', 'plus-ui.js', 'daily.js', 'daily-ui.js', 'organize.js', 'organize-ui.js', 'deep.js', 'deep-ui.js', 'config.js', 'auth.js', 'auth-ui.js', 'push-ui.js', 'alarm-ui.js', 'widgets-ui.js', 'calendar.js', 'calendar-ui.js', 'manifest.webmanifest'];

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
const ALARM_VIBRATE = [500, 200, 500, 200, 500, 600, 500, 200, 500];
self.addEventListener('push', (e) => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch (err) { m = { body: e.data && e.data.text() }; }
  const o = { body: m.body || '', tag: m.tag || undefined, icon: 'icon-192.png', badge: 'icon-192.png', data: { view: m.view || 'home', timer: m.timer || null } };
  if (m.timer) Object.assign(o, { renotify: true, vibrate: m.alarm ? ALARM_VIBRATE : [300, 150, 300] });
  // Abgelaufener Timer: bleibt stehen, bis man reagiert – mit Stopp und Schlummern
  if (m.alarm) Object.assign(o, { requireInteraction: true, actions: [{ action: 'stop', title: 'Stopp' }, { action: 'snooze', title: '+5 Min' }] });
  e.waitUntil(self.registration.showNotification(m.title || 'Alltagsheld', o));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const data = e.notification.data || {};
  const view = data.view || '';
  if (e.action === 'stop') {
    // nur ausschalten; läuft die App, dort das Klingeln beenden
    e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => cs.forEach((c) => c.postMessage({ type: 'timer-action', action: 'stop', timer: data.timer }))));
    return;
  }
  if (e.action === 'snooze' && data.timer) {
    e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
      if (cs[0]) { cs[0].postMessage({ type: 'timer-action', action: 'snooze', timer: data.timer }); return cs[0].focus(); }
      return self.clients.openWindow(`./?snooze=5&t=${encodeURIComponent(data.timer.title || '')}&b=${encodeURIComponent(data.timer.body || '')}`);
    }));
    return;
  }
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    if (cs[0]) {
      cs[0].postMessage({ type: 'goto', view });
      if (data.timer) cs[0].postMessage({ type: 'timer-action', action: 'stop', timer: data.timer });
      return cs[0].focus();
    }
    return self.clients.openWindow(view ? `./?view=${encodeURIComponent(view)}` : './');
  }));
});
