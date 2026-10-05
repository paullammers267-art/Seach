/* Alarm für abgelaufene Timer (Küchen-Timer, Kochmodus, Fokus):
   klingelt in der App bis „Stopp“, zeigt eine Benachrichtigung und kommt per Push auch bei geschlossener App
   (Server: Tabelle push_timers + Funktion „push-reminders“, siehe supabase/push.sql). */
(() => {
  'use strict';
  const A = window.App;
  const esc = A.esc;
  const st = () => A.state;
  if (!st().settings.alarm) st().settings.alarm = { mode: 'ring', sound: 'wecker' };
  const opts = () => st().settings.alarm;
  const client = () => (A.authClient ? A.authClient() : null);
  const pushOn = () => !!(A.pushActive && A.pushActive()) && !!(client() && client().user) &&
    !(st().settings.push && st().settings.push.types && st().settings.push.types.timers === false);

  const SOUNDS = { wecker: 'Wecker', glocke: 'Glocke', sanft: 'Sanft' };
  const VIBRATE = [500, 200, 500, 200, 500, 600];

  // ---------- Töne ----------
  let ctx = null;
  /** Ton-Ausgabe vorbereiten – muss einmal durch ein Antippen passieren (iPhone) */
  function prime() {
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) { /* kein Ton möglich */ }
  }
  function tone(freq, start, len, vol = 0.3, type = 'square') {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    o.connect(g); g.connect(ctx.destination);
    const t = ctx.currentTime + start;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.start(t); o.stop(t + len + 0.02);
  }
  /** Ein Klingel-Durchgang (ca. 1,5 s) */
  function play(sound) {
    prime();
    if (!ctx) return;
    try {
      if (sound === 'glocke') { tone(1318, 0, 1.2, 0.35, 'sine'); tone(1760, 0, 0.9, 0.15, 'sine'); tone(1318, 0.6, 1.0, 0.25, 'sine'); }
      else if (sound === 'sanft') { [523, 659, 784].forEach((f, i) => tone(f, i * 0.28, 0.6, 0.22, 'sine')); }
      else { for (let i = 0; i < 4; i++) tone(i % 2 ? 1046 : 880, i * 0.18, 0.13, 0.22); tone(880, 0.85, 0.13, 0.22); tone(1046, 1.03, 0.13, 0.22); }
    } catch (e) { /* egal */ }
  }

  // ---------- Klingel-Fenster ----------
  const dlg = document.createElement('dialog');
  dlg.id = 'alarmDialog';
  dlg.className = 'alarm-dialog';
  dlg.innerHTML = `<div class="alarm-bell"><i class="ic ic-bell"></i></div>
    <h2 id="alarmTitle"></h2><p class="muted" id="alarmBody"></p>
    <button class="btn primary big" id="alarmStop">Stopp</button>
    <div class="row tight"><button class="btn" data-snooze="1">+1 Min</button><button class="btn" data-snooze="5">+5 Min</button><button class="btn" data-snooze="10">+10 Min</button></div>`;
  document.body.appendChild(dlg);
  let ringing = null; // { id, title, body, loop, until, onSnooze }

  function stop() {
    if (!ringing) return;
    clearInterval(ringing.loop);
    if (navigator.vibrate) navigator.vibrate(0);
    closeNotification(ringing.id);
    ringing = null;
    if (dlg.open) dlg.close();
  }
  dlg.querySelector('#alarmStop').onclick = stop;
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); stop(); });
  dlg.addEventListener('click', (e) => {
    const b = e.target.closest('[data-snooze]');
    if (!b || !ringing) return;
    const r = ringing;
    stop();
    snooze(r, Number(b.dataset.snooze));
  });
  function snooze(r, min) {
    if (r.onSnooze) r.onSnooze(min);
    else if (A.startTimer) A.startTimer(r.title === 'Timer abgelaufen' ? r.body : r.title, min);
  }

  /**
   * Timer ist abgelaufen: Alarm auslösen.
   * id: eindeutig je Timer · title/body: Text · onSnooze(min): eigene Verlängerung (sonst neuer Küchen-Timer)
   */
  function ring(id, title, body, extra = {}) {
    cancel(id); // Server-Nachricht wird nicht mehr gebraucht
    showNotification(id, title, body, extra.view);
    const o = opts();
    if (o.mode === 'short') {
      play(o.sound);
      if (navigator.vibrate) navigator.vibrate(VIBRATE);
      A.toast(`${title}: ${body}`);
      return;
    }
    stop();
    ringing = { id, title, body, onSnooze: extra.onSnooze, until: Date.now() + 3 * 60000 };
    dlg.querySelector('#alarmTitle').textContent = title;
    dlg.querySelector('#alarmBody').textContent = body || '';
    if (!dlg.open) { document.querySelectorAll('dialog[open]').forEach((d) => { if (d !== dlg && d.id !== 'cookDialog') d.close(); }); dlg.showModal(); }
    const once = () => {
      if (!ringing) return;
      if (Date.now() > ringing.until) { clearInterval(ringing.loop); if (navigator.vibrate) navigator.vibrate(0); return; } // nach 3 Min still, Fenster bleibt
      play(o.sound);
      if (navigator.vibrate) navigator.vibrate(VIBRATE);
    };
    once();
    ringing.loop = setInterval(once, 2000);
  }

  // ---------- Benachrichtigung (Sperrbildschirm, andere App im Vordergrund) ----------
  async function showNotification(id, title, body, view) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration());
      const o = { body, tag: 'timer-' + id, icon: 'icon-192.png', badge: 'icon-192.png', renotify: true, requireInteraction: true, vibrate: VIBRATE,
        data: { view: view || 'tools', timer: { id, title, body } } };
      if (reg) await reg.showNotification(title, { ...o, actions: [{ action: 'stop', title: 'Stopp' }, { action: 'snooze', title: '+5 Min' }] });
      else new Notification(title, o);
    } catch (e) { /* egal */ }
  }
  async function closeNotification(id) {
    try {
      const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration());
      if (reg) (await reg.getNotifications({ tag: 'timer-' + id })).forEach((n) => n.close());
    } catch (e) { /* egal */ }
  }

  // ---------- Push vom Server (wenn die App geschlossen ist) ----------
  const pending = {}; // id -> letzte Anfrage, damit schnelle Änderungen in Reihenfolge ankommen
  let missing = false; // Tabelle push_timers fehlt (push.sql noch nicht ausgeführt) → bis zum Neuladen nicht mehr fragen
  function queue(id, fn) {
    if (missing) return Promise.resolve(false);
    const p = (pending[id] || Promise.resolve()).then(fn).catch((e) => { if (e && e.status === 404) missing = true; /* sonst offline: dann eben nur lokal */ });
    pending[id] = p;
    return p;
  }
  /** Timer beim Server vormerken (oder Zeitpunkt ändern) */
  function schedule(id, endMs, title, body, extra = {}) {
    if (!pushOn()) return Promise.resolve(false);
    const c = client();
    return queue(id, () => c.api('/rest/v1/push_timers?on_conflict=user_id,id', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: { id: String(id), user_id: c.user.id, fire_at: new Date(endMs).toISOString(), title, body: body || '', view: extra.view || 'tools', alarm: extra.alarm !== false },
    }).then(() => true));
  }
  function cancel(id) {
    const c = client();
    if (!c || !c.user || !(A.pushActive && A.pushActive())) return Promise.resolve();
    return queue(id, () => c.api(`/rest/v1/push_timers?id=eq.${encodeURIComponent(String(id))}`, { method: 'DELETE' }));
  }

  // Antippen in der Benachrichtigung (Stopp / +5 Min)
  function handleAction(action, t) {
    if (!t) return;
    if (action === 'stop') { if (ringing && ringing.id === t.id) stop(); return; }
    if (action === 'snooze') {
      const r = ringing && ringing.id === t.id ? ringing : { id: t.id, title: t.title, body: t.body };
      stop();
      snooze(r, 5);
    }
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.type === 'timer-action') handleAction(e.data.action, e.data.timer); });
  const q = new URLSearchParams(location.search);
  if (q.get('snooze')) {
    const t = { id: 'snooze', title: q.get('t') || 'Timer', body: q.get('b') || '' };
    history.replaceState(null, '', location.pathname);
    setTimeout(() => { A.showView && A.showView('tools'); snooze(t, Number(q.get('snooze')) || 5); }, 300);
  }

  // ---------- Einstellungen (in Werkzeuge → Küchen-Timer) ----------
  const box = document.createElement('div');
  box.className = 'alarm-prefs';
  const tmCard = document.getElementById('tmList');
  if (tmCard) tmCard.after(box);
  function renderPrefs() {
    if (A.view !== 'tools') return;
    const o = opts();
    const hint = !(A.pushActive && A.pushActive())
      ? '<p class="muted small">Bei geschlossener App kommt der Alarm nur mit <button class="link-btn" data-pref="prefRemind">Push-Erinnerungen</button>.</p>'
      : '<p class="muted small">Push ist aktiv – der Alarm kommt auch, wenn die App zu ist.</p>';
    box.innerHTML = `<div class="row tight alarm-row">
        <label class="grow-label"><span>Bei Ablauf</span><select id="alarmMode"><option value="ring">Alarm</option><option value="short">Kurzer Ton</option></select></label>
        <label class="grow-label"><span>Ton</span><select id="alarmSound">${Object.entries(SOUNDS).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label>
        <button class="btn small" id="alarmTest" type="button">Probe</button></div>${hint}`;
    box.querySelector('#alarmMode').value = o.mode;
    box.querySelector('#alarmSound').value = o.sound;
  }
  box.addEventListener('change', (e) => {
    if (e.target.id === 'alarmMode') opts().mode = e.target.value;
    else if (e.target.id === 'alarmSound') { opts().sound = e.target.value; play(e.target.value); }
    else return;
    A.save();
  });
  box.addEventListener('click', (e) => { if (e.target.id === 'alarmTest') { prime(); play(opts().sound); if (navigator.vibrate) navigator.vibrate(VIBRATE); } });

  /** Beim Starten eines Timers: Ton freischalten und einmal um Erlaubnis für Benachrichtigungen bitten */
  function armed() {
    prime();
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
  }

  A.alarm = { ring, stop, schedule, cancel, armed, play, get ringing() { return ringing; } };
  A.onRender(renderPrefs);
  renderPrefs();
})();
