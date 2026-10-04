/* Verträge & Abos, Checklisten & Routinen, Stundenplan, Prozent- und Schlafrechner.
   Läuft im Browser (window.FridgeOrganize) und in Node (Tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FridgeOrganize = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DAY = 86400000;
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / DAY);
  const r2 = (v) => Math.round(v * 100) / 100;
  /** Monate addieren, Monatsende bleibt gültig (31.01. + 1 Monat = 28./29.02.) */
  function addMonths(s, n) {
    const [y, m, d] = s.split('-').map(Number);
    const t = new Date(y, m - 1 + n, 1);
    const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    t.setDate(Math.min(d, last));
    return iso(t);
  }

  // ---------- Verträge & Abos ----------

  const CONTRACT_TYPES = {
    handy: { label: 'Handy', min: 24, renew: 1, notice: 1, unit: 'm' },
    internet: { label: 'Internet', min: 24, renew: 1, notice: 1, unit: 'm' },
    strom: { label: 'Strom', min: 12, renew: 1, notice: 1, unit: 'm' },
    gas: { label: 'Gas', min: 12, renew: 1, notice: 1, unit: 'm' },
    versicherung: { label: 'Versicherung', min: 12, renew: 12, notice: 3, unit: 'm' },
    streaming: { label: 'Streaming', min: 1, renew: 1, notice: 0, unit: 'm' },
    fitness: { label: 'Fitnessstudio', min: 12, renew: 1, notice: 1, unit: 'm' },
    zeitung: { label: 'Zeitung / Magazin', min: 12, renew: 1, notice: 1, unit: 'm' },
    sonstiges: { label: 'Sonstiges', min: 12, renew: 1, notice: 1, unit: 'm' },
  };
  const INTERVALS = { monat: { label: 'pro Monat', months: 1 }, quartal: { label: 'pro Quartal', months: 3 }, jahr: { label: 'pro Jahr', months: 12 } };

  const monthlyCost = (c) => r2((Number(c.cost) || 0) / (INTERVALS[c.interval] || INTERVALS.monat).months);
  /** Kündigungsfrist von einem Datum abziehen */
  function minusNotice(date, notice, unit) {
    if (!notice) return date;
    return unit === 'w' ? addDays(date, -7 * notice) : addMonths(date, -notice);
  }
  /**
   * Nächstes mögliches Vertragsende und spätester Kündigungstag.
   * Nach der Mindestlaufzeit verlängert sich der Vertrag um `renew` Monate.
   */
  function contractInfo(c, today) {
    const min = Math.max(0, Number(c.min) || 0), renew = Math.max(1, Number(c.renew) || 1);
    let end = addMonths(c.start, min || renew);
    let cancelBy = minusNotice(end, c.notice, c.unit);
    // Kündigungstag schon vorbei → nächstes Laufzeitende
    let guard = 0;
    while (!c.cancelled && cancelBy < today && guard++ < 600) { end = addMonths(end, renew); cancelBy = minusNotice(end, c.notice, c.unit); }
    if (c.cancelled) {
      end = c.endDate || end;
      const left = daysBetween(today, end);
      return { end, cancelBy: null, left, state: left < 0 ? 'ended' : 'cancelled' };
    }
    const left = daysBetween(today, cancelBy);
    return { end, cancelBy, left, state: left <= 30 ? 'soon' : 'running' };
  }
  function contractTotals(list) {
    const active = list.filter((c) => !c.cancelled);
    const month = r2(active.reduce((a, c) => a + monthlyCost(c), 0));
    return { month, year: r2(month * 12), count: active.length };
  }

  // ---------- Checklisten & Routinen ----------

  const CHECKLIST_TEMPLATES = [
    { title: 'Haus verlassen', daily: true, items: ['Herd und Ofen aus', 'Fenster zu', 'Licht aus', 'Schlüssel', 'Handy', 'Geldbeutel', 'Tür abschließen'] },
    { title: 'Morgenroutine', daily: true, items: ['Ein Glas Wasser trinken', 'Bett machen', 'Duschen', 'Frühstück', 'Tagesplan ansehen', 'Tasche packen'] },
    { title: 'Abendroutine', daily: true, items: ['Küche aufräumen', 'Handy laden', 'Kleidung für morgen rauslegen', 'Wecker stellen', 'Türen abschließen', 'Bildschirm aus, 15 Min lesen'] },
    { title: 'Urlaub – Wohnung', daily: false, items: ['Kühlschrank leeren', 'Müll rausbringen', 'Pflanzen versorgen', 'Heizung runterdrehen', 'Stecker ziehen', 'Wasser an der Waschmaschine zu', 'Fenster zu', 'Briefkasten leeren lassen'] },
    { title: 'Arzttermin', daily: false, items: ['Versichertenkarte', 'Überweisung', 'Medikamentenliste', 'Fragen notieren', 'Befunde / Impfpass'] },
    { title: 'Wocheneinkauf planen', daily: false, items: ['Vorrat prüfen', 'Wochenplan ansehen', 'Einkaufsliste vervollständigen', 'Pfand mitnehmen', 'Taschen einpacken'] },
  ];
  /** Tägliche Routinen jeden Morgen zurücksetzen. Gibt true zurück, wenn sich etwas geändert hat. */
  function resetChecklists(lists, today) {
    let changed = false;
    for (const l of lists) {
      if (!l.daily || l.lastReset === today) continue;
      l.items.forEach((i) => { i.done = false; });
      l.lastReset = today;
      changed = true;
    }
    return changed;
  }
  const checklistProgress = (l) => ({ done: l.items.filter((i) => i.done).length, total: l.items.length });

  // ---------- Stundenplan ----------

  const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const SUBJECT_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#4b5563'];
  const toMin = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
  /** Einträge eines Wochentags (1 = Montag … 6 = Samstag), nach Uhrzeit sortiert */
  function dayEntries(plan, wd) {
    return (plan.entries || []).filter((e) => Number(e.day) === wd).sort((a, b) => toMin(a.start) - toMin(b.start));
  }
  /** Was läuft gerade, was kommt als Nächstes? (Minuten seit Mitternacht) */
  function nowAndNext(entries, minutes) {
    const now = entries.find((e) => toMin(e.start) <= minutes && minutes < toMin(e.end || e.start) + (e.end ? 0 : 45)) || null;
    const next = entries.find((e) => toMin(e.start) > minutes) || null;
    return { now, next };
  }
  /** Farbe je Fach immer gleich */
  function subjectColor(title) {
    let h = 0;
    for (const ch of String(title).toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return SUBJECT_COLORS[h % SUBJECT_COLORS.length];
  }

  // ---------- Rechner ----------

  function discount(price, pct) {
    const p = Number(price), q = Number(pct);
    if (!Number.isFinite(p) || !Number.isFinite(q)) return null;
    const save = r2((p * q) / 100);
    return { save, final: r2(p - save) };
  }
  function vat(amount, rate, isGross) {
    const a = Number(amount), r = Number(rate) / 100;
    if (!Number.isFinite(a)) return null;
    const net = isGross ? r2(a / (1 + r)) : r2(a);
    const gross = isGross ? r2(a) : r2(a * (1 + r));
    return { net, gross, tax: r2(gross - net) };
  }
  /** Prozentuale Veränderung von a nach b */
  const pctChange = (a, b) => (Number(a) ? r2(((Number(b) - Number(a)) / Number(a)) * 100) : null);

  /** Schlafrechner: 90-Minuten-Zyklen + 15 Minuten zum Einschlafen. */
  function bedtimes(wake, cycles = [6, 5, 4]) {
    const w = toMin(wake);
    return cycles.map((c) => {
      const m = (((w - c * 90 - 15) % 1440) + 1440) % 1440;
      return { cycles: c, hours: c * 1.5, time: `${pad(Math.floor(m / 60))}:${pad(m % 60)}` };
    });
  }
  function wakeTimes(sleepNow, cycles = [4, 5, 6]) {
    const s = toMin(sleepNow) + 15;
    return cycles.map((c) => {
      const m = (s + c * 90) % 1440;
      return { cycles: c, hours: c * 1.5, time: `${pad(Math.floor(m / 60))}:${pad(m % 60)}` };
    });
  }

  return {
    addDays, addMonths, daysBetween,
    CONTRACT_TYPES, INTERVALS, monthlyCost, contractInfo, contractTotals,
    CHECKLIST_TEMPLATES, resetChecklists, checklistProgress,
    WEEKDAYS, dayEntries, nowAndNext, subjectColor, toMin,
    discount, vat, pctChange, bedtimes, wakeTimes,
  };
});
