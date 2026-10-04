/* Kalender (Termine, Wiederholungen, Erinnerungen, iCal-Export) und Ausgaben (Kategorien, Budget, Fixkosten).
   Läuft im Browser (window.FridgePlanner) und in Node (Tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FridgePlanner = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DAY = 86400000;
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const norm = (s) => String(s || '').toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // ---------- Kalender ----------

  const EVENT_TYPES = {
    termin: { label: 'Termin', emoji: '📌' },
    arzt: { label: 'Arzt', emoji: '🩺' },
    geburtstag: { label: 'Geburtstag', emoji: '🎂' },
    arbeit: { label: 'Arbeit/Schule', emoji: '💼' },
    familie: { label: 'Familie & Freunde', emoji: '👨‍👩‍👧' },
    muell: { label: 'Müllabfuhr', emoji: '🗑️' },
    haushalt: { label: 'Haushalt', emoji: '🧽' },
    sport: { label: 'Sport', emoji: '🏋️' },
    sonstiges: { label: 'Sonstiges', emoji: '🔖' },
  };

  const REPEATS = {
    none: 'einmalig', daily: 'täglich', weekdays: 'werktags (Mo–Fr)', weekly: 'jede Woche', biweekly: 'alle 2 Wochen', monthly: 'jeden Monat', yearly: 'jedes Jahr',
  };

  /** Fällt ein (wiederholter) Termin auf dieses Datum? */
  function occursOn(ev, day) {
    if (day < ev.date) return false;
    if (ev.until && day > ev.until) return false;
    const r = ev.repeat || 'none';
    if (r === 'none') return day === ev.date;
    const a = parse(ev.date), b = parse(day);
    const diff = Math.round((b - a) / DAY);
    if (r === 'daily') return true;
    if (r === 'weekdays') { const wd = b.getDay(); return wd >= 1 && wd <= 5; }
    if (r === 'weekly') return diff % 7 === 0;
    if (r === 'biweekly') return diff % 14 === 0;
    if (r === 'monthly') {
      // am 31. -> in kürzeren Monaten am letzten Tag
      const last = new Date(b.getFullYear(), b.getMonth() + 1, 0).getDate();
      return b.getDate() === Math.min(a.getDate(), last);
    }
    if (r === 'yearly') {
      if (a.getMonth() !== b.getMonth()) return false;
      const last = new Date(b.getFullYear(), b.getMonth() + 1, 0).getDate();
      return b.getDate() === Math.min(a.getDate(), last);
    }
    return false;
  }

  /** Alle Vorkommen zwischen from und to (inklusive), sortiert nach Datum und Uhrzeit. */
  function occurrences(events, from, to) {
    const out = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      for (const ev of events) if (occursOn(ev, d)) out.push({ event: ev, date: d });
    }
    return out.sort((x, y) => (x.date + (x.event.time || '')).localeCompare(y.date + (y.event.time || '')));
  }

  /** Kalenderblatt eines Monats: Wochen (Mo–So) mit ISO-Daten; Tage außerhalb des Monats als { iso, out: true }. */
  function monthGrid(year, month) {
    const first = new Date(year, month, 1);
    const start = new Date(year, month, 1 - ((first.getDay() + 6) % 7));
    const weeks = [];
    const d = new Date(start);
    do {
      const week = [];
      for (let i = 0; i < 7; i++) {
        week.push({ iso: iso(d), day: d.getDate(), out: d.getMonth() !== month });
        d.setDate(d.getDate() + 1);
      }
      weeks.push(week);
    } while (d.getMonth() === month);
    return weeks;
  }

  /** Alter am Geburtstag (wenn Geburtsjahr bekannt). */
  function ageOn(ev, day) {
    if (!ev.birthYear) return null;
    return Number(day.slice(0, 4)) - Number(ev.birthYear);
  }

  /** Zeitpunkt der Erinnerung (ms) für ein Vorkommen, oder null. remind = Minuten vorher. */
  function reminderTime(ev, day) {
    if (ev.remind == null || ev.remind === '' || ev.remind < 0) return null;
    const [h, m] = (ev.time || '09:00').split(':').map(Number);
    const d = parse(day);
    d.setHours(h, m, 0, 0);
    return d.getTime() - Number(ev.remind) * 60000;
  }

  /** Fällige Erinnerungen: Erinnerungszeit erreicht, Termin noch nicht länger vorbei, noch nicht gemeldet. */
  function dueReminders(events, now, notified = []) {
    const today = iso(new Date(now));
    const sent = new Set(notified);
    return occurrences(events.filter((e) => e.remind != null && e.remind !== ''), addDays(today, -1), addDays(today, 8))
      .filter((o) => {
        const t = reminderTime(o.event, o.date);
        const key = o.event.id + '@' + o.date;
        const [h, m] = (o.event.time || '23:59').split(':').map(Number);
        const start = parse(o.date); start.setHours(h, m);
        return t != null && t <= now && start.getTime() + 3600000 > now && !sent.has(key);
      })
      .map((o) => ({ ...o, key: o.event.id + '@' + o.date }));
  }

  function icsEscape(s) {
    return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  }

  /** iCalendar-Datei (.ics) – lässt sich in Google-, Apple- und Outlook-Kalender importieren (inkl. Erinnerung). */
  function toICS(events, stamp = new Date()) {
    const dt = (d, t) => d.replace(/-/g, '') + (t ? 'T' + t.replace(':', '') + '00' : '');
    const st = stamp.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const rr = { daily: 'FREQ=DAILY', weekdays: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', weekly: 'FREQ=WEEKLY', biweekly: 'FREQ=WEEKLY;INTERVAL=2', monthly: 'FREQ=MONTHLY', yearly: 'FREQ=YEARLY' };
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Frischecheck//Alltagshelfer//DE', 'CALSCALE:GREGORIAN'];
    for (const ev of events) {
      const type = EVENT_TYPES[ev.type] || EVENT_TYPES.termin;
      lines.push('BEGIN:VEVENT', `UID:${ev.id}@frischecheck`, `DTSTAMP:${st}`);
      if (ev.time) {
        lines.push(`DTSTART:${dt(ev.date, ev.time)}`);
        const end = ev.endTime && ev.endTime > ev.time ? ev.endTime : (() => { const [h, m] = ev.time.split(':').map(Number); return pad(Math.min(23, h + 1)) + ':' + pad(m); })();
        lines.push(`DTEND:${dt(ev.date, end)}`);
      } else {
        lines.push(`DTSTART;VALUE=DATE:${dt(ev.date)}`, `DTEND;VALUE=DATE:${dt(addDays(ev.date, 1))}`);
      }
      lines.push(`SUMMARY:${icsEscape(type.emoji + ' ' + ev.title)}`);
      if (ev.note) lines.push(`DESCRIPTION:${icsEscape(ev.note)}`);
      if (ev.location) lines.push(`LOCATION:${icsEscape(ev.location)}`);
      if (ev.repeat && rr[ev.repeat]) lines.push('RRULE:' + rr[ev.repeat] + (ev.until ? ';UNTIL=' + dt(ev.until) : ''));
      if (ev.remind != null && ev.remind !== '' && ev.remind >= 0) {
        lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(ev.title)}`, `TRIGGER:-PT${Number(ev.remind)}M`, 'END:VALARM');
      }
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }

  // ---------- Ausgaben ----------

  const EXPENSE_CATEGORIES = {
    lebensmittel: { label: 'Lebensmittel', emoji: '🛒', words: ['rewe', 'edeka', 'aldi', 'lidl', 'penny', 'netto', 'kaufland', 'supermarkt', 'einkauf', 'lebensmittel', 'baecker', 'backer', 'metzger', 'markt', 'getranke', 'getraenke'] },
    essen: { label: 'Essen gehen', emoji: '🍕', words: ['restaurant', 'pizza', 'doener', 'doner', 'imbiss', 'cafe', 'kaffee', 'lieferando', 'mcdonald', 'burger', 'mittagessen', 'essen gehen', 'kantine'] },
    haushalt: { label: 'Haushalt', emoji: '🧽', words: ['haushalt', 'ikea', 'baumarkt', 'obi', 'putzmittel', 'waschmittel', 'moebel', 'mobel', 'deko'] },
    drogerie: { label: 'Drogerie', emoji: '🧴', words: ['dm', 'rossmann', 'drogerie', 'muller', 'mueller', 'kosmetik', 'shampoo'] },
    wohnen: { label: 'Wohnen & Energie', emoji: '🏠', words: ['miete', 'strom', 'gas', 'heizung', 'nebenkosten', 'wasser', 'internet', 'telefon', 'handy', 'rundfunk', 'gez'] },
    mobilitaet: { label: 'Mobilität', emoji: '🚗', words: ['tanken', 'tankstelle', 'benzin', 'diesel', 'auto', 'werkstatt', 'bahn', 'bus', 'ticket', 'deutschlandticket', 'parken', 'taxi', 'fahrrad', 'laden'] },
    gesundheit: { label: 'Gesundheit', emoji: '💊', words: ['apotheke', 'arzt', 'medikament', 'zahnarzt', 'brille', 'physio', 'praxisgebuehr'] },
    freizeit: { label: 'Freizeit', emoji: '🎉', words: ['kino', 'konzert', 'urlaub', 'reise', 'hobby', 'spiel', 'buch', 'schwimmbad', 'ausflug', 'verein', 'fitnessstudio', 'gym'] },
    kleidung: { label: 'Kleidung', emoji: '👕', words: ['kleidung', 'schuhe', 'jacke', 'hose', 'zalando', 'h&m', 'primark', 'shirt'] },
    abos: { label: 'Abos & Verträge', emoji: '📺', words: ['netflix', 'spotify', 'disney', 'amazon prime', 'abo', 'versicherung', 'mitgliedschaft', 'youtube'] },
    geschenke: { label: 'Geschenke', emoji: '🎁', words: ['geschenk', 'geburtstag', 'weihnachten', 'blumen'] },
    sonstiges: { label: 'Sonstiges', emoji: '💶', words: [] },
    einnahme: { label: 'Einnahme', emoji: '💰', words: ['gehalt', 'lohn', 'rente', 'kindergeld', 'einnahme', 'erstattung', 'zinsen', 'bafoeg', 'taschengeld'] },
  };

  function detectExpenseCategory(text) {
    const t = ' ' + norm(text) + ' ';
    let best = 'sonstiges', len = 0;
    for (const [k, c] of Object.entries(EXPENSE_CATEGORIES)) {
      for (const w of c.words) {
        const re = new RegExp('(^|[^a-z])' + w.replace(/[.*+?^${}()|[\]\\&]/g, '\\$&'));
        if (re.test(t) && w.length > len) { best = k; len = w.length; }
      }
    }
    return best;
  }

  /** "12,50 Tanken", "Tanken 12.50 €", "Miete 850" -> { amount, note, category } */
  function parseExpenseText(text) {
    const t = String(text || '').trim();
    const m = t.match(/(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:€|euro|eur)?/i);
    if (!m) return null;
    let amount = parseFloat(m[1].replace(',', '.'));
    const before = t.slice(0, m.index);
    let after = t.slice(m.index + m[0].length);
    // gesprochen: "12 Euro 50"
    const cents = /euro|€|eur/i.test(m[0]) && !/[.,]/.test(m[1]) ? after.match(/^\s*(\d{1,2})\b/) : null;
    if (cents) { amount += Number(cents[1]) / 100; after = after.slice(cents[0].length); }
    const note = (before + ' ' + after)
      .replace(/(^|\s)(für|fuer|bei|beim|im|in|am|cent)(?=\s|$)/gi, ' ').replace(/€|\beuro\b|\beur\b/gi, '').replace(/\s+/g, ' ').trim();
    if (!(amount > 0)) return null;
    return { amount: Math.round(amount * 100) / 100, note: note ? note.charAt(0).toUpperCase() + note.slice(1) : '', category: detectExpenseCategory(note) };
  }

  /** Buchungen eines Monats (YYYY-MM), inklusive monatlicher Fixkosten. */
  function monthEntries(expenses, ym) {
    const out = [];
    const [y, m] = ym.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    for (const e of expenses) {
      if (e.repeat === 'monthly') {
        const startYm = e.date.slice(0, 7);
        if (ym < startYm || (e.until && ym > e.until.slice(0, 7))) continue;
        const day = Math.min(Number(e.date.slice(8, 10)), lastDay);
        out.push({ ...e, date: `${ym}-${pad(day)}`, recurring: true });
      } else if (e.date.slice(0, 7) === ym) out.push(e);
    }
    return out.sort((a, b) => b.date.localeCompare(a.date) || (b.created || '').localeCompare(a.created || ''));
  }

  /** Summen: gesamt, je Kategorie (absteigend) und je Tag. */
  function summarize(entries) {
    const total = Math.round(entries.reduce((s, e) => s + e.amount, 0) * 100) / 100;
    const cat = new Map();
    for (const e of entries) cat.set(e.category, (cat.get(e.category) || 0) + e.amount);
    const byCategory = [...cat.entries()].map(([category, amount]) => ({ category, amount: Math.round(amount * 100) / 100 }))
      .sort((a, b) => b.amount - a.amount);
    return { total, byCategory, count: entries.length };
  }

  /** Budget-Prognose: Wie viel darf ich pro Tag noch ausgeben? */
  function budgetStatus(total, budget, ym, today = new Date()) {
    if (!budget) return null;
    const [y, m] = ym.split('-').map(Number);
    const days = new Date(y, m, 0).getDate();
    const current = today.getFullYear() === y && today.getMonth() + 1 === m;
    const left = Math.round((budget - total) * 100) / 100;
    const daysLeft = current ? days - today.getDate() + 1 : 0;
    return { budget, left, pct: Math.min(100, Math.round((total / budget) * 100)), perDay: daysLeft ? Math.max(0, Math.round((left / daysLeft) * 100) / 100) : null, over: left < 0 };
  }

  function toCSV(entries) {
    const q = (s) => '"' + String(s ?? '').replace(/"/g, '""') + '"';
    const rows = [['Datum', 'Betrag', 'Kategorie', 'Notiz', 'Fixkosten'].join(';')];
    for (const e of entries) {
      rows.push([e.date.split('-').reverse().join('.'), e.amount.toFixed(2).replace('.', ','), q((EXPENSE_CATEGORIES[e.category] || EXPENSE_CATEGORIES.sonstiges).label), q(e.note), e.repeat === 'monthly' || e.recurring ? 'ja' : ''].join(';'));
    }
    return '\uFEFF' + rows.join('\r\n');
  }

  function shiftMonth(ym, n) {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  }

  function monthLabel(ym) {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  }

  const isIncome = (e) => e.category === 'einnahme';

  return {
    isIncome, EVENT_TYPES, REPEATS, occursOn, occurrences, monthGrid, ageOn, reminderTime, dueReminders, toICS, addDays,
    EXPENSE_CATEGORIES, detectExpenseCategory, parseExpenseText, monthEntries, summarize, budgetStatus, toCSV, shiftMonth, monthLabel,
  };
});
