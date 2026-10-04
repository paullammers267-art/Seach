/* Kalender: Wochen- und Listenansicht, Termine teilen (Text, Link), gemeinsame Kalender (Farben, Einladungslinks).
   Läuft im Browser (window.FridgeCalendar) und in Node (Tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FridgeCalendar = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DAY = 86400000;
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const WD_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const WD_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

  /** Montag der Woche, in der `day` liegt */
  const weekStart = (day) => addDays(day, -((parse(day).getDay() + 6) % 7));
  const weekDays = (day) => { const m = weekStart(day); return Array.from({ length: 7 }, (_, i) => addDays(m, i)); };
  /** Kalenderwoche nach ISO 8601 */
  function isoWeek(day) {
    const d = parse(day);
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const jan4 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d - jan4) / DAY - 3 + ((jan4.getDay() + 6) % 7)) / 7);
  }
  /** „KW 41 · 5.–11. Okt 2026“ – ohne Jahr, wenn es das aktuelle ist (currentYear angeben) */
  function weekLabel(day, currentYear) {
    const [a, , , , , , b] = weekDays(day);
    const da = parse(a), db = parse(b);
    const left = da.getMonth() === db.getMonth() ? `${da.getDate()}.` : `${da.getDate()}. ${MONTHS[da.getMonth()].slice(0, 3)}`;
    return `KW ${isoWeek(day)} · ${left}–${db.getDate()}. ${MONTHS[db.getMonth()].slice(0, 3)}${db.getFullYear() === currentYear ? '' : ' ' + db.getFullYear()}`;
  }
  /** „Heute“, „Morgen“, „Mi., 7. Okt.“ */
  function dayHeading(day, today) {
    if (day === today) return 'Heute';
    if (day === addDays(today, 1)) return 'Morgen';
    if (day === addDays(today, -1)) return 'Gestern';
    const d = parse(day);
    return `${WD_LONG[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}${d.getFullYear() !== parse(today).getFullYear() ? ' ' + d.getFullYear() : ''}`;
  }
  const timeRange = (ev) => (ev.time ? (ev.endTime && ev.endTime > ev.time ? `${ev.time}–${ev.endTime}` : ev.time) : 'ganztägig');

  /**
   * Einträge eines Zeitraums nach Tag gruppiert und sortiert (ganztägig zuerst, dann nach Uhrzeit).
   * occ: [{ event, date }], extra: [{ date, text, … }]
   */
  function groupByDay(occ, extra, from, to) {
    const days = {};
    for (let d = from; d <= to; d = addDays(d, 1)) days[d] = { date: d, events: [], extra: [] };
    for (const o of occ) if (days[o.date]) days[o.date].events.push(o);
    for (const x of extra) if (days[x.date]) days[x.date].extra.push(x);
    for (const g of Object.values(days)) g.events.sort((a, b) => (a.event.time || '').localeCompare(b.event.time || '') || a.event.title.localeCompare(b.event.title));
    return Object.values(days);
  }

  // ---------- Teilen ----------

  /** Lesbarer Text für WhatsApp & Co. */
  function shareText(ev, date) {
    const d = parse(date || ev.date);
    const lines = [ev.title, `${WD_SHORT[d.getDay()]}., ${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}${ev.time ? ', ' + timeRange(ev) + ' Uhr' : ''}`];
    if (ev.location) lines.push(ev.location);
    if (ev.note) lines.push(ev.note);
    return lines.join('\n');
  }
  // UTF-8-sicheres Base64url (ohne Buffer, läuft auch im Browser)
  const b64e = (str) => {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const b64d = (s) => {
    const bin = atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  };
  const SHARE_FIELDS = ['title', 'type', 'date', 'time', 'endTime', 'repeat', 'remind', 'location', 'note', 'birthYear'];
  /** Termin als Link-Parameter (wer den Link öffnet, kann ihn übernehmen) */
  function encodeEvent(ev) {
    const o = {};
    for (const k of SHARE_FIELDS) if (ev[k] !== undefined && ev[k] !== '' && ev[k] !== null && !(k === 'repeat' && ev[k] === 'none')) o[k] = ev[k];
    return b64e(JSON.stringify(o));
  }
  function decodeEvent(s) {
    try {
      const o = JSON.parse(b64d(s));
      if (!o || typeof o.title !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.date || '')) return null;
      const ev = {};
      for (const k of SHARE_FIELDS) if (o[k] !== undefined) ev[k] = o[k];
      if (ev.time && !/^\d{2}:\d{2}$/.test(ev.time)) delete ev.time;
      if (ev.endTime && !/^\d{2}:\d{2}$/.test(ev.endTime)) delete ev.endTime;
      ev.title = ev.title.slice(0, 200);
      return { repeat: 'none', remind: '', note: '', time: '', ...ev };
    } catch (e) { return null; }
  }

  // ---------- Gemeinsame Kalender ----------

  const CAL_COLORS = ['#2563eb', '#db2777', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#dc2626', '#4b5563'];
  /** Code aus Einladungslink oder Eingabe holen */
  function parseInviteCode(input) {
    const s = String(input || '').trim();
    const m = s.match(/[?&]join=([A-Za-z0-9]+)/);
    const code = (m ? m[1] : s).replace(/[^A-Za-z0-9]/g, '');
    return code.length >= 8 && code.length <= 32 ? code.toLowerCase() : null;
  }
  const inviteLink = (base, code) => `${base.replace(/[?#].*$/, '')}?join=${code}`;

  return {
    addDays, weekStart, weekDays, isoWeek, weekLabel, dayHeading, timeRange, groupByDay,
    shareText, encodeEvent, decodeEvent,
    CAL_COLORS, parseInviteCode, inviteLink,
    WD_SHORT, MONTHS,
  };
});
