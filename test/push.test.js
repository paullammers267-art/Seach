const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const nodeCrypto = require('crypto');

// Die Edge Function ist reines JavaScript (mit „// @ts-nocheck“) – für Node als .mjs laden
let F;
async function load() {
  if (F) return F;
  const src = fs.readFileSync(path.join(__dirname, '../kuehlschrank/supabase/functions/push-reminders/index.ts'), 'utf8');
  const tmp = path.join(os.tmpdir(), `push-reminders-${process.pid}.mjs`);
  fs.writeFileSync(tmp, src);
  F = await import(tmp);
  return F;
}

/** Empfänger-Seite unabhängig nachgebaut (wie ein Browser entschlüsselt, RFC 8291) */
function decrypt(body, uaEcdh, auth) {
  const salt = body.subarray(0, 16);
  const rs = body.readUInt32BE(16);
  const idlen = body[20];
  const asPublic = body.subarray(21, 21 + idlen);
  const cipher = body.subarray(21 + idlen);
  assert.equal(rs, 4096);
  const ecdh = uaEcdh.computeSecret(asPublic);
  const info = Buffer.concat([Buffer.from('WebPush: info\0'), uaEcdh.getPublicKey(), asPublic]);
  const ikm = Buffer.from(nodeCrypto.hkdfSync('sha256', ecdh, auth, info, 32));
  const cek = Buffer.from(nodeCrypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(nodeCrypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = nodeCrypto.createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(cipher.subarray(cipher.length - 16));
  const plain = Buffer.concat([d.update(cipher.subarray(0, cipher.length - 16)), d.final()]);
  assert.equal(plain[plain.length - 1], 2, 'Ende-Markierung');
  return plain.subarray(0, plain.length - 1).toString();
}

test('Web-Push: Nachricht ist für das Gerät entschlüsselbar', async () => {
  const f = await load();
  const ua = nodeCrypto.createECDH('prime256v1');
  ua.generateKeys();
  const auth = nodeCrypto.randomBytes(16);
  const msg = JSON.stringify({ title: 'Medikament', body: 'Ramipril – 08:00 Uhr äöü 💊' });
  const body = Buffer.from(await f.encryptPayload(msg, f.b64uEncode(ua.getPublicKey()), f.b64uEncode(auth)));
  assert.equal(decrypt(body, ua, auth), msg);
});

test('VAPID: gültige ES256-Signatur für den Push-Dienst', async () => {
  const f = await load();
  const { privateKey, publicKey } = nodeCrypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privateKey.export({ format: 'jwk' });
  const pub = f.b64uEncode(Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]));
  const h = await f.vapidAuthHeader('https://fcm.googleapis.com/fcm/send/abc', { publicKey: pub, privateKey: jwk.d, subject: 'mailto:test@example.com' }, 1800000000);
  const m = h.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/);
  assert.ok(m, h);
  assert.equal(m[4], pub);
  const claims = JSON.parse(Buffer.from(m[2], 'base64url'));
  assert.deepEqual(claims, { aud: 'https://fcm.googleapis.com', exp: 1800000000 + 43200, sub: 'mailto:test@example.com' });
  const ok = nodeCrypto.verify('sha256', Buffer.from(`${m[1]}.${m[2]}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(m[3], 'base64url'));
  assert.ok(ok, 'Signatur prüft');
});

test('Fällige Erinnerungen in Ortszeit (Europe/Berlin)', async () => {
  const f = await load();
  const at = (iso) => new Date(iso).getTime(); // Zeit mit Zonenangabe
  const data = {
    settings: { push: { morning: '07:30' } },
    meds: [{ id: 'm1', name: 'Ramipril', amount: 1, times: ['08:00', '20:00'] }, { id: 'm2', name: 'Vitamin D', times: ['08:00'], days: [1] }],
    medLog: {},
    tasks: [{ id: 't1', title: 'Steuer', due: '2026-10-03', done: false }, { id: 't2', title: 'Mama anrufen', due: '2026-10-03', time: '10:00', done: false }],
    events: [{ id: 'e1', title: 'Zahnarzt', date: '2026-10-03', time: '15:30', remind: 60 }, { id: 'b1', type: 'geburtstag', title: 'Oma', date: '2020-10-04', repeat: 'yearly', remind: 1440 }],
    items: [{ name: 'Milch', expiry: '2026-10-03' }],
    waste: [{ type: 'gelb', start: '2026-09-22', every: 14 }],
    deadlines: [{ id: 'd1', title: 'Personalausweis', date: '2026-10-10', remind: 90 }],
    contracts: [{ id: 'c1', name: 'Telekom', start: '2024-11-03', min: 24, renew: 1, notice: 1, unit: 'm' }],
    parking: { at: 1, until: at('2026-10-03T12:00:00+02:00') },
  };
  const keys = (iso) => f.dueMessages(data, at(iso), 'Europe/Berlin').map((m) => m.key);
  // Samstag 03.10.2026 (Sommerzeit, UTC+2)
  const morning = f.dueMessages(data, at('2026-10-03T07:31:00+02:00'), 'Europe/Berlin');
  assert.deepEqual(morning.map((m) => m.key), ['morning:2026-10-03']);
  assert.match(morning[0].body, /2 Aufgaben: Steuer, Mama anrufen · 1 Termin \(ab 15:30\) · Milch läuft bald ab/);
  assert.deepEqual(keys('2026-10-03T08:02:00+02:00'), ['med:m1@2026-10-03T08:00'], 'Vitamin D nur montags');
  data.medLog['m1@2026-10-03T08:00'] = true;
  assert.deepEqual(keys('2026-10-03T08:02:00+02:00'), [], 'schon genommen → keine Nachricht');
  assert.deepEqual(keys('2026-10-03T09:00:00+02:00'), ['ev:b1@2026-10-04', 'dl:d1@2026-10-03', 'ctr:c1@2026-10-03'], 'Geburtstag am Vortag 9 Uhr, Frist 7 Tage, Kündigung 30 Tage');
  assert.deepEqual(keys('2026-10-03T10:03:00+02:00'), ['task:t2@2026-10-03']);
  assert.deepEqual(keys('2026-10-03T11:50:00+02:00'), ['park:1:10']);
  assert.deepEqual(keys('2026-10-03T14:31:00+02:00'), ['ev:e1@2026-10-03']);
  assert.deepEqual(keys('2026-10-03T14:40:00+02:00'), [], 'außerhalb des Fensters');
  assert.deepEqual(keys('2026-10-05T18:01:00+02:00'), ['waste:2026-10-06']);
  // abgeschaltete Art
  data.settings.push.types = { waste: false };
  assert.deepEqual(keys('2026-10-05T18:01:00+02:00'), []);
  // Winterzeit (UTC+1) und andere Zeitzone
  assert.deepEqual(f.dueMessages({ meds: [{ id: 'x', name: 'A', times: ['08:00'] }] }, at('2026-12-01T07:01:00Z'), 'Europe/Berlin').map((m) => m.key), ['med:x@2026-12-01T08:00']);
  assert.deepEqual(f.dueMessages({ meds: [{ id: 'x', name: 'A', times: ['08:00'] }] }, at('2026-12-01T13:02:00Z'), 'America/New_York').map((m) => m.key), ['med:x@2026-12-01T08:00']);
});

test('Server-Ablauf: Zeitplaner, keine Doppelten, abgemeldete Geräte, Test-Nachricht, Schutz', async () => {
  // Fake-Umgebung wie bei Supabase
  const { privateKey } = nodeCrypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privateKey.export({ format: 'jwk' });
  const pub = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]).toString('base64url');
  const env = { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service', VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: jwk.d, CRON_SECRET: 'geheim' };
  let handler = null;
  globalThis.Deno = { env: { get: (k) => env[k] }, serve: (h) => { handler = h; } };
  const src = fs.readFileSync(path.join(__dirname, '../kuehlschrank/supabase/functions/push-reminders/index.ts'), 'utf8');
  const tmp = path.join(os.tmpdir(), `push-handler-${process.pid}.mjs`);
  fs.writeFileSync(tmp, src);
  await import(tmp);
  assert.ok(handler, 'Deno.serve aufgerufen');

  // Geräte: eins aktiv, eins abgemeldet (410)
  const ua = nodeCrypto.createECDH('prime256v1'); ua.generateKeys();
  const authSecret = nodeCrypto.randomBytes(16);
  let subs = [
    { id: 's1', user_id: 'u1', endpoint: 'https://push.example/ok', p256dh: ua.getPublicKey('base64url'), auth: authSecret.toString('base64url'), tz: 'Europe/Berlin' },
    { id: 's2', user_id: 'u1', endpoint: 'https://push.example/gone', p256dh: ua.getPublicKey('base64url'), auth: authSecret.toString('base64url'), tz: 'Europe/Berlin' },
  ];
  const sentKeys = new Set();
  const delivered = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, o = {}) => {
    const u = new URL(url);
    const reply = (status, b) => new Response(b === undefined ? null : JSON.stringify(b), { status });
    if (u.host === 'push.example') {
      if (u.pathname === '/gone') return reply(410);
      assert.match(o.headers.Authorization, /^vapid t=.+, k=/);
      delivered.push(JSON.parse(decrypt(Buffer.from(o.body), ua, authSecret)));
      return reply(201);
    }
    assert.equal(o.headers.Authorization, u.pathname.startsWith('/auth') ? 'Bearer user-token' : 'Bearer service');
    if (u.pathname === '/auth/v1/user') return reply(200, { id: 'u1' });
    if (u.pathname === '/rest/v1/push_subscriptions') {
      if ((o.method || 'GET') === 'DELETE') { subs = subs.filter((s) => `eq.${s.id}` !== u.searchParams.get('id')); return reply(204); }
      return reply(200, subs.filter((s) => !u.searchParams.get('user_id') || u.searchParams.get('user_id') === `eq.${s.user_id}`));
    }
    if (u.pathname === '/rest/v1/user_data') return reply(200, [{ user_id: 'u1', data: { meds: [{ id: 'm', name: 'Ramipril', times: ['08:00'] }] } }]);
    if (u.pathname === '/rest/v1/push_sent') {
      if (o.method === 'DELETE') return reply(204);
      const rows = JSON.parse(o.body).filter((r) => !sentKeys.has(r.user_id + r.key));
      rows.forEach((r) => sentKeys.add(r.user_id + r.key));
      return reply(201, rows);
    }
    return reply(404, {});
  };
  const realNow = Date.now;
  Date.now = () => new Date('2026-10-03T08:01:00+02:00').getTime();
  try {
    const cron = () => handler(new Request('https://f/push', { method: 'POST', headers: { 'x-cron-secret': 'geheim' }, body: '{}' }));
    assert.equal((await handler(new Request('https://f/push', { method: 'POST', body: '{}' }))).status, 403, 'ohne Geheimnis kein Versand');
    let r = await (await cron()).json();
    assert.deepEqual(r, { subscriptions: 2, users: 1, sent: 1 });
    assert.deepEqual(delivered[0], { key: 'med:m@2026-10-03T08:00', title: 'Medikament', body: 'Ramipril – 08:00 Uhr', view: 'meds', tag: 'med:m@2026-10-03T08:00' });
    assert.deepEqual(subs.map((s) => s.id), ['s1'], 'abgemeldetes Gerät entfernt');
    r = await (await cron()).json();
    assert.equal(r.sent, 0, 'zweiter Lauf: nichts doppelt');
    const t = await (await handler(new Request('https://f/push', { method: 'POST', headers: { Authorization: 'Bearer user-token' }, body: '{"test":true}' }))).json();
    assert.deepEqual(t, { devices: 1, sent: 1 });
    assert.match(delivered[1].body, /Push funktioniert/);
  } finally { globalThis.fetch = realFetch; Date.now = realNow; delete globalThis.Deno; }
});
