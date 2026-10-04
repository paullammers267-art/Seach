/* Anmeldung, Konto & automatischer Cloud-Sync mit Supabase.
   Ohne Supabase-Zugang (config.js leer und nichts eingetragen) bleibt alles wie bisher nur auf dem Gerät. */
(() => {
  'use strict';
  const A = window.App;
  const Au = window.FridgeAuth;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const esc = A.esc;
  const ls = {
    get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* voll */ } },
    remove: (k) => { try { localStorage.removeItem(k); } catch (e) { /* egal */ } },
  };
  const CFG_KEY = 'alltagsheld.supabase', META_KEY = 'alltagsheld.sync', SKIP_KEY = 'alltagsheld.authSkip';

  // ---------- Zugang ----------
  function config() {
    const file = window.ALLTAGSHELD_SUPABASE || {};
    if (file.url && file.anonKey) return { url: file.url, anonKey: file.anonKey, fromFile: true };
    try { const c = JSON.parse(ls.get(CFG_KEY) || 'null'); if (c && c.url && c.anonKey) return c; } catch (e) { /* egal */ }
    return null;
  }
  let client = null;
  function makeClient() {
    const c = config();
    client = c ? Au.createClient({ url: c.url, anonKey: c.anonKey, store: ls, redirectTo: location.origin + location.pathname }) : null;
    if (client) client.onChange(() => { renderAccount(); renderAvatar(); });
    return client;
  }
  makeClient();
  A.authClient = () => client;
  const loggedIn = () => !!(client && client.user);

  // ---------- Sync-Status ----------
  const meta = () => { try { return JSON.parse(ls.get(META_KEY) || '{}'); } catch (e) { return {}; } };
  const setMeta = (m) => ls.set(META_KEY, JSON.stringify({ ...meta(), ...m }));
  let status = 'idle'; // idle | syncing | ok | offline | error
  let statusMsg = '';
  const setStatus = (s, msg = '') => { status = s; statusMsg = msg; renderAccount(); renderAvatar(); };
  Object.defineProperty(A, 'cloudActive', { get: loggedIn });

  function localData() { return JSON.parse(ls.get(A.storeKey) || 'null') || A.state; }
  /** Daten aus der Cloud übernehmen – neu laden, damit alle Bereiche sauber starten */
  function applyRemote(row) {
    ls.set(A.storeKey, JSON.stringify(row.data));
    setMeta({ userId: client.user.id, remoteAt: row.updated_at, dirty: false, lastSync: Date.now() });
    location.reload();
  }

  let pushTimer = null, busy = false;
  A.onSave(() => {
    if (!loggedIn() || applying) return;
    setMeta({ dirty: true });
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => syncNow(), 1500);
  });
  let applying = false;

  /** Abgleich: neuere Cloud-Daten holen oder eigene Änderungen hochladen; bei Konflikt fragen. */
  async function syncNow(manual) {
    if (!loggedIn() || busy) return;
    if (!navigator.onLine) { setStatus('offline'); return; }
    busy = true;
    setStatus('syncing');
    try {
      const m = meta();
      if (m.userId !== client.user.id) { await firstSync(); return; }
      const remoteAt = await client.peek();
      const remoteChanged = remoteAt && remoteAt !== m.remoteAt;
      if (remoteChanged && m.dirty) { await conflict(); return; }
      if (remoteChanged) { const row = await client.pull(); if (row) { applyRemote(row); return; } }
      if (m.dirty || !remoteAt) {
        const at = await client.push(localData());
        setMeta({ remoteAt: at, dirty: false, lastSync: Date.now() });
      } else setMeta({ lastSync: Date.now() });
      setStatus('ok');
      if (manual) A.toast('Alles synchronisiert');
    } catch (e) {
      if (!client.user) { setStatus('idle'); A.toast('Bitte melde dich erneut an'); }
      else setStatus(e.status === 0 ? 'offline' : 'error', e.message);
      if (manual) A.toast(e.message);
    } finally { busy = false; }
  }

  /** Erste Anmeldung auf diesem Gerät: was gilt – Konto oder Gerät? */
  async function firstSync() {
    const row = await client.pull();
    const local = localData();
    if (!row || !row.data || !Au.hasLocalData(row.data)) {
      const at = await client.push(local);
      setMeta({ userId: client.user.id, remoteAt: at, dirty: false, lastSync: Date.now() });
      setStatus('ok');
      if (Au.hasLocalData(local)) A.toast('Deine Daten sind jetzt in deinem Konto gesichert');
      return;
    }
    if (!Au.hasLocalData(local)) { applyRemote(row); return; }
    const choice = await ask({
      title: 'Welche Daten möchtest du behalten?',
      text: `In deinem Konto: ${Au.describeData(row.data)} (Stand ${new Date(row.updated_at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}).\nAuf diesem Gerät: ${Au.describeData(local)}.\nDie andere Version wird ersetzt.`,
      remote: 'Daten aus dem Konto laden', local: 'Daten dieses Geräts hochladen',
    });
    if (choice === 'remote') { applyRemote(row); return; }
    const at = await client.push(local);
    setMeta({ userId: client.user.id, remoteAt: at, dirty: false, lastSync: Date.now() });
    setStatus('ok');
    A.toast('Daten dieses Geräts ins Konto übernommen');
  }
  async function conflict() {
    const row = await client.pull();
    const choice = await ask({
      title: 'Auf zwei Geräten geändert',
      text: `Seit dem letzten Abgleich wurde auf einem anderen Gerät etwas geändert (Stand ${new Date(row.updated_at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}) – und hier auch. Welche Version soll gelten?`,
      remote: 'Version vom anderen Gerät', local: 'Version von diesem Gerät',
    });
    if (choice === 'remote') { applyRemote(row); return; }
    const at = await client.push(localData());
    setMeta({ remoteAt: at, dirty: false, lastSync: Date.now() });
    setStatus('ok');
  }
  function ask({ title, text, remote, local }) {
    return new Promise((resolve) => {
      $('#scTitle').textContent = title;
      $('#scText').innerText = text;
      $('#scRemote').textContent = remote;
      $('#scLocal').textContent = local;
      const dlg = $('#syncChoice');
      const done = (v) => { dlg.close(); resolve(v); };
      $('#scRemote').onclick = () => done('remote');
      $('#scLocal').onclick = () => done('local');
      dlg.oncancel = (e) => e.preventDefault(); // muss entschieden werden
      dlg.showModal();
    });
  }

  // ---------- Anmelde-Dialog ----------
  const dlg = $('#authDialog');
  let mode = 'signin';
  function setMode(m) {
    mode = m;
    $$('#authTabs [data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === m));
    $('#authNameWrap').hidden = m !== 'signup';
    $('#authPwWrap').hidden = m === 'reset';
    $('#authMeter').hidden = m !== 'signup';
    $('#authPw').autocomplete = m === 'signup' ? 'new-password' : 'current-password';
    $('#authSubmit').textContent = m === 'signup' ? 'Konto erstellen' : m === 'reset' ? 'Link zum Zurücksetzen senden' : 'Anmelden';
    $('#authForgot').textContent = m === 'reset' ? 'Zurück zur Anmeldung' : 'Passwort vergessen?';
    $('#authForgot').hidden = m === 'signup';
    msg('');
    meter();
  }
  const msg = (t, ok) => { $('#authMsg').textContent = t; $('#authMsg').classList.toggle('ok', !!ok); };
  function meter() {
    const s = Au.passwordStrength($('#authPw').value);
    const el = $('#authMeter');
    el.dataset.level = s;
    el.querySelector('span').textContent = $('#authPw').value ? ['zu kurz (mind. 8 Zeichen)', 'okay', 'gut', 'stark'][s] : 'mindestens 8 Zeichen';
  }
  function openAuth(m = 'signin') {
    if (!client) { A.showView('settings'); setTimeout(() => $('#accountCard').scrollIntoView({ block: 'center' }), 50); return; }
    setMode(m === 'first' ? 'signin' : m);
    $('#authSkip').hidden = !!ls.get(SKIP_KEY) && m !== 'first';
    if (!dlg.open) dlg.showModal();
    setTimeout(() => $(m === 'signup' ? '#authName' : '#authEmail').focus(), 60);
  }
  A.openAuth = openAuth;
  $('#authTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); });
  $('#authForgot').onclick = () => setMode(mode === 'reset' ? 'signin' : 'reset');
  $('#authEye').onclick = () => {
    const pw = $('#authPw');
    pw.type = pw.type === 'password' ? 'text' : 'password';
    $('#authEye').textContent = pw.type === 'password' ? 'zeigen' : 'verbergen';
  };
  $('#authPw').addEventListener('input', meter);
  $('#authSkip').onclick = () => { ls.set(SKIP_KEY, '1'); dlg.close(); };
  dlg.addEventListener('cancel', () => ls.set(SKIP_KEY, '1'));
  $('#authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#authEmail').value.trim(), pw = $('#authPw').value;
    const btn = $('#authSubmit');
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'Einen Moment …';
    try {
      if (mode === 'reset') {
        await client.recover(email);
        msg('Falls es ein Konto mit dieser E-Mail gibt, ist ein Link zum Zurücksetzen unterwegs. Schau in dein Postfach (auch in den Spam-Ordner).', true);
      } else if (mode === 'signup') {
        const name = $('#authName').value.trim();
        const r = await client.signUp(email, pw, name);
        if (name) { A.state.settings.name = name; A.save(); }
        if (r.needsConfirm) { msg(`Fast geschafft! Wir haben dir eine E-Mail an ${email} geschickt. Tippe auf den Link darin – danach bist du angemeldet.`, true); return; }
        afterLogin('Willkommen! Dein Konto ist erstellt.');
      } else {
        await client.signIn(email, pw);
        afterLogin('Angemeldet');
      }
    } catch (err) { msg(err.message); } finally { btn.disabled = false; if (btn.textContent === 'Einen Moment …') btn.textContent = label; }
  });
  function afterLogin(text) {
    ls.remove(SKIP_KEY);
    if (dlg.open) dlg.close();
    if (!A.state.settings.name && client.user.name) { A.state.settings.name = client.user.name; A.save(); }
    A.toast(text);
    A.render();
    syncNow();
  }

  // ---------- Links aus E-Mails (Bestätigung, Passwort zurücksetzen) ----------
  async function handleHash() {
    const parsed = Au.parseAuthHash(location.hash);
    if (!parsed) return;
    history.replaceState(null, '', location.pathname + location.search);
    if (parsed.error) { A.toast(parsed.error); return; }
    if (!client) return;
    try {
      await client.fromHash(parsed);
      if (parsed.type === 'recovery') { $('#newPwDialog').showModal(); return; }
      afterLogin('E-Mail bestätigt – du bist angemeldet');
    } catch (e) { A.toast(e.message); }
  }
  $('#newPwCancel').onclick = () => $('#newPwDialog').close();
  $('#newPwForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await client.updatePassword($('#newPw').value);
      $('#newPwDialog').close();
      afterLogin('Neues Passwort gespeichert');
    } catch (err) { $('#newPwMsg').textContent = err.message; }
  });

  // ---------- Kontokarte in „Mehr“ ----------
  const ago = (ms) => {
    const m = Math.round((Date.now() - ms) / 60000);
    return m < 1 ? 'gerade eben' : m < 60 ? `vor ${m} Min` : m < 1440 ? `vor ${Math.round(m / 60)} Std` : new Date(ms).toLocaleDateString('de-DE');
  };
  function renderAccount() {
    const card = $('#accountCard');
    if (!card) return;
    const c = config();
    if (!c) {
      card.innerHTML = `<h2>Konto &amp; Cloud-Sync</h2>
        <p class="muted small">Mit einem Konto sind deine Daten auf allen Geräten gleich und bei Handyverlust sicher. Dafür einmal den Supabase-Zugang eintragen (Project Settings → API).</p>
        <form id="sbForm" class="sb-form" autocomplete="off">
          <label>Project URL<input id="sbUrl" placeholder="https://xyz.supabase.co" inputmode="url"></label>
          <label>anon public key<input id="sbKey" placeholder="eyJhbGciOi…"></label>
          <button class="btn primary">Verbinden</button>
        </form>`;
      return;
    }
    if (!loggedIn()) {
      card.innerHTML = `<h2>Konto &amp; Cloud-Sync</h2>
        <p class="muted small">Du bist nicht angemeldet – deine Daten liegen nur auf diesem Gerät.</p>
        <div class="row"><button class="btn primary" data-auth="signin">Anmelden</button><button class="btn" data-auth="signup">Konto erstellen</button></div>
        ${c.fromFile ? '' : '<button class="link-btn small" id="sbReset">Anderen Supabase-Zugang eintragen</button>'}`;
      return;
    }
    const m = meta();
    const st = { syncing: 'Wird synchronisiert …', ok: `Synchronisiert ${m.lastSync ? ago(m.lastSync) : ''}`, offline: 'Offline – Änderungen werden nachgeholt', error: statusMsg || 'Fehler beim Abgleich', idle: m.lastSync ? `Zuletzt synchronisiert ${ago(m.lastSync)}` : 'Noch nicht synchronisiert' }[status];
    const u = client.user;
    card.innerHTML = `<div class="acc-head"><span class="acc-avatar">${esc((A.state.settings.name || u.name || u.email || '?')[0].toUpperCase())}</span>
        <div class="acc-who"><b>${esc(A.state.settings.name || u.name || 'Dein Konto')}</b><span class="muted small">${esc(u.email || '')}</span></div></div>
      <div class="acc-status ${status}"><i></i>${esc(st)}</div>
      <div class="row tight"><button class="btn" id="accSync">Jetzt synchronisieren</button><button class="btn" id="accPw">Passwort ändern</button></div>
      <div class="row tight"><button class="btn" id="accLogout">Abmelden</button><button class="btn danger" id="accDelete">Konto löschen</button></div>`;
  }
  $('#accountCard').addEventListener('submit', (e) => {
    if (e.target.id !== 'sbForm') return;
    e.preventDefault();
    const url = $('#sbUrl').value.trim().replace(/\/+$/, ''), anonKey = $('#sbKey').value.trim();
    if (!/^https:\/\/[\w.-]+$/.test(url) || anonKey.length < 20) { A.toast('Bitte Project URL (https://…supabase.co) und anon key eintragen'); return; }
    ls.set(CFG_KEY, JSON.stringify({ url, anonKey }));
    makeClient(); renderAccount();
    openAuth('signup');
  });
  $('#accountCard').addEventListener('click', async (e) => {
    const a = e.target.closest('[data-auth]');
    if (a) { openAuth(a.dataset.auth); return; }
    if (e.target.closest('#sbReset')) { ls.remove(CFG_KEY); makeClient(); renderAccount(); return; }
    if (e.target.closest('#accSync')) { syncNow(true); return; }
    if (e.target.closest('#accPw')) { $('#newPwMsg').textContent = ''; $('#newPw').value = ''; $('#newPwDialog').showModal(); return; }
    if (e.target.closest('#accLogout')) {
      if (meta().dirty) await syncNow();
      if (!confirm('Abmelden? Deine Daten bleiben auf diesem Gerät, werden aber nicht mehr abgeglichen.')) return;
      if (A.onBeforeSignOut) await A.onBeforeSignOut();
      await client.signOut();
      setMeta({ userId: null, remoteAt: null, dirty: false });
      setStatus('idle'); A.render(); A.toast('Abgemeldet');
      return;
    }
    if (e.target.closest('#accDelete')) {
      if (!confirm('Konto wirklich löschen? Alle Daten in der Cloud werden endgültig gelöscht. Die Daten auf diesem Gerät bleiben erhalten.')) return;
      try {
        if (A.onBeforeSignOut) await A.onBeforeSignOut();
        await client.deleteAccount();
        setMeta({ userId: null, remoteAt: null, dirty: false });
        setStatus('idle'); A.render(); A.toast('Konto gelöscht');
      } catch (err) { A.toast(err.message); }
    }
  });

  // Profil-Knopf oben: grüner Punkt = synchronisiert
  function renderAvatar() {
    const av = $('#topAvatar');
    if (!av) return;
    av.classList.toggle('synced', loggedIn() && status === 'ok');
    av.classList.toggle('sync-warn', loggedIn() && (status === 'offline' || status === 'error'));
    av.classList.toggle('sync-busy', loggedIn() && status === 'syncing');
  }
  // Texte, die „nur auf diesem Gerät“ versprechen, anpassen
  function renderPrivacy() {
    const p = $$('#view-settings .card p.muted').find((x) => /Alles wird nur auf diesem Gerät|Deine Daten werden in deinem Konto/.test(x.textContent));
    if (p) p.textContent = loggedIn() ? 'Deine Daten werden in deinem Konto gesichert und auf deinen Geräten abgeglichen. Zusätzlich kannst du eine Sicherung als Datei speichern.'
      : 'Alles wird nur auf diesem Gerät gespeichert. Mit einer Sicherung kannst du den Vorrat auf ein anderes Gerät übertragen.';
  }

  A.onRender(renderAccount);
  A.onRender(renderAvatar);
  A.onRender(renderPrivacy);
  window.addEventListener('online', () => { if (loggedIn()) syncNow(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && loggedIn()) syncNow(); });
  setInterval(() => { if (!document.hidden && loggedIn() && !meta().dirty) syncNow(); }, 120000);

  // Start
  A.render();
  handleHash().then(() => {
    if (loggedIn()) syncNow();
    else if (client && !ls.get(SKIP_KEY)) openAuth('first');
  });
})();
