const test = require('node:test');
const assert = require('node:assert');
const Au = require('../kuehlschrank/auth.js');

/** Mini-Supabase im Speicher: Auth + Tabelle user_data mit „nur eigene Zeile“ */
function fakeSupabase({ confirm = false } = {}) {
  const users = {}, rows = {}, tokens = {};
  let n = 0, clock = 1000;
  const log = [];
  const issue = (u) => { const t = 'at' + (++n); tokens[t] = { id: u.id, exp: clock + 3600 }; return { access_token: t, refresh_token: 'rt' + n, expires_in: 3600, expires_at: clock + 3600, user: { id: u.id, email: u.email, user_metadata: { name: u.name } } }; };
  const reply = (status, body) => ({ ok: status < 300, status, text: async () => (body === undefined ? '' : JSON.stringify(body)) });
  const fetch = async (url, o) => {
    const u = new URL(url);
    const body = o.body ? JSON.parse(o.body) : {};
    log.push(`${o.method} ${u.pathname}${u.search}`);
    assert.equal(o.headers.apikey, 'anon');
    const auth = (o.headers.Authorization || '').replace('Bearer ', '');
    const me = tokens[auth] && tokens[auth].exp > clock ? users[Object.keys(users).find((e) => users[e].id === tokens[auth].id)] : null;
    if (u.pathname === '/auth/v1/signup') {
      if (users[body.email]) return reply(200, { id: 'x', identities: [] });
      users[body.email] = { id: 'u' + Object.keys(users).length, email: body.email, pw: body.password, name: body.data.name, confirmed: !confirm };
      return confirm ? reply(200, { id: users[body.email].id, email: body.email, identities: [{}] }) : reply(200, issue(users[body.email]));
    }
    if (u.pathname === '/auth/v1/token' && u.searchParams.get('grant_type') === 'password') {
      const usr = users[body.email];
      if (!usr || usr.pw !== body.password) return reply(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
      if (!usr.confirmed) return reply(400, { error_code: 'email_not_confirmed', msg: 'Email not confirmed' });
      return reply(200, issue(usr));
    }
    if (u.pathname === '/auth/v1/token') {
      const id = body.refresh_token && body.refresh_token.startsWith('rt') ? Object.values(users)[0] : null;
      return id ? reply(200, issue(id)) : reply(400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token' });
    }
    if (u.pathname === '/auth/v1/logout') return reply(204);
    if (u.pathname === '/auth/v1/recover') return reply(200, {});
    if (u.pathname === '/auth/v1/user') {
      if (!me) return reply(401, { msg: 'invalid JWT' });
      if (o.method === 'PUT') { me.pw = body.password; return reply(200, {}); }
      return reply(200, { id: me.id, email: me.email, user_metadata: { name: me.name } });
    }
    if (u.pathname === '/rest/v1/user_data') {
      if (!me) return reply(401, { message: 'JWT expired' });
      if (o.method === 'GET') {
        const id = u.searchParams.get('user_id').replace('eq.', '');
        if (id !== me.id) return reply(200, []); // RLS
        return reply(200, rows[id] ? [{ data: rows[id].data, updated_at: rows[id].updated_at }] : []);
      }
      if (body.user_id !== me.id) return reply(403, { message: 'new row violates row-level security policy' });
      rows[me.id] = { data: body.data, updated_at: `2026-10-04T10:00:${String(++n).padStart(2, '0')}Z` };
      return reply(201, [{ user_id: me.id, updated_at: rows[me.id].updated_at }]);
    }
    if (u.pathname === '/rest/v1/rpc/delete_user') { delete rows[me.id]; delete users[me.email]; return reply(204); }
    return reply(404, { message: 'not found' });
  };
  return { fetch, users, rows, log, tick: (s) => { clock += s; }, now: () => clock * 1000 };
}
const memStore = () => { const m = {}; return { get: (k) => m[k] ?? null, set: (k, v) => { m[k] = v; }, remove: (k) => { delete m[k]; }, m }; };

test('Konto erstellen, Daten speichern und auf zweitem Gerät laden', async () => {
  const sb = fakeSupabase();
  const c = Au.createClient({ url: 'https://x.supabase.co/', anonKey: 'anon', fetch: sb.fetch, store: memStore(), now: sb.now, redirectTo: 'https://app.example/' });
  const r = await c.signUp('paul@example.de', 'geheim12345', 'Paul');
  assert.equal(r.needsConfirm, false);
  assert.equal(c.user.name, 'Paul');
  assert.ok(sb.log[0].includes('redirect_to=https%3A%2F%2Fapp.example%2F'));
  assert.equal(await c.pull(), null);
  const at = await c.push({ items: [{ name: 'Milch' }] });
  assert.equal(await c.peek(), at);

  const c2 = Au.createClient({ url: 'https://x.supabase.co', anonKey: 'anon', fetch: sb.fetch, store: memStore(), now: sb.now });
  await c2.signIn('paul@example.de', 'geheim12345');
  assert.deepEqual((await c2.pull()).data, { items: [{ name: 'Milch' }] });
});

test('Fehlermeldungen auf Deutsch', async () => {
  const sb = fakeSupabase();
  const c = Au.createClient({ url: 'https://x.supabase.co', anonKey: 'anon', fetch: sb.fetch, store: memStore(), now: sb.now });
  await assert.rejects(c.signUp('kaputt', 'geheim12345'), /gültige E-Mail/);
  await assert.rejects(c.signUp('a@b.de', 'kurz'), /mindestens 8/);
  await c.signUp('a@b.de', 'geheim12345');
  await c.signOut();
  await assert.rejects(c.signUp('a@b.de', 'geheim12345'), /schon ein Konto/);
  await assert.rejects(c.signIn('a@b.de', 'falsch12345'), /E-Mail oder Passwort ist falsch/);
  const off = Au.createClient({ url: 'https://x', anonKey: 'anon', fetch: async () => { throw new TypeError('Failed to fetch'); }, store: memStore() });
  await assert.rejects(off.signIn('a@b.de', 'x'), /Keine Verbindung/);
});

test('E-Mail-Bestätigung nötig', async () => {
  const sb = fakeSupabase({ confirm: true });
  const c = Au.createClient({ url: 'https://x.supabase.co', anonKey: 'anon', fetch: sb.fetch, store: memStore(), now: sb.now });
  const r = await c.signUp('neu@example.de', 'geheim12345');
  assert.equal(r.needsConfirm, true);
  assert.equal(c.session, null);
  await assert.rejects(c.signIn('neu@example.de', 'geheim12345'), /bestätige zuerst/);
});

test('Zugang wird automatisch erneuert, Sitzung bleibt gespeichert', async () => {
  const sb = fakeSupabase();
  const store = memStore();
  const c = Au.createClient({ url: 'https://x.supabase.co', anonKey: 'anon', fetch: sb.fetch, store, now: sb.now });
  await c.signUp('p@x.de', 'geheim12345');
  await c.push({ a: 1 });
  sb.tick(4000); // Token abgelaufen
  assert.deepEqual((await c.pull()).data, { a: 1 });
  assert.ok(sb.log.some((l) => l.includes('grant_type=refresh_token')));
  const again = Au.createClient({ url: 'https://x.supabase.co', anonKey: 'anon', fetch: sb.fetch, store, now: sb.now });
  assert.equal(again.user.email, 'p@x.de', 'nach Neustart noch angemeldet');
  await again.deleteAccount();
  assert.equal(again.session, null);
  assert.equal(Object.keys(sb.users).length, 0);
});

test('Link aus der E-Mail auswerten', () => {
  const p = Au.parseAuthHash('#access_token=abc&expires_in=3600&refresh_token=r1&token_type=bearer&type=recovery');
  assert.equal(p.type, 'recovery');
  assert.equal(p.session.refresh_token, 'r1');
  assert.match(Au.parseAuthHash('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid').error, /abgelaufen/);
  assert.equal(Au.parseAuthHash('#foo'), null);
  assert.equal(Au.parseAuthHash(''), null);
});

test('Hilfsfunktionen', () => {
  assert.equal(Au.passwordStrength('kurz'), 0);
  assert.equal(Au.passwordStrength('langespasswort'), 2);
  assert.equal(Au.passwordStrength('Lange-Passwort-2026'), 3);
  assert.ok(!Au.hasLocalData({ items: [], tasks: [] }));
  assert.ok(Au.hasLocalData({ items: [{}] }));
  assert.equal(Au.describeData({ items: [{}, {}], tasks: [{}] }), '2 Produkte, 1 Aufgabe');
});
