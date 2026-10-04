/* Push-Erinnerungen auch bei geschlossener App: Gerät anmelden, Arten auswählen, Test senden.
   Verschickt werden die Nachrichten von der Supabase-Funktion „push-reminders“ (supabase/functions). */
(() => {
  'use strict';
  const A = window.App;
  const $ = (s) => document.querySelector(s);
  const esc = A.esc;
  const st = () => A.state;
  const cfg = window.ALLTAGSHELD_SUPABASE || {};
  const DEV_KEY = 'alltagsheld.push';
  const TYPES = {
    morning: 'Morgen-Überblick', meds: 'Medikamente', tasks: 'Aufgaben mit Uhrzeit', events: 'Termine & Geburtstage', waste: 'Müllabfuhr am Vorabend',
    deadlines: 'Fristen', contracts: 'Kündigungsfristen', parcels: 'Rückgabefristen', parking: 'Parkuhr',
  };
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* egal */ } }, remove: (k) => { try { localStorage.removeItem(k); } catch (e) { /* egal */ } } };
  const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const active = () => !!ls.get(DEV_KEY);
  const client = () => (A.authClient ? A.authClient() : null);
  if (!st().settings.push) st().settings.push = { morning: '07:30', evening: '18:00', types: {} };
  let busy = false;

  const b64uToBytes = (s) => {
    const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
    return Uint8Array.from(b, (c) => c.charCodeAt(0));
  };

  async function enable() {
    const c = client();
    if (!c || !c.user) { A.openAuth && A.openAuth('signin'); return; }
    busy = true; render();
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { A.toast('Benachrichtigungen sind blockiert – bitte in den Einstellungen des Handys/Browsers erlauben'); return; }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(cfg.vapidPublicKey) });
      const j = sub.toJSON();
      await c.api('/rest/v1/push_subscriptions?on_conflict=endpoint', {
        method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: { user_id: c.user.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin', device: deviceName() },
      });
      ls.set(DEV_KEY, j.endpoint);
      A.save(); // Einstellungen (Uhrzeiten, Arten) in die Cloud
      A.toast('Push ist aktiv – Erinnerungen kommen jetzt auch bei geschlossener App');
    } catch (e) {
      A.toast(e.message && /relation|does not exist|404/.test(e.message) ? 'Push ist auf dem Server noch nicht eingerichtet (supabase/push.sql ausführen)' : `Push konnte nicht aktiviert werden: ${e.message || e}`);
    } finally { busy = false; render(); }
  }
  async function disable() {
    busy = true; render();
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      const ep = ls.get(DEV_KEY) || (sub && sub.endpoint);
      if (sub) await sub.unsubscribe();
      const c = client();
      if (c && c.user && ep) await c.api(`/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(ep)}`, { method: 'DELETE' }).catch(() => {});
      ls.remove(DEV_KEY);
      A.toast('Push auf diesem Gerät ausgeschaltet');
    } catch (e) { A.toast(e.message || String(e)); } finally { busy = false; render(); }
  }
  async function test() {
    busy = true; render();
    try {
      const r = await client().callFunction('push-reminders', { test: true });
      A.toast(r && r.sent ? `Test verschickt an ${r.sent} Gerät${r.sent > 1 ? 'e' : ''} – kommt gleich an` : 'Kein Gerät erreicht – Push bitte aus- und wieder einschalten');
    } catch (e) {
      A.toast(e.status === 404 ? 'Die Funktion „push-reminders“ fehlt noch in Supabase (Edge Functions)' : e.message);
    } finally { busy = false; render(); }
  }
  function deviceName() {
    const u = navigator.userAgent;
    return /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) ? 'iPad' : /Android/.test(u) ? 'Android' : /Mac/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows' : 'Browser';
  }

  function render() {
    const box = $('#pushBox');
    if (!box) return;
    if (!cfg.url || !cfg.vapidPublicKey) { box.hidden = true; return; }
    box.hidden = false;
    const c = client();
    const p = st().settings.push;
    let inner;
    if (!supported() || (isIOS && !standalone())) {
      inner = isIOS && !standalone()
        ? '<p class="muted small">Auf dem iPhone kommen Push-Nachrichten nur, wenn die App installiert ist: in Safari auf <b>Teilen → „Zum Home-Bildschirm“</b>, dann die App vom Home-Bildschirm öffnen und hier aktivieren (ab iOS 16.4).</p>'
        : '<p class="muted small">Dieser Browser unterstützt keine Push-Nachrichten. Nutze Chrome, Edge, Firefox oder Safari (installiert).</p>';
    } else if (!c || !c.user) {
      inner = '<p class="muted small">Dafür brauchst du ein Konto.</p><button class="btn" data-push="login">Anmelden</button>';
    } else if (!active()) {
      inner = `<p class="muted small">Auch wenn die App geschlossen ist.</p>
        <button class="btn primary" data-push="on" ${busy ? 'disabled' : ''}>${busy ? 'Einen Moment …' : 'Push-Erinnerungen aktivieren'}</button>`;
    } else {
      inner = `<div class="push-on"><i></i><b>Aktiv auf diesem Gerät</b></div>
        <div class="chips push-types">${Object.entries(TYPES).map(([k, l]) => `<button class="chip ${!p.types || p.types[k] !== false ? 'active' : ''}" data-ptype="${k}">${esc(l)}</button>`).join('')}</div>
        <div class="row tight push-times"><label class="grow-label"><span>Morgen-Überblick</span><input type="time" id="pushMorning" value="${esc(p.morning || '07:30')}"></label>
          <label class="grow-label"><span>Müll am Vorabend</span><input type="time" id="pushEvening" value="${esc(p.evening || '18:00')}"></label></div>
        <div class="row tight"><button class="btn" data-push="test" ${busy ? 'disabled' : ''}>Test-Nachricht senden</button><button class="btn" data-push="off" ${busy ? 'disabled' : ''}>Ausschalten</button></div>
`;
    }
    box.innerHTML = `<b>Push-Erinnerungen</b>${inner}`;
  }
  $('#pushBox').addEventListener('click', (e) => {
    const b = e.target.closest('[data-push]');
    if (b) {
      const a = b.dataset.push;
      if (a === 'on') enable(); else if (a === 'off') disable(); else if (a === 'test') test(); else if (a === 'login') A.openAuth && A.openAuth('signin');
      return;
    }
    const t = e.target.closest('[data-ptype]');
    if (t) {
      const p = st().settings.push;
      p.types = p.types || {};
      p.types[t.dataset.ptype] = p.types[t.dataset.ptype] === false;
      A.save(); render();
    }
  });
  $('#pushBox').addEventListener('change', (e) => {
    if (e.target.id === 'pushMorning') st().settings.push.morning = e.target.value || '07:30';
    else if (e.target.id === 'pushEvening') st().settings.push.evening = e.target.value || '18:00';
    else return;
    A.save();
  });

  // Beim Abmelden Push für dieses Gerät beenden
  A.onBeforeSignOut = async () => { if (active()) await disable(); };

  // Doppelte Meldungen vermeiden: ist Push aktiv, übernimmt der Server – lokal nur noch der Fokus-Timer
  const localNotify = A.notify;
  A.notify = (title, body, tag) => (active() && !String(tag || '').startsWith('focus') ? Promise.resolve(false) : localNotify(title, body, tag));

  // Tipp auf eine Nachricht: passenden Bereich öffnen
  const goto = (v) => { if (v === 'settings') v = 'prefs'; if (v && document.getElementById('view-' + v)) A.showView(v); };
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.type === 'goto') goto(e.data.view); });
  const qv = new URLSearchParams(location.search).get('view');
  if (qv) { goto(qv); history.replaceState(null, '', location.pathname); }

  A.onRender(render);
  render();
})();
