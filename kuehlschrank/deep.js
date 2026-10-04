/* Vertiefungen: Einkaufsliste nach Gängen, Ausgaben-Verlauf, Gewohnheits-Kalender, Erinnerungs-Export,
   Geburtstage & Geschenkideen, Tagebuch. Läuft im Browser (window.FridgeDeep) und in Node (Tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FridgeDeep = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DAY = 86400000;
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / DAY);
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss');
  const r2 = (v) => Math.round(v * 100) / 100;

  // ---------- Einkaufsliste nach Gängen ----------

  const AISLES = [
    { key: 'obst', label: 'Obst & Gemüse', ings: ['tomaten', 'paprika', 'zwiebeln', 'knoblauch', 'karotten', 'zucchini', 'gurke', 'champignons', 'spinat', 'salat', 'brokkoli', 'blumenkohl', 'lauch', 'kartoffeln', 'kuerbis', 'aepfel', 'bananen', 'beeren', 'zitrone', 'aubergine', 'kohl', 'spargel', 'avocado', 'suesskartoffel'],
      words: ['obst', 'gemuse', 'apfel', 'birne', 'orange', 'mandarine', 'traube', 'kiwi', 'mango', 'ananas', 'melone', 'erdbeer', 'himbeer', 'heidelbeer', 'limette', 'ingwer', 'kraut', 'kraeuter', 'petersilie', 'basilikum', 'schnittlauch', 'radieschen', 'sellerie', 'fenchel', 'ruccola', 'rucola', 'pilze', 'tomate', 'kartoffel', 'zwiebel', 'mohre', 'moehre', 'pfirsich', 'pflaume', 'kirsch'] },
    { key: 'brot', label: 'Brot & Backwaren', ings: ['brot', 'wraps'], words: ['brot', 'brotchen', 'broetchen', 'toast', 'baguette', 'croissant', 'brezel', 'kuchen', 'semmel', 'knackebrot', 'zwieback'] },
    { key: 'kuehl', label: 'Kühlregal', ings: ['milch', 'sahne', 'sauresahne', 'butter', 'kaese', 'mozzarella', 'parmesan', 'feta', 'frischkaese', 'joghurt', 'quark', 'eier', 'schinken', 'wurst', 'tofu', 'gnocchi', 'pesto'],
      words: ['milch', 'kase', 'kaese', 'joghurt', 'quark', 'butter', 'sahne', 'ei', 'eier', 'wurst', 'salami', 'schinken', 'aufschnitt', 'margarine', 'pudding', 'skyr', 'hafermilch', 'tofu', 'teig', 'hummus'] },
    { key: 'fleisch', label: 'Fleisch & Fisch', ings: ['speck', 'hackfleisch', 'haehnchen', 'rind', 'schwein', 'lachs', 'fisch'], words: ['fleisch', 'hack', 'steak', 'schnitzel', 'hahnchen', 'haehnchen', 'pute', 'filet', 'fisch', 'lachs', 'garnelen', 'bratwurst', 'gulasch', 'speck'] },
    { key: 'tk', label: 'Tiefkühl', ings: [], words: ['tk', 'tiefkuhl', 'tiefkuehl', 'pizza', 'eis', 'pommes', 'fischstabchen', 'fischstaebchen', 'gefroren'] },
    { key: 'vorrat', label: 'Nudeln, Reis & Konserven', ings: ['passata', 'thunfisch', 'erbsen', 'mais', 'bohnen', 'kichererbsen', 'linsen', 'kokosmilch', 'nudeln', 'reis'],
      words: ['nudel', 'spaghetti', 'penne', 'reis', 'dose', 'konserve', 'passata', 'tomatenmark', 'linsen', 'bohnen', 'mais', 'brühe', 'bruhe', 'bruehe', 'soße', 'sosse', 'sauce', 'ketchup', 'senf', 'mayo', 'ol', 'oel', 'essig', 'gewurz', 'gewuerz', 'salz', 'pfeffer', 'couscous', 'bulgur', 'quinoa'] },
    { key: 'fruehstueck', label: 'Frühstück & Backen', ings: ['mehl', 'haferflocken'], words: ['mehl', 'zucker', 'hefe', 'backpulver', 'haferflocken', 'musli', 'muesli', 'cornflakes', 'honig', 'marmelade', 'konfituere', 'nutella', 'kaffee', 'tee', 'kakao'] },
    { key: 'suess', label: 'Süßes & Snacks', ings: ['schokolade'], words: ['schoko', 'kekse', 'chips', 'gummibar', 'gummibaer', 'bonbon', 'nusse', 'nuesse', 'snack', 'riegel', 'salzstangen', 'popcorn'] },
    { key: 'getraenke', label: 'Getränke', ings: ['getraenk'], words: ['wasser', 'sprudel', 'saft', 'cola', 'limo', 'bier', 'wein', 'sekt', 'schorle', 'getrank', 'getraenk', 'eistee', 'energy'] },
    { key: 'drogerie', label: 'Drogerie', ings: [], words: ['zahnpasta', 'zahnburste', 'zahnbuerste', 'shampoo', 'duschgel', 'seife', 'deo', 'creme', 'rasier', 'windel', 'taschentuch', 'tampon', 'binden', 'pflaster', 'sonnencreme', 'wattepad', 'klopapier', 'toilettenpapier'] },
    { key: 'haushalt', label: 'Haushalt', ings: [], words: ['spulmittel', 'spuelmittel', 'spultabs', 'spueltabs', 'waschmittel', 'weichspuler', 'muellbeutel', 'mullbeutel', 'kuchenrolle', 'kuechenrolle', 'alufolie', 'frischhaltefolie', 'schwamm', 'reiniger', 'batterie', 'gluhbirne', 'kerze', 'backpapier', 'tierfutter', 'katzenfutter', 'hundefutter'] },
    { key: 'sonst', label: 'Sonstiges', ings: [], words: [] },
  ];
  /** Gang eines Eintrags: erst über die erkannte Zutat, sonst über Wortanfänge im Namen. */
  function aisleOf(name, ingredient) {
    const byWord = aisleByWords(name);
    // Drogerie/Haushalt schlägt die Zutaten-Erkennung („Zahnpasta“ ist keine Pasta)
    if (byWord === 'drogerie' || byWord === 'haushalt') return byWord;
    if (ingredient) { const a = AISLES.find((x) => x.ings.includes(ingredient)); if (a) return a.key; }
    return byWord;
  }
  function aisleByWords(name) {
    const words = norm(name).split(/[^a-z0-9]+/).filter(Boolean);
    let best = null, bestLen = 0;
    for (const a of AISLES) {
      for (const w of a.words.concat(a.ings, a.ings.map((i) => i.replace(/e?n$/, '')).filter((i) => i.length >= 4))) {
        // ganzes Wort oder Wortanfang/-ende ab 4 Buchstaben (z. B. „Vollkornbrot“, „Hafermilch“)
        const hit = words.some((x) => x === w || (w.length >= 4 && (x.startsWith(w) || x.endsWith(w))));
        if (hit && w.length > bestLen) { best = a.key; bestLen = w.length; }
      }
    }
    return best || 'sonst';
  }
  function groupByAisle(items) {
    const groups = AISLES.map((a) => ({ key: a.key, label: a.label, items: [] }));
    for (const it of items) groups.find((g) => g.key === aisleOf(it.name, it.ingredient)).items.push(it);
    return groups.filter((g) => g.items.length);
  }

  // ---------- Ausgaben-Verlauf ----------

  const ymShift = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
  /** Summen der letzten n Monate bis einschließlich `endYm` (Einnahmen ausgenommen). */
  function monthlyTotals(expenses, endYm, n = 6, isIncome = (e) => e.category === 'einnahme') {
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const ym = ymShift(endYm, -i);
      const total = r2(expenses.filter((e) => (e.date || '').startsWith(ym) && !isIncome(e)).reduce((a, e) => a + (Number(e.amount) || 0), 0));
      out.push({ ym, total });
    }
    const withData = out.filter((x) => x.total > 0);
    const avg = withData.length ? r2(withData.reduce((a, x) => a + x.total, 0) / withData.length) : 0;
    return { months: out, avg };
  }

  // ---------- Gewohnheits-Kalender (12 Wochen) ----------

  /** Wochen-Spalten (Mo–So) der letzten `weeks` Wochen; level 0 = nichts, 1 = angefangen, 2 = geschafft, -1 = Zukunft. */
  function habitHeatmap(log, habit, today, weeks = 12) {
    const t = parse(today);
    const monday = addDays(today, -((t.getDay() + 6) % 7));
    const start = addDays(monday, -7 * (weeks - 1));
    const cols = [];
    let met = 0, active = 0;
    for (let w = 0; w < weeks; w++) {
      const col = [];
      for (let d = 0; d < 7; d++) {
        const day = addDays(start, w * 7 + d);
        if (day > today) { col.push({ iso: day, count: 0, level: -1 }); continue; }
        const c = (log[day] && log[day][habit.id]) || 0;
        const level = c >= (habit.target || 1) ? 2 : c > 0 ? 1 : 0;
        if (level === 2) met++;
        if (!habit.created || day >= habit.created) active++;
        col.push({ iso: day, count: c, level });
      }
      cols.push(col);
    }
    return { cols, met, active, rate: active ? Math.round((met / active) * 100) : 0 };
  }
  /** Bester Wochentag (meiste erfüllte Tage) */
  function bestWeekday(heat) {
    const n = [0, 0, 0, 0, 0, 0, 0];
    heat.cols.forEach((col) => col.forEach((c, i) => { if (c.level === 2) n[i]++; }));
    const max = Math.max(...n);
    return max ? ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'][n.indexOf(max)] : null;
  }

  // ---------- Kalenderdatei mit Erinnerungen ----------

  const icsText = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  /**
   * items: { uid, title, date, time?, rrule?, alarm? (Minuten vorher; bei ganztägig ab Tagesbeginn), note? }
   */
  function buildICS(items, stamp = '20260101T000000Z') {
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Alltagsheld//Erinnerungen//DE', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Alltagsheld'];
    for (const it of items) {
      const d = it.date.replace(/-/g, '');
      lines.push('BEGIN:VEVENT', `UID:${it.uid}@alltagsheld`, `DTSTAMP:${stamp}`);
      if (it.time) {
        const [h, m] = it.time.split(':');
        lines.push(`DTSTART:${d}T${pad(h)}${pad(m)}00`, `DURATION:PT15M`);
      } else lines.push(`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${addDays(it.date, 1).replace(/-/g, '')}`, 'TRANSP:TRANSPARENT');
      lines.push(`SUMMARY:${icsText(it.title)}`);
      if (it.note) lines.push(`DESCRIPTION:${icsText(it.note)}`);
      if (it.rrule) lines.push(`RRULE:${it.rrule}`);
      if (it.alarm != null) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(it.title)}`, `TRIGGER:${it.alarm >= 0 ? '-' : ''}PT${Math.abs(it.alarm)}M`, 'END:VALARM');
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    // Zeilen über 75 Zeichen falten (RFC 5545)
    return lines.map((l) => (l.length <= 75 ? l : l.match(/.{1,74}/g).join('\r\n '))).join('\r\n');
  }
  const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  /** Medikamente → tägliche (oder wochentags-)Termine */
  function medItems(meds, today) {
    const out = [];
    for (const m of meds) {
      for (const t of m.times || []) {
        out.push({ uid: `med-${m.id}-${t.replace(':', '')}`, title: `${m.name} einnehmen${m.amount && m.amount !== 1 ? ` (${m.amount})` : ''}`, date: today, time: t, alarm: 0,
          rrule: m.days && m.days.length && m.days.length < 7 ? `FREQ=WEEKLY;BYDAY=${m.days.map((d) => BYDAY[d]).join(',')}` : 'FREQ=DAILY' });
      }
    }
    return out;
  }

  // ---------- Geburtstage ----------

  /** Nächster Geburtstag (heute zählt), Alter, Tage bis dahin */
  function nextBirthday(birth, today) {
    const [by, bm, bd] = birth.split('-').map(Number);
    let y = Number(today.slice(0, 4));
    const mk = (yy) => { const last = new Date(yy, bm, 0).getDate(); return `${yy}-${pad(bm)}-${pad(Math.min(bd, last))}`; };
    let date = mk(y);
    if (date < today) date = mk(++y);
    const age = by > 1900 && by <= y ? y - by : null;
    return { date, days: daysBetween(today, date), age };
  }
  /** Geburtstags-Termine (Datum = Tag im Jahr, Geburtsjahr optional in birthYear) */
  function upcomingBirthdays(events, today) {
    return events.filter((e) => e.type === 'geburtstag' && e.date)
      .map((e) => ({ e, ...nextBirthday(`${e.birthYear || '0000'}${e.date.slice(4)}`, today) })).sort((a, b) => a.days - b.days);
  }
  /** „runder“ Geburtstag? */
  const isRound = (age) => age != null && age > 0 && (age % 10 === 0 || age === 18 || age === 25);

  // ---------- Tagebuch ----------

  const JOURNAL_PROMPTS = [
    'Was war heute der schönste Moment?',
    'Worüber hast du heute gelacht?',
    'Was hast du heute gelernt?',
    'Wem bist du heute dankbar – und warum?',
    'Was hat dich heute Kraft gekostet, was hat dir Kraft gegeben?',
    'Was möchtest du morgen anders machen?',
    'Worauf bist du heute stolz?',
    'Was hat dich heute überrascht?',
    'Welche kleine Sache hat deinen Tag besser gemacht?',
    'Was beschäftigt dich gerade am meisten?',
  ];
  const promptOfDay = (date) => JOURNAL_PROMPTS[Math.floor(parse(date).getTime() / DAY) % JOURNAL_PROMPTS.length];
  /** Rückblick: Einträge vor einer Woche, einem Monat, einem Jahr */
  function flashbacks(journal, today) {
    const [y, m, d] = today.split('-').map(Number);
    const cands = [
      ['Vor einem Jahr', `${y - 1}-${pad(m)}-${pad(d)}`],
      ['Vor einem Monat', iso(new Date(y, m - 2, Math.min(d, new Date(y, m - 1, 0).getDate())))],
      ['Vor einer Woche', addDays(today, -7)],
    ];
    return cands.filter(([, date]) => journal[date] && (journal[date].text || (journal[date].grateful || []).length)).map(([label, date]) => ({ label, date, entry: journal[date] }));
  }
  /** Schreib-Serie: Tage in Folge mit Eintrag (heute oder gestern beginnend) */
  function journalStreak(journal, today) {
    let d = journal[today] ? today : addDays(today, -1), n = 0;
    while (journal[d] && (journal[d].text || (journal[d].grateful || []).some(Boolean))) { n++; d = addDays(d, -1); }
    return n;
  }

  return {
    addDays, daysBetween,
    AISLES, aisleOf, groupByAisle,
    ymShift, monthlyTotals,
    habitHeatmap, bestWeekday,
    buildICS, medItems,
    nextBirthday, upcomingBirthdays, isRound,
    JOURNAL_PROMPTS, promptOfDay, flashbacks, journalStreak,
  };
});
