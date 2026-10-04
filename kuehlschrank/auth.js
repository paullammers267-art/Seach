/* Konto & Cloud-Sync über Supabase (Auth + Datenbank), direkt über die REST-Schnittstelle – ohne Zusatzbibliothek.
   Läuft im Browser (window.FridgeAuth) und in Node (Tests, mit eigenem fetch). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FridgeAuth = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Supabase-Fehlermeldungen → verständliches Deutsch */
  function germanError(msg, status) {
    const m = String(msg || '').toLowerCase();
    if (status === 0 || m.includes('failed to fetch') || m.includes('networkerror') || m.includes('load failed')) return 'Keine Verbindung zum Server. Bist du online?';
    if (m.includes('invalid login') || m.includes('invalid_credentials') || m.includes('invalid grant')) return 'E-Mail oder Passwort ist falsch.';
    if (m.includes('already registered') || m.includes('already been registered') || m.includes('user_already_exists')) return 'Für diese E-Mail gibt es schon ein Konto. Melde dich an.';
    if (m.includes('email not confirmed')) return 'Bitte bestätige zuerst deine E-Mail – der Link ist in deinem Postfach.';
    if (m.includes('password') && (m.includes('at least') || m.includes('weak') || m.includes('short'))) return 'Das Passwort ist zu kurz oder zu einfach (mindestens 8 Zeichen).';
    if (m.includes('unable to validate email') || m.includes('invalid format') || m.includes('email address') && m.includes('invalid')) return 'Bitte gib eine gültige E-Mail-Adresse ein.';
    if (m.includes('rate limit') || m.includes('too many') || status === 429) return 'Zu viele Versuche. Bitte warte kurz und versuche es dann erneut.';
    if (m.includes('signups not allowed') || m.includes('signup is disabled')) return 'Neue Konten sind auf diesem Server gerade nicht erlaubt.';
    if (m.includes('same password') || m.includes('different from the old')) return 'Das neue Passwort muss sich vom alten unterscheiden.';
    if (m.includes('jwt') || m.includes('token') && (m.includes('expired') || m.includes('invalid'))) return 'Deine Anmeldung ist abgelaufen. Bitte melde dich erneut an.';
    if (m.includes('relation') && m.includes('does not exist')) return 'Die Datenbank ist noch nicht eingerichtet (SQL aus supabase/schema.sql ausführen).';
    return msg ? `Fehler: ${msg}` : 'Unbekannter Fehler – bitte später erneut versuchen.';
  }

  class AuthError extends Error {
    constructor(message, status, raw) { super(message); this.status = status; this.raw = raw; }
  }

  /** Antwort aus der URL nach Klick auf den Bestätigungs- oder Passwort-Link (#access_token=…&type=signup|recovery) */
  function parseAuthHash(hash) {
    const h = String(hash || '').replace(/^#/, '');
    if (!h) return null;
    const p = new URLSearchParams(h);
    if (p.get('error') || p.get('error_description')) {
      const code = p.get('error_code') || p.get('error');
      return { error: code === 'otp_expired' ? 'Der Link ist abgelaufen oder wurde schon benutzt. Fordere einfach einen neuen an.' : germanError(p.get('error_description')) };
    }
    if (!p.get('access_token')) return null;
    const expiresIn = Number(p.get('expires_in')) || 3600;
    return {
      type: p.get('type') || 'signup',
      session: { access_token: p.get('access_token'), refresh_token: p.get('refresh_token'), expires_at: Number(p.get('expires_at')) || Math.floor(Date.now() / 1000) + expiresIn },
    };
  }

  const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim());
  /** grobe Passwortstärke 0–3 */
  function passwordStrength(pw) {
    const s = String(pw || '');
    if (s.length < 8) return 0;
    let n = 1;
    if (/[A-ZÄÖÜ]/.test(s) && /[a-zäöüß]/.test(s)) n++;
    if (/\d/.test(s) && /[^\wäöüÄÖÜß]/.test(s) || s.length >= 14) n++;
    return n;
  }

  /**
   * opts: { url, anonKey, fetch, store: { get(k), set(k, v), remove(k) }, now: () => ms, redirectTo }
   */
  function createClient(opts) {
    const base = String(opts.url || '').replace(/\/+$/, '');
    const key = opts.anonKey;
    const doFetch = opts.fetch || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
    const store = opts.store;
    const now = opts.now || (() => Date.now());
    const SKEY = 'alltagsheld.session';
    let session = null;
    try { session = JSON.parse(store.get(SKEY) || 'null'); } catch (e) { session = null; }
    const listeners = [];
    const setSession = (s) => {
      session = s;
      if (s) store.set(SKEY, JSON.stringify(s)); else store.remove(SKEY);
      listeners.forEach((fn) => { try { fn(session); } catch (e) { /* egal */ } });
    };

    async function request(path, { method = 'GET', body, token, headers = {} } = {}) {
      let res;
      try {
        res = await doFetch(base + path, {
          method,
          headers: { apikey: key, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (e) { throw new AuthError(germanError('failed to fetch', 0), 0); }
      const text = await res.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
      if (!res.ok) {
        const msg = json && (json.msg || json.error_description || json.message || json.error_code || json.error);
        throw new AuthError(germanError(msg, res.status), res.status, json);
      }
      return json;
    }

    const toSession = (j) => ({
      access_token: j.access_token, refresh_token: j.refresh_token,
      expires_at: j.expires_at || Math.floor(now() / 1000) + (j.expires_in || 3600),
      user: j.user ? { id: j.user.id, email: j.user.email, name: (j.user.user_metadata || {}).name || '' } : null,
    });
    const redirect = () => (opts.redirectTo ? `?redirect_to=${encodeURIComponent(opts.redirectTo)}` : '');

    async function signUp(email, password, name) {
      if (!validEmail(email)) throw new AuthError('Bitte gib eine gültige E-Mail-Adresse ein.', 400);
      if (String(password || '').length < 8) throw new AuthError('Das Passwort muss mindestens 8 Zeichen haben.', 400);
      const j = await request(`/auth/v1/signup${redirect()}`, { method: 'POST', body: { email: email.trim(), password, data: { name: name || '' } } });
      if (j && j.access_token) { const s = toSession(j); setSession(s); return { session: s, needsConfirm: false }; }
      // Supabase verrät bei bestehender E-Mail nichts – leere Identitäten heißen „gibt es schon“
      if (j && Array.isArray(j.identities) && j.identities.length === 0) throw new AuthError(germanError('already registered'), 400);
      return { session: null, needsConfirm: true };
    }
    async function signIn(email, password) {
      if (!validEmail(email)) throw new AuthError('Bitte gib eine gültige E-Mail-Adresse ein.', 400);
      const j = await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: email.trim(), password } });
      const s = toSession(j);
      setSession(s);
      return s;
    }
    async function refresh() {
      if (!session || !session.refresh_token) return null;
      try {
        const j = await request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token } });
        const s = toSession(j);
        if (!s.user) s.user = session.user;
        setSession(s);
        return s;
      } catch (e) {
        if (e.status >= 400 && e.status < 500) setSession(null); // Anmeldung ungültig → abmelden
        throw e;
      }
    }
    /** gültige Sitzung (erneuert den Zugang kurz vor Ablauf) */
    async function getSession() {
      if (!session) return null;
      if (session.expires_at * 1000 - 60000 < now()) await refresh();
      return session;
    }
    async function authed(path, o = {}) {
      const s = await getSession();
      if (!s) throw new AuthError('Nicht angemeldet.', 401);
      try { return await request(path, { ...o, token: s.access_token }); } catch (e) {
        if (e.status !== 401) throw e;
        const s2 = await refresh();
        return request(path, { ...o, token: s2.access_token });
      }
    }
    async function signOut() {
      const s = session;
      setSession(null);
      if (s) { try { await request('/auth/v1/logout', { method: 'POST', token: s.access_token }); } catch (e) { /* lokal trotzdem abgemeldet */ } }
    }
    async function recover(email) {
      if (!validEmail(email)) throw new AuthError('Bitte gib deine E-Mail-Adresse ein.', 400);
      await request(`/auth/v1/recover${redirect()}`, { method: 'POST', body: { email: email.trim() } });
    }
    async function updatePassword(password) {
      if (String(password || '').length < 8) throw new AuthError('Das Passwort muss mindestens 8 Zeichen haben.', 400);
      await authed('/auth/v1/user', { method: 'PUT', body: { password } });
    }
    /** Sitzung aus dem Link übernehmen (Bestätigung / Passwort zurücksetzen) */
    async function fromHash(parsed) {
      const s = { ...parsed.session, user: null };
      const u = await request('/auth/v1/user', { token: s.access_token });
      s.user = { id: u.id, email: u.email, name: (u.user_metadata || {}).name || '' };
      setSession(s);
      return s;
    }

    // ---------- Daten ----------
    const uidQ = () => `user_id=eq.${encodeURIComponent(session.user.id)}`;
    async function peek() {
      const rows = await authed(`/rest/v1/user_data?select=updated_at&${uidQ()}`);
      return rows && rows[0] ? rows[0].updated_at : null;
    }
    async function pull() {
      const rows = await authed(`/rest/v1/user_data?select=data,updated_at&${uidQ()}`);
      return rows && rows[0] ? rows[0] : null;
    }
    async function push(data) {
      const rows = await authed('/rest/v1/user_data?on_conflict=user_id', {
        method: 'POST', body: { user_id: session.user.id, data },
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      });
      return rows && rows[0] ? rows[0].updated_at : new Date(now()).toISOString();
    }
    async function deleteAccount() {
      await authed('/rest/v1/rpc/delete_user', { method: 'POST', body: {} });
      setSession(null);
    }

    return {
      get session() { return session; },
      get user() { return session && session.user; },
      onChange: (fn) => listeners.push(fn),
      signUp, signIn, signOut, refresh, getSession, recover, updatePassword, fromHash,
      peek, pull, push, deleteAccount,
    };
  }

  /** Gibt es auf dem Gerät nennenswerte eigene Daten? */
  function hasLocalData(state) {
    if (!state) return false;
    const n = ['items', 'shopping', 'tasks', 'events', 'expenses', 'notes', 'habits', 'meds', 'deadlines', 'contracts', 'food', 'workouts']
      .reduce((a, k) => a + (Array.isArray(state[k]) ? state[k].length : 0), 0);
    return n > 0;
  }
  /** kurze Zusammenfassung eines Datenstands für die Auswahl beim ersten Anmelden */
  function describeData(state) {
    if (!state) return 'leer';
    const parts = [];
    const add = (k, one, many) => { const n = Array.isArray(state[k]) ? state[k].length : 0; if (n) parts.push(`${n} ${n === 1 ? one : many}`); };
    add('items', 'Produkt', 'Produkte'); add('tasks', 'Aufgabe', 'Aufgaben'); add('events', 'Termin', 'Termine');
    add('expenses', 'Ausgabe', 'Ausgaben'); add('notes', 'Notiz', 'Notizen');
    return parts.length ? parts.slice(0, 4).join(', ') : 'kaum Einträge';
  }

  return { createClient, parseAuthHash, germanError, validEmail, passwordStrength, hasLocalData, describeData, AuthError };
});
