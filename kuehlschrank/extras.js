/* Werkzeuge & Haushalt: Küchen-Umrechner, Rechnung teilen, Medikamente, Fristen, Zählerstände, Sparziele, Atemübung, Erfolge.
   Läuft im Browser (window.FridgeExtras) und in Node (Tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FridgeExtras = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DAY = 86400000;
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / DAY);
  const r2 = (v) => Math.round(v * 100) / 100;

  // ---------- Küchen-Umrechner ----------

  /** Volumen in ml */
  const VOLUME = { ml: 1, l: 1000, tasse: 240, cup: 240, el: 15, tl: 5, prise: 0.5 };
  const VOLUME_LABEL = { ml: 'ml', l: 'Liter', tasse: 'Tasse (US-Cup)', el: 'Esslöffel', tl: 'Teelöffel' };
  /** Gramm pro 240 ml (1 US-Cup) */
  const DENSITY = {
    wasser: 240, milch: 245, mehl: 125, zucker: 200, puderzucker: 120, butter: 227, reis: 185, haferflocken: 90, kakao: 85, honig: 340, oel: 218, salz: 288,
  };
  const DENSITY_LABEL = { wasser: 'Wasser', milch: 'Milch', mehl: 'Mehl', zucker: 'Zucker', puderzucker: 'Puderzucker', butter: 'Butter', reis: 'Reis', haferflocken: 'Haferflocken', kakao: 'Kakao', honig: 'Honig', oel: 'Öl', salz: 'Salz' };

  /** Umrechnen zwischen Volumen (ml, Tasse, EL …) und Gramm (abhängig von der Zutat). */
  function convertKitchen(value, from, to, ingredient = 'wasser') {
    const v = Number(value);
    if (!Number.isFinite(v)) return null;
    const gPerMl = (DENSITY[ingredient] || 240) / 240;
    const ml = from === 'g' ? v / gPerMl : VOLUME[from] != null ? v * VOLUME[from] : null;
    if (ml == null) return null;
    if (to === 'g') return r2(ml * gPerMl);
    return VOLUME[to] ? r2(ml / VOLUME[to]) : null;
  }

  const fToC = (f) => Math.round(((f - 32) * 5) / 9);
  const cToF = (c) => Math.round((c * 9) / 5 + 32);
  /** Umluft ist ca. 20 °C weniger als Ober-/Unterhitze. */
  const toUmluft = (c) => c - 20;

  // ---------- Rechnung teilen ----------
  /** Betrag + Trinkgeld auf Personen verteilen (in Cent genau; Rest bekommt die erste Person). */
  function splitBill(total, people, tipPct = 0) {
    const n = Math.max(1, Math.floor(people));
    const cents = Math.round(total * 100 * (1 + tipPct / 100));
    const base = Math.floor(cents / n);
    const rest = cents - base * n;
    return { total: cents / 100, tip: r2(cents / 100 - total), each: base / 100, first: (base + rest) / 100 };
  }

  // ---------- Medikamente ----------
  /** med: { times: ['08:00','20:00'], amount: 1, stock: 30, days: [1..7] (0=So) | null } */
  function dosesPerDay(med) {
    const perWeek = (med.days && med.days.length ? med.days.length : 7);
    return ((med.times || []).length * (med.amount || 1) * perWeek) / 7;
  }
  function takesOn(med, isoDate) {
    if (!med.days || !med.days.length) return true;
    return med.days.includes(parse(isoDate).getDay());
  }
  /** Wie lange reicht der Vorrat noch (Tage)? */
  function stockDays(med) {
    const per = dosesPerDay(med);
    if (med.stock == null || !per) return null;
    return Math.floor(med.stock / per);
  }
  /** Einnahmen eines Tages: [{ med, time, key, taken }] */
  function dosesOn(meds, isoDate, takenLog = {}) {
    const out = [];
    for (const m of meds) {
      if (!takesOn(m, isoDate)) continue;
      for (const t of m.times || []) {
        const key = `${m.id}@${isoDate}T${t}`;
        out.push({ med: m, time: t, key, taken: !!takenLog[key] });
      }
    }
    return out.sort((a, b) => a.time.localeCompare(b.time));
  }

  // ---------- Fristen & Dokumente ----------
  const DEADLINE_TYPES = {
    ausweis: { label: 'Personalausweis', emoji: '🪪', years: 10, remind: 90 },
    reisepass: { label: 'Reisepass', emoji: '🛂', years: 10, remind: 120 },
    fuehrerschein: { label: 'Führerschein', emoji: '🚗', years: 15, remind: 90 },
    tuev: { label: 'TÜV / Hauptuntersuchung', emoji: '🔧', years: 2, remind: 30 },
    garantie: { label: 'Garantie', emoji: '🧾', years: 2, remind: 30 },
    versicherung: { label: 'Versicherung', emoji: '🛡️', years: 1, remind: 30 },
    vertrag: { label: 'Vertrag / Kündigungsfrist', emoji: '📑', years: 1, remind: 30 },
    impfung: { label: 'Impfung / Vorsorge', emoji: '💉', years: 10, remind: 30 },
    sonstiges: { label: 'Sonstiges', emoji: '📌', years: 1, remind: 14 },
  };
  /** Ablauf aus Ausstellungsdatum + Laufzeit (Jahre). */
  function expiryFrom(startIso, years) {
    const d = parse(startIso);
    d.setFullYear(d.getFullYear() + Number(years));
    return iso(d);
  }
  /** Status einer Frist: overdue | due (innerhalb der Vorwarnzeit) | ok */
  function deadlineStatus(dl, today = new Date()) {
    const left = daysBetween(iso(dayStart(today)), dl.date);
    const remind = dl.remind ?? (DEADLINE_TYPES[dl.type] || DEADLINE_TYPES.sonstiges).remind;
    return { left, state: left < 0 ? 'overdue' : left <= remind ? 'due' : 'ok', remindDate: iso(new Date(parse(dl.date).getTime() - remind * DAY)) };
  }

  // ---------- Zählerstände ----------
  const METER_TYPES = {
    strom: { label: 'Strom', emoji: '⚡', unit: 'kWh', price: 0.35 },
    gas: { label: 'Gas', emoji: '🔥', unit: 'kWh', price: 0.12 },
    wasser: { label: 'Wasser', emoji: '💧', unit: 'm³', price: 4.5 },
    heizung: { label: 'Heizung/Fernwärme', emoji: '🌡️', unit: 'kWh', price: 0.15 },
  };
  /** readings: [{ date, value }] -> Verbrauch pro Tag, letzter Zeitraum, Jahres-Hochrechnung, Kosten */
  function meterStats(readings, price = 0, baseFeeYear = 0) {
    const r = [...readings].sort((a, b) => a.date.localeCompare(b.date));
    if (r.length < 2) return null;
    const first = r[0], last = r[r.length - 1], prev = r[r.length - 2];
    const days = daysBetween(first.date, last.date);
    if (days <= 0) return null;
    const perDay = (last.value - first.value) / days;
    const lastDays = daysBetween(prev.date, last.date);
    const lastPerDay = lastDays > 0 ? (last.value - prev.value) / lastDays : null;
    const year = perDay * 365;
    return {
      perDay: r2(perDay), lastPerDay: lastPerDay == null ? null : r2(lastPerDay), lastPeriod: { from: prev.date, to: last.date, used: r2(last.value - prev.value) },
      year: Math.round(year), costYear: Math.round(year * price + baseFeeYear), costMonth: Math.round((year * price + baseFeeYear) / 12),
      trend: lastPerDay == null || !perDay ? 0 : Math.round(((lastPerDay - perDay) / perDay) * 100),
      series: r.slice(1).map((x, i) => ({ date: x.date, perDay: r2((x.value - r[i].value) / Math.max(1, daysBetween(r[i].date, x.date))) })),
    };
  }

  // ---------- Sparziele ----------
  /** goal: { target, saved, until? } -> Fortschritt und nötige Monatsrate */
  function savingsPlan(goal, today = new Date()) {
    const pct = goal.target ? Math.min(100, Math.round((goal.saved / goal.target) * 100)) : 0;
    const left = Math.max(0, r2(goal.target - goal.saved));
    let perMonth = null, months = null;
    if (goal.until && left > 0) {
      const t = dayStart(today), u = parse(goal.until);
      months = Math.max(1, (u.getFullYear() - t.getFullYear()) * 12 + (u.getMonth() - t.getMonth()));
      perMonth = Math.ceil((left / months) * 100) / 100;
    }
    return { pct, left, perMonth, months, done: left === 0 };
  }

  // ---------- Atemübungen ----------
  const BREATHING = {
    box: { label: 'Box-Atmung 4-4-4-4 (Konzentration)', phases: [['Einatmen', 4], ['Halten', 4], ['Ausatmen', 4], ['Halten', 4]] },
    '478': { label: '4-7-8 (Einschlafen)', phases: [['Einatmen', 4], ['Halten', 7], ['Ausatmen', 8]] },
    ruhig: { label: 'Ruhig atmen 4-6 (Entspannen)', phases: [['Einatmen', 4], ['Ausatmen', 6]] },
  };
  /** Phase zu einem Zeitpunkt (Sekunden seit Start): { name, left, index, cycle } */
  function breathingPhase(patternKey, t) {
    const ph = BREATHING[patternKey].phases;
    const cycleLen = ph.reduce((s, p) => s + p[1], 0);
    const cycle = Math.floor(t / cycleLen);
    let x = t - cycle * cycleLen;
    for (let i = 0; i < ph.length; i++) {
      if (x < ph[i][1]) return { name: ph[i][0], left: ph[i][1] - x, dur: ph[i][1], index: i, cycle };
      x -= ph[i][1];
    }
    return { name: ph[0][0], left: ph[0][1], dur: ph[0][1], index: 0, cycle: cycle + 1 };
  }

  // ---------- Zufall ----------
  function pick(list, rand = Math.random) {
    const l = list.map((s) => String(s).trim()).filter(Boolean);
    return l.length ? l[Math.floor(rand() * l.length)] : null;
  }

  // ---------- Notiz-Vorlagen ----------
  const NOTE_TEMPLATES = [
    { title: 'Packliste Urlaub', text: '[ ] Ausweis / Reisepass\n[ ] Krankenversicherungskarte\n[ ] Handy + Ladekabel + Powerbank\n[ ] Kopfhörer\n[ ] Medikamente\n[ ] Zahnbürste & Zahnpasta\n[ ] Duschgel / Shampoo\n[ ] Sonnencreme\n[ ] Unterwäsche & Socken\n[ ] T-Shirts / Hosen\n[ ] Pullover / Jacke\n[ ] Schlafsachen\n[ ] Badesachen\n[ ] Bargeld / Karte\n[ ] Pflanzen versorgt, Fenster zu, Herd aus' },
    { title: 'Packliste Krankenhaus', text: '[ ] Versichertenkarte & Einweisung\n[ ] Medikamentenplan\n[ ] Ausweis\n[ ] Schlafanzug & Bademantel\n[ ] Hausschuhe\n[ ] Kulturbeutel\n[ ] Handy + langes Ladekabel\n[ ] Brille / Hörgerät\n[ ] Lesestoff\n[ ] Kontaktliste Angehörige' },
    { title: 'Wochenend-Einkauf Party', text: '[ ] Getränke\n[ ] Eis / Eiswürfel\n[ ] Chips & Snacks\n[ ] Brot & Dips\n[ ] Pappteller / Servietten\n[ ] Müllbeutel\n[ ] Kerzen / Deko' },
    { title: 'Umzug-Checkliste', text: '[ ] Umzugskartons besorgen\n[ ] Helfer / Transporter organisieren\n[ ] Halteverbot beantragen\n[ ] Nachsendeauftrag Post\n[ ] Strom, Gas, Internet ummelden\n[ ] Ummelden beim Bürgeramt (2 Wochen)\n[ ] Bank, Versicherungen, Arbeitgeber informieren\n[ ] Zählerstände notieren\n[ ] Schlüsselübergabe' },
    { title: 'Geschenkideen', text: 'Mama: \nPapa: \nPartner/in: \nKinder: \nFreunde: ' },
    { title: 'Wichtige Nummern', text: 'Notruf: 112\nPolizei: 110\nÄrztlicher Bereitschaftsdienst: 116 117\nGiftnotruf: \nHausarzt: \nVermieter / Hausverwaltung: \nSchlüsseldienst: ' },
    { title: 'Zählerstände & WLAN', text: 'WLAN-Name: \nWLAN-Passwort: \nStromzählernummer: \nKundennummer Strom: \nKundennummer Gas: ' },
  ];

  // ---------- Erfolge ----------
  /** Prüft Erfolge anhand des App-Zustands (s = state). Liefert [{ id, emoji, title, desc, done, progress? }] */
  function achievements(s, todayIso) {
    const consumed = s.history.filter((h) => h.kind === 'consumed').length;
    const wasted = s.history.filter((h) => h.kind === 'wasted').length;
    const last30 = s.history.filter((h) => todayIso && h.date >= addDaysIso(todayIso, -30));
    const maxHabitStreak = Math.max(0, ...s.habits.map((h) => longestStreak(s.habitLog, h)));
    const tasksDone = s.tasks.reduce((n, t) => n + (t.done ? 1 : 0) + (t.doneCount || 0), 0);
    const list = [
      ['erstes-produkt', '🧊', 'Gut gefüllt', 'Erstes Produkt im Vorrat', s.items.length + consumed + wasted >= 1],
      ['retter-10', '🦸', 'Lebensmittelretter', '10 Produkte verbraucht statt weggeworfen', consumed >= 10, Math.min(1, consumed / 10)],
      ['retter-50', '🏅', 'Profi-Retter', '50 Produkte verbraucht', consumed >= 50, Math.min(1, consumed / 50)],
      ['null-muell', '♻️', 'Null Verschwendung', '30 Tage nichts weggeworfen (mind. 10 verbraucht)', last30.filter((h) => h.kind === 'wasted').length === 0 && last30.filter((h) => h.kind === 'consumed').length >= 10],
      ['erstes-training', '💪', 'Losgelegt', 'Erstes Training absolviert', s.workouts.length >= 1],
      ['training-10', '🔥', 'Dranbleiber', '10 Trainings geschafft', s.workouts.length >= 10, Math.min(1, s.workouts.length / 10)],
      ['gewohnheit-7', '📅', 'Eine Woche stark', '7 Tage am Stück eine Gewohnheit erfüllt', maxHabitStreak >= 7, Math.min(1, maxHabitStreak / 7)],
      ['gewohnheit-30', '🌟', 'Neue Routine', '30 Tage am Stück eine Gewohnheit erfüllt', maxHabitStreak >= 30, Math.min(1, maxHabitStreak / 30)],
      ['aufgaben-25', '✅', 'Macher', '25 Aufgaben erledigt', tasksDone >= 25, Math.min(1, tasksDone / 25)],
      ['koch-eigenes', '👩‍🍳', 'Eigene Küche', 'Eigenes Rezept angelegt', s.customRecipes.length >= 1],
      ['planer', '🗓️', 'Vorausplaner', '5 Mahlzeiten im Wochenplan', Object.keys(s.plan).length >= 5, Math.min(1, Object.keys(s.plan).length / 5)],
      ['kalorien-7', '🍽️', 'Bewusst gegessen', 'An 7 Tagen Mahlzeiten eingetragen', new Set((s.food || []).map((f) => f.date)).size >= 7, Math.min(1, new Set((s.food || []).map((f) => f.date)).size / 7)],
      ['haushaltsbuch', '💶', 'Durchblick', '20 Buchungen im Haushaltsbuch', s.expenses.length >= 20, Math.min(1, s.expenses.length / 20)],
      ['sparer', '🐷', 'Sparfuchs', 'Ein Sparziel erreicht', (s.savings || []).some((g) => g.saved >= g.target && g.target > 0)],
    ];
    return list.map(([id, emoji, title, desc, done, progress]) => ({ id, emoji, title, desc, done: !!done, progress: done ? 1 : progress || 0 }));
  }
  function addDaysIso(isoDate, n) { const d = parse(isoDate); d.setDate(d.getDate() + n); return iso(d); }
  function longestStreak(log, h) {
    const days = Object.keys(log).filter((d) => (log[d][h.id] || 0) >= h.target).sort();
    let best = 0, cur = 0, prev = null;
    for (const d of days) { cur = prev && addDaysIso(prev, 1) === d ? cur + 1 : 1; best = Math.max(best, cur); prev = d; }
    return best;
  }

  return {
    VOLUME, VOLUME_LABEL, DENSITY, DENSITY_LABEL, convertKitchen, fToC, cToF, toUmluft, splitBill,
    dosesPerDay, takesOn, stockDays, dosesOn, DEADLINE_TYPES, expiryFrom, deadlineStatus,
    METER_TYPES, meterStats, savingsPlan, BREATHING, breathingPhase, pick, NOTE_TEMPLATES, achievements, longestStreak,
  };
});
