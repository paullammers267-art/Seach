// @ts-nocheck
// Alltagsheld – Push-Erinnerungen (Supabase Edge Function „push-reminders“)
// Läuft alle 5 Minuten (pg_cron), rechnet aus den gespeicherten App-Daten aus, was fällig ist,
// und schickt Web-Push-Nachrichten – auch wenn die App geschlossen ist.
// Ohne Zusatzpakete: Verschlüsselung (RFC 8291) und VAPID (RFC 8292) mit WebCrypto.
//
// Secrets (Edge Functions → Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, CRON_SECRET, optional VAPID_SUBJECT
// SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY stellt Supabase automatisch bereit.

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------
const enc = new TextEncoder();
export function b64uEncode(bytes) {
  let s = '';
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function b64uDecode(str) {
  const s = String(str).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

// ---------------------------------------------------------------------------
// VAPID (RFC 8292): signiertes JWT, damit der Push-Dienst weiß, dass die Nachricht von uns kommt
// ---------------------------------------------------------------------------
export async function vapidAuthHeader(endpoint, vapid, nowSec = Math.floor(Date.now() / 1000)) {
  const pub = b64uDecode(vapid.publicKey);
  const jwk = { kty: 'EC', crv: 'P-256', d: vapid.privateKey, x: b64uEncode(pub.slice(1, 33)), y: b64uEncode(pub.slice(33, 65)), ext: true };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const header = b64uEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64uEncode(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: nowSec + 12 * 3600, sub: vapid.subject || 'https://paullammers267-art.github.io/Seach/kuehlschrank/' })));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`)));
  return `vapid t=${header}.${claims}.${b64uEncode(sig)}, k=${vapid.publicKey}`;
}

// ---------------------------------------------------------------------------
// Verschlüsselung (RFC 8291, aes128gcm)
// ---------------------------------------------------------------------------
async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}
export async function encryptPayload(payload, p256dh, authSecret, opts = {}) {
  const uaPublic = b64uDecode(p256dh);
  const auth = b64uDecode(authSecret);
  const asKeys = opts.keyPair || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asKeys.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeys.privateKey, 256));
  const ikm = await hkdf(auth, ecdhSecret, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = opts.salt || crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const plain = concat(enc.encode(payload), new Uint8Array([2])); // 0x02 = letzter Datensatz
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, plain));
  const rs = new Uint8Array([0, 0, 16, 0]); // Datensatzgröße 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

export async function sendPush(sub, message, vapid, fetchFn = fetch) {
  const body = await encryptPayload(JSON.stringify(message), sub.p256dh, sub.auth);
  const res = await fetchFn(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthHeader(sub.endpoint, vapid),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(message.ttl || 3600),
      Urgency: 'high',
    },
    body,
  });
  return res.status;
}

// ---------------------------------------------------------------------------
// Was ist fällig? (gleiche Regeln wie in der App)
// ---------------------------------------------------------------------------
const DAY = 86400000;
const pad = (n) => String(n).padStart(2, '0');
const dayNum = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / DAY); };
const isoOf = (n) => new Date(n * DAY).toISOString().slice(0, 10);
const addDays = (iso, k) => isoOf(dayNum(iso) + k);
const daysBetween = (a, b) => dayNum(b) - dayNum(a);
const weekday = (iso) => new Date(dayNum(iso) * DAY).getUTCDay();
const toMin = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
function addMonths(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(Math.min(d, last))}`;
}
/** Ortszeit in der Zeitzone des Geräts */
export function localNow(nowMs, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(nowMs)).map((x) => [x.type, x.value]));
  const date = `${p.year}-${p.month}-${p.day}`;
  return { date, min: Number(p.hour) * 60 + Number(p.minute), abs: dayNum(date) * 1440 + Number(p.hour) * 60 + Number(p.minute) };
}
function occursOn(ev, day) {
  if (!ev.date || day < ev.date) return false;
  if (ev.until && day > ev.until) return false;
  const r = ev.repeat || 'none';
  if (r === 'none') return day === ev.date;
  const diff = daysBetween(ev.date, day);
  if (r === 'weekly') return diff % 7 === 0;
  if (r === 'biweekly') return diff % 14 === 0;
  const [, am, ad] = ev.date.split('-').map(Number);
  const [by, bm, bd] = day.split('-').map(Number);
  const last = new Date(Date.UTC(by, bm, 0)).getUTCDate();
  if (r === 'monthly') return bd === Math.min(ad, last);
  if (r === 'yearly') return am === bm && bd === Math.min(ad, last);
  return false;
}
function nextPickup(w, from) {
  if (!w.start) return null;
  if (!w.every) return w.start >= from ? w.start : null;
  if (w.start >= from) return w.start;
  return addDays(w.start, Math.ceil(daysBetween(w.start, from) / w.every) * w.every);
}
function cancelBy(c, today) {
  if (c.cancelled || !c.start) return null;
  const min = Math.max(0, Number(c.min) || 0), renew = Math.max(1, Number(c.renew) || 1);
  const minus = (d) => (!c.notice ? d : c.unit === 'w' ? addDays(d, -7 * c.notice) : addMonths(d, -c.notice));
  let end = addMonths(c.start, min || renew), by = minus(end), g = 0;
  while (by < today && g++ < 600) { end = addMonths(end, renew); by = minus(end); }
  return { by, end };
}
const WASTE = { rest: 'Restmüll', bio: 'Biotonne', papier: 'Papier', gelb: 'Gelber Sack', glas: 'Glas', sperr: 'Sperrmüll' };
const fmtDate = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
const leftText = (n) => (n === 0 ? 'heute' : n === 1 ? 'morgen' : `in ${n} Tagen`);
export const PUSH_TYPES = ['morning', 'meds', 'tasks', 'events', 'waste', 'deadlines', 'contracts', 'parcels', 'parking'];

/**
 * Alle Nachrichten, deren Zeitpunkt in (jetzt − fenster, jetzt] liegt.
 * Ergebnis: [{ key, title, body, view }]
 */
export function dueMessages(data, nowMs, tz, windowMin = 6) {
  const s = (data && data.settings) || {};
  const cfg = s.push || {};
  const on = (t) => !cfg.types || cfg.types[t] !== false;
  const L = localNow(nowMs, tz);
  const today = L.date;
  const inWindow = (date, min) => { const a = dayNum(date) * 1440 + min; return a > L.abs - windowMin && a <= L.abs; };
  const out = [];
  const add = (key, title, body, view) => out.push({ key, title, body, view });
  const morning = toMin(cfg.morning || '07:30');
  const evening = toMin(cfg.evening || '18:00');

  // Morgen-Überblick
  if (on('morning') && inWindow(today, morning)) {
    const parts = [];
    const tasks = (data.tasks || []).filter((t) => !t.done && t.due && t.due <= today);
    if (tasks.length) parts.push(`${tasks.length} Aufgabe${tasks.length > 1 ? 'n' : ''}${tasks.length <= 2 ? ': ' + tasks.map((t) => t.title).join(', ') : ''}`);
    const evs = (data.events || []).filter((e) => occursOn(e, today));
    const bdays = evs.filter((e) => e.type === 'geburtstag');
    if (bdays.length) parts.push(`Geburtstag: ${bdays.map((e) => e.title).join(', ')}`);
    const other = evs.filter((e) => e.type !== 'geburtstag');
    if (other.length) parts.push(`${other.length} Termin${other.length > 1 ? 'e' : ''}${other[0].time ? ` (ab ${other.map((e) => e.time).filter(Boolean).sort()[0]})` : ''}`);
    const exp = (data.items || []).filter((i) => i.expiry && i.expiry <= addDays(today, 1));
    if (exp.length) parts.push(`${exp.length === 1 ? exp[0].name : exp.length + ' Produkte'} ${exp.some((i) => i.expiry < today) ? 'abgelaufen/' : ''}läuft bald ab`);
    const plants = (data.plants || []).filter((p) => addDays(p.watered || p.added || today, Math.max(1, p.every || 7)) <= today);
    if (plants.length) parts.push(`${plants.length} Pflanze${plants.length > 1 ? 'n' : ''} gießen`);
    const loans = (data.loans || []).filter((l) => !l.returned && l.due && l.due <= today);
    if (loans.length) parts.push(`${loans.length}× zurückgeben`);
    if (parts.length) add(`morning:${today}`, 'Guten Morgen! Heute:', parts.join(' · '), 'home');
  }

  // Medikamente
  if (on('meds')) {
    const log = data.medLog || {};
    for (const m of data.meds || []) {
      if (m.days && m.days.length && !m.days.includes(weekday(today))) continue;
      for (const t of m.times || []) {
        const key = `${m.id}@${today}T${t}`;
        if (!log[key] && inWindow(today, toMin(t))) add(`med:${key}`, 'Medikament', `${m.name}${m.amount && m.amount !== 1 ? ` (${m.amount})` : ''} – ${t} Uhr`, 'meds');
      }
    }
  }

  // Aufgaben mit Uhrzeit
  if (on('tasks')) for (const t of data.tasks || []) {
    if (!t.done && t.due === today && t.time && inWindow(today, toMin(t.time))) add(`task:${t.id}@${today}`, 'Aufgabe', `${t.title} (${t.time} Uhr)`, 'tasks');
  }

  // Termine & Geburtstage (mit der in der App eingestellten Vorwarnzeit)
  if (on('events')) for (const ev of data.events || []) {
    if (ev.remind == null || ev.remind === '' || ev.remind < 0) continue;
    for (const d of [today, addDays(today, 1), addDays(today, 2), addDays(today, 7)]) {
      if (!occursOn(ev, d)) continue;
      const at = dayNum(d) * 1440 + toMin(ev.time || '09:00') - Number(ev.remind);
      if (at > L.abs - windowMin && at <= L.abs) {
        const bd = ev.type === 'geburtstag';
        add(`ev:${ev.id}@${d}`, bd ? 'Geburtstag' : 'Termin', `${bd ? ev.title + ' hat' : ev.title}${bd ? ' ' + (d === today ? 'heute' : leftText(daysBetween(today, d))) + ' Geburtstag' : ' – ' + (d === today ? 'heute' : leftText(daysBetween(today, d))) + (ev.time ? ` um ${ev.time} Uhr` : '')}`, 'calendar');
      }
    }
  }

  // Müll: am Vorabend
  if (on('waste') && inWindow(today, evening)) {
    const tomorrow = addDays(today, 1);
    const due = (data.waste || []).filter((w) => nextPickup(w, tomorrow) === tomorrow);
    if (due.length) add(`waste:${tomorrow}`, 'Müllabfuhr', `Heute Abend rausstellen: ${due.map((w) => WASTE[w.type] || w.type).join(', ')}`, 'waste');
  }

  const at9 = inWindow(today, toMin('09:00'));
  // Fristen (Ausweis, TÜV, Garantie …)
  if (on('deadlines') && at9) for (const d of data.deadlines || []) {
    if (!d.date) continue;
    const left = daysBetween(today, d.date);
    if ([Number(d.remind) || 30, 30, 7, 1, 0].includes(left)) add(`dl:${d.id}@${today}`, 'Frist', `${d.title}: läuft ${left === 0 ? 'heute' : leftText(left)} ab (${fmtDate(d.date)})`, 'deadlines');
  }
  // Kündigungsfristen
  if (on('contracts') && at9) for (const c of data.contracts || []) {
    const i = cancelBy(c, today);
    if (!i) continue;
    const left = daysBetween(today, i.by);
    if ([30, 14, 7, 3, 1, 0].includes(left)) add(`ctr:${c.id}@${today}`, 'Kündigungsfrist', `${c.name}: kündigen bis ${fmtDate(i.by)} (${leftText(left)}), sonst läuft er weiter`, 'contracts');
  }
  // Rückgabefristen
  if (on('parcels') && at9) for (const p of data.parcels || []) {
    if (!p.received || p.returned) continue;
    const days = p.returnDays == null ? 14 : p.returnDays;
    if (!days) continue;
    const left = daysBetween(today, addDays(p.received, days));
    if ([3, 1, 0].includes(left)) add(`ret:${p.id}@${today}`, 'Rückgabefrist', `${p.what}: zurückschicken bis ${fmtDate(addDays(p.received, days))} (${leftText(left)})`, 'parcels');
  }
  // Parkuhr (absolute Zeit)
  const park = data.parking;
  if (on('parking') && park && park.until) {
    for (const [mins, text] of [[10, 'Parkuhr läuft in 10 Minuten ab'], [0, 'Parkuhr abgelaufen']]) {
      const t = park.until - mins * 60000;
      if (t > nowMs - windowMin * 60000 && t <= nowMs) add(`park:${park.at}:${mins}`, 'Parken', text, 'parking');
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// HTTP-Handler
// ---------------------------------------------------------------------------
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function handler(req) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const env = (k) => Deno.env.get(k);
  const base = env('SUPABASE_URL'), service = env('SUPABASE_SERVICE_ROLE_KEY');
  const vapid = { publicKey: env('VAPID_PUBLIC_KEY'), privateKey: env('VAPID_PRIVATE_KEY'), subject: env('VAPID_SUBJECT') };
  if (!vapid.publicKey || !vapid.privateKey) return json({ error: 'VAPID-Schlüssel fehlen (Edge Functions → Secrets)' }, 500);
  const db = async (path, opts = {}) => {
    const r = await fetch(`${base}/rest/v1/${path}`, { ...opts, headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
    const t = await r.text();
    if (!r.ok) throw new Error(`${r.status} ${t}`);
    return t ? JSON.parse(t) : null;
  };
  const deliver = async (subs, msg) => {
    let sent = 0;
    for (const s of subs) {
      try {
        const status = await sendPush(s, msg, vapid);
        if (status === 404 || status === 410) await db(`push_subscriptions?id=eq.${s.id}`, { method: 'DELETE' }); // abgemeldet
        else if (status < 300) sent++;
      } catch (e) { console.error('push', e); }
    }
    return sent;
  };
  const body = await req.json().catch(() => ({}));

  // Test aus der App: nur an die eigenen Geräte
  if (body.test) {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const u = await fetch(`${base}/auth/v1/user`, { headers: { apikey: service, Authorization: `Bearer ${token}` } });
    if (!u.ok) return json({ error: 'nicht angemeldet' }, 401);
    const user = await u.json();
    const subs = await db(`push_subscriptions?user_id=eq.${user.id}&select=*`);
    const sent = await deliver(subs, { title: 'Alltagsheld', body: 'Push funktioniert – so kommen deine Erinnerungen an, auch wenn die App zu ist.', view: 'settings', tag: 'test' });
    return json({ devices: subs.length, sent });
  }

  // Zeitplaner (pg_cron)
  if (!env('CRON_SECRET') || req.headers.get('x-cron-secret') !== env('CRON_SECRET')) return json({ error: 'forbidden' }, 403);
  const now = Date.now();
  const subs = await db('push_subscriptions?select=*');
  const byUser = {};
  for (const s of subs) (byUser[s.user_id] = byUser[s.user_id] || []).push(s);
  const ids = Object.keys(byUser);
  let sent = 0, users = 0;
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const rows = await db(`user_data?select=user_id,data&user_id=in.(${chunk.join(',')})`);
    // Termine aus gemeinsamen Kalendern dazunehmen (falls eingerichtet)
    const mem = await db(`calendar_members?select=user_id,calendar_id&user_id=in.(${chunk.join(',')})`).catch(() => []);
    const calIds = [...new Set(mem.map((m) => m.calendar_id))];
    const shared = calIds.length ? await db(`shared_events?select=id,calendar_id,data&calendar_id=in.(${calIds.join(',')})`).catch(() => []) : [];
    for (const row of rows) {
      const mine = new Set(mem.filter((m) => m.user_id === row.user_id).map((m) => m.calendar_id));
      const extra = shared.filter((e) => mine.has(e.calendar_id)).map((e) => ({ ...e.data, id: e.id }));
      if (extra.length) row.data = { ...(row.data || {}), events: ((row.data && row.data.events) || []).concat(extra) };
      const list = byUser[row.user_id];
      const tz = list.map((s) => s.tz).filter(Boolean)[0] || 'Europe/Berlin';
      const msgs = dueMessages(row.data, now, tz);
      if (!msgs.length) continue;
      // doppelte Nachrichten vermeiden: nur Schlüssel, die neu eingetragen werden konnten, werden verschickt
      const fresh = await db('push_sent?on_conflict=user_id,key', {
        method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
        body: JSON.stringify(msgs.map((m) => ({ user_id: row.user_id, key: m.key }))),
      });
      const keys = new Set((fresh || []).map((f) => f.key));
      for (const m of msgs.filter((x) => keys.has(x.key))) sent += await deliver(list, { ...m, tag: m.key });
      users++;
    }
  }
  await db(`push_sent?sent_at=lt.${new Date(now - 3 * DAY).toISOString()}`, { method: 'DELETE' }).catch(() => {});
  return json({ subscriptions: subs.length, users, sent });
}

if (typeof Deno !== 'undefined') Deno.serve(handler);
