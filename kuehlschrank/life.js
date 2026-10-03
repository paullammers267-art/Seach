/* Aufgaben, Gewohnheiten, Gesundheit (Gewicht, Stimmung), Wetter – reine Logik.
   Läuft im Browser (window.FridgeLife) und in Node (Tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FridgeLife = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DAY = 86400000;
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const norm = (s) => String(s || '').toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  // ---------- Aufgaben ----------

  const TASK_CATEGORIES = {
    privat: { label: 'Privat', emoji: '🙂' },
    haushalt: { label: 'Haushalt', emoji: '🧽' },
    arbeit: { label: 'Arbeit/Schule', emoji: '💼' },
    familie: { label: 'Familie', emoji: '👨‍👩‍👧' },
    finanzen: { label: 'Finanzen & Papierkram', emoji: '📄' },
    gesundheit: { label: 'Gesundheit', emoji: '❤️' },
  };
  const CATEGORY_WORDS = {
    haushalt: ['putzen', 'saugen', 'staubsaugen', 'wischen', 'waesche', 'wasche', 'buegeln', 'bugeln', 'muell', 'mull', 'bad', 'kueche', 'kuche', 'fenster', 'spuelmaschine', 'spulmaschine', 'aufraeumen', 'aufraumen', 'bett', 'kuehlschrank', 'kuhlschrank', 'pflanzen', 'giessen', 'abstauben', 'altglas', 'rasen'],
    arbeit: ['meeting', 'buero', 'buro', 'bericht', 'praesentation', 'prasentation', 'chef', 'kunde', 'projekt', 'hausaufgaben', 'lernen', 'klausur', 'pruefung', 'prufung', 'mail'],
    familie: ['mama', 'papa', 'oma', 'opa', 'kinder', 'kita', 'schule abholen', 'geschenk', 'anrufen'],
    finanzen: ['steuer', 'rechnung', 'ueberweisen', 'uberweisen', 'versicherung', 'kuendigen', 'kundigen', 'vertrag', 'formular', 'antrag', 'bank', 'bezahlen', 'finanzamt'],
    gesundheit: ['arzt', 'termin machen', 'apotheke', 'rezept abholen', 'medikament', 'impfung', 'zahnarzt', 'physio'],
  };
  const TASK_REPEATS = { none: 'einmalig', daily: 'täglich', weekdays: 'werktags', weekly: 'wöchentlich', biweekly: 'alle 2 Wochen', monthly: 'monatlich' };
  const WEEKDAYS = ['sonntag', 'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag'];

  function detectTaskCategory(text) {
    const t = ' ' + norm(text) + ' ';
    // nur am Wortanfang suchen (sonst steckt z. B. "rasen" in "Präsentation")
    for (const [k, words] of Object.entries(CATEGORY_WORDS)) if (words.some((w) => new RegExp('[^a-z]' + w).test(t))) return k;
    return 'privat';
  }

  /** nächster Wochentag (0=So) ab morgen bzw. ab heute (includeToday) */
  function nextWeekday(todayIso, wd, includeToday) {
    for (let i = includeToday ? 0 : 1; i <= 7; i++) {
      const d = addDays(todayIso, i);
      if (parse(d).getDay() === wd) return d;
    }
    return null;
  }

  /**
   * "Müll rausbringen jeden Dienstag", "Steuer bis 31.10. wichtig", "Mama anrufen morgen um 18 Uhr"
   * -> { title, due, time, priority, repeat, category }
   */
  function parseTaskText(text, today = new Date()) {
    const t0 = iso(dayStart(today));
    let s = ' ' + String(text || '').trim() + ' ';
    let due = null, time = '', priority = 0, repeat = 'none';
    const cut = (re) => { const m = s.match(re); if (m) s = s.replace(m[0], ' '); return m; };

    if (cut(/\s(?:!!|sehr wichtig|dringend)(?=\s)/i)) priority = 2;
    else if (cut(/\s(?:!|wichtig)(?=\s)/i)) priority = 1;
    let m;
    if ((m = cut(/\s(?:um\s+)?(\d{1,2})(?::(\d{2}))?\s*uhr(?=\s)/i)) || (m = cut(/\s(?:um\s+)?(\d{1,2}):(\d{2})(?=\s)/i))) {
      time = pad(Math.min(23, +m[1])) + ':' + pad(Math.min(59, +(m[2] || 0)));
    }
    if (cut(/\s(?:jeden tag|täglich|taeglich)(?=\s)/i)) { repeat = 'daily'; due = t0; }
    else if (cut(/\s(?:werktags|jeden werktag)(?=\s)/i)) { repeat = 'weekdays'; due = t0; }
    else if (cut(/\s(?:alle (?:2|zwei) wochen|zweiwöchentlich)(?=\s)/i)) { repeat = 'biweekly'; due = t0; }
    else if (cut(/\s(?:jede woche|wöchentlich|woechentlich)(?=\s)/i)) { repeat = 'weekly'; due = t0; }
    else if (cut(/\s(?:jeden monat|monatlich)(?=\s)/i)) { repeat = 'monthly'; due = t0; }
    if ((m = cut(/\s(?:jeden|immer)\s+(sonntag|montag|dienstag|mittwoch|donnerstag|freitag|samstag)s?(?=\s)/i))) {
      repeat = 'weekly'; due = nextWeekday(t0, WEEKDAYS.indexOf(m[1].toLowerCase()), true);
    }
    if (cut(/\s(?:bis\s+|am\s+)?übermorgen(?=\s)/i) || cut(/\s(?:bis\s+|am\s+)?uebermorgen(?=\s)/i)) due = addDays(t0, 2);
    else if (cut(/\s(?:bis\s+|am\s+)?morgen(?=\s)/i)) due = addDays(t0, 1);
    else if (cut(/\s(?:bis\s+)?heute(?:\s+abend)?(?=\s)/i)) due = t0;
    else if ((m = cut(/\s(?:bis|am)?\s*(?:nächsten|naechsten|kommenden)?\s*(sonntag|montag|dienstag|mittwoch|donnerstag|freitag|samstag)(?=\s)/i))) {
      due = nextWeekday(t0, WEEKDAYS.indexOf(m[1].toLowerCase()), false);
    } else if (cut(/\s(?:bis\s+)?(?:nächste|naechste|kommende) woche(?=\s)/i)) due = addDays(t0, 7);
    else if (cut(/\s(?:bis\s+)?(?:ende der woche|wochenende)(?=\s)/i)) due = nextWeekday(t0, 6, true);
    else if ((m = cut(/\s(?:bis|am)?\s*(\d{1,2})\.(\d{1,2})\.(\d{2,4})?(?=\s)/i))) {
      const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : dayStart(today).getFullYear();
      let d = new Date(y, +m[2] - 1, +m[1]);
      if (d.getMonth() === +m[2] - 1) {
        if (!m[3] && iso(d) < t0) d = new Date(y + 1, +m[2] - 1, +m[1]);
        due = iso(d);
      }
    } else if ((m = cut(/\sin\s+(\d+)\s+tag(?:en)?(?=\s)/i))) due = addDays(t0, +m[1]);
    if (time && !due) due = t0;
    const title = s.replace(/\s+(bis|am|um)\s*$/i, ' ').replace(/\s+/g, ' ').trim();
    return { title: title ? title.charAt(0).toUpperCase() + title.slice(1) : '', due, time, priority, repeat, category: detectTaskCategory(title) };
  }

  /** Nächstes Fälligkeitsdatum einer wiederkehrenden Aufgabe (nie in der Vergangenheit). */
  function nextDue(due, repeat, today = new Date()) {
    const t0 = iso(dayStart(today));
    let d = due || t0;
    const step = (x) => {
      if (repeat === 'daily') return addDays(x, 1);
      if (repeat === 'weekly') return addDays(x, 7);
      if (repeat === 'biweekly') return addDays(x, 14);
      if (repeat === 'weekdays') { let n = addDays(x, 1); while ([0, 6].includes(parse(n).getDay())) n = addDays(n, 1); return n; }
      if (repeat === 'monthly') {
        const a = parse(due || t0), b = parse(x);
        const target = new Date(b.getFullYear(), b.getMonth() + 1, 1);
        const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
        target.setDate(Math.min(a.getDate(), last));
        return iso(target);
      }
      return null;
    };
    d = step(d);
    while (d && d <= t0) d = step(d);
    return d;
  }

  /** Abhaken: Einmalige werden erledigt, wiederkehrende rücken zum nächsten Termin. */
  function completeTask(task, today = new Date()) {
    const t0 = iso(dayStart(today));
    if (task.repeat && task.repeat !== 'none') {
      return { ...task, due: nextDue(task.due, task.repeat, today), lastDone: t0, doneCount: (task.doneCount || 0) + 1 };
    }
    return { ...task, done: true, doneAt: t0 };
  }

  /** Gruppen für die Liste. */
  function taskBuckets(tasks, today = new Date()) {
    const t0 = iso(dayStart(today));
    const b = { overdue: [], today: [], tomorrow: [], week: [], later: [], someday: [], done: [] };
    for (const t of tasks) {
      if (t.done) b.done.push(t);
      else if (!t.due) b.someday.push(t);
      else if (t.due < t0) b.overdue.push(t);
      else if (t.due === t0) b.today.push(t);
      else if (t.due === addDays(t0, 1)) b.tomorrow.push(t);
      else if (t.due <= addDays(t0, 7)) b.week.push(t);
      else b.later.push(t);
    }
    const cmp = (a, c) => (c.priority || 0) - (a.priority || 0) || String(a.due || '').localeCompare(String(c.due || '')) || String(a.time || '99').localeCompare(String(c.time || '99')) || a.title.localeCompare(c.title, 'de');
    Object.values(b).forEach((l) => l.sort(cmp));
    b.done.sort((a, c) => String(c.doneAt).localeCompare(String(a.doneAt)));
    return b;
  }

  const CLEANING_PLAN = [
    { title: 'Staubsaugen', repeat: 'weekly', wd: 6 },
    { title: 'Bad putzen', repeat: 'weekly', wd: 6 },
    { title: 'Bettwäsche wechseln', repeat: 'biweekly', wd: 0 },
    { title: 'Küche wischen & Arbeitsflächen', repeat: 'weekly', wd: 3 },
    { title: 'Müll & Altpapier rausbringen', repeat: 'weekly', wd: 1 },
    { title: 'Wäsche waschen', repeat: 'weekly', wd: 4 },
    { title: 'Kühlschrank auswischen & Reste prüfen', repeat: 'monthly', wd: null },
    { title: 'Pflanzen gießen', repeat: 'weekly', wd: 2 },
    { title: 'Staub wischen', repeat: 'biweekly', wd: 6 },
    { title: 'Handtücher wechseln', repeat: 'weekly', wd: 0 },
  ];

  /** Putzplan-Vorlage als Aufgaben (Datum = nächster passender Wochentag). */
  function cleaningTasks(today = new Date()) {
    const t0 = iso(dayStart(today));
    return CLEANING_PLAN.map((c) => ({
      title: c.title, repeat: c.repeat, priority: 0, category: 'haushalt', time: '',
      due: c.wd == null ? addDays(t0, 7) : nextWeekday(t0, c.wd, true),
    }));
  }

  // ---------- Gewohnheiten ----------

  const HABIT_PRESETS = [
    { name: 'Wasser trinken', emoji: '💧', target: 8, unit: 'Gläser' },
    { name: 'Obst & Gemüse', emoji: '🥦', target: 5, unit: 'Portionen' },
    { name: '30 Min Bewegung', emoji: '🚶', target: 1, unit: '' },
    { name: 'Vitamine/Medikamente', emoji: '💊', target: 1, unit: '' },
    { name: 'Lesen', emoji: '📖', target: 1, unit: '' },
    { name: 'Meditation', emoji: '🧘', target: 1, unit: '' },
    { name: 'Kein Zucker', emoji: '🍬', target: 1, unit: '' },
    { name: 'Zahnseide', emoji: '🦷', target: 1, unit: '' },
    { name: 'Vor 23 Uhr schlafen', emoji: '😴', target: 1, unit: '' },
    { name: 'Dankbarkeit notieren', emoji: '🙏', target: 1, unit: '' },
  ];

  const count = (log, d, id) => (log[d] && log[d][id]) || 0;

  /** Tage in Folge mit erreichtem Ziel (heute zählt, wenn erreicht – sonst ab gestern). */
  function habitStreak(log, habit, today = new Date()) {
    let d = iso(dayStart(today));
    if (count(log, d, habit.id) < habit.target) d = addDays(d, -1);
    let n = 0;
    while (count(log, d, habit.id) >= habit.target && n < 3650) { n++; d = addDays(d, -1); }
    return n;
  }

  /** Die letzten 7 Tage (ältester zuerst): { iso, count, met } */
  function habitWeek(log, habit, today = new Date()) {
    const t0 = iso(dayStart(today));
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(t0, i - 6);
      const c = count(log, d, habit.id);
      return { iso: d, count: c, met: c >= habit.target };
    });
  }

  /** Quote der letzten n Tage (ab Anlage der Gewohnheit). */
  function habitRate(log, habit, days = 30, today = new Date()) {
    const t0 = iso(dayStart(today));
    let met = 0, total = 0;
    for (let i = 0; i < days; i++) {
      const d = addDays(t0, -i);
      if (habit.created && d < habit.created) break;
      total++;
      if (count(log, d, habit.id) >= habit.target) met++;
    }
    return total ? Math.round((met / total) * 100) : 0;
  }

  // ---------- Gesundheit ----------

  function bmi(kg, cm) {
    if (!kg || !cm) return null;
    return Math.round((kg / ((cm / 100) ** 2)) * 10) / 10;
  }
  function bmiLabel(v) {
    if (v == null) return '';
    if (v < 18.5) return 'Untergewicht';
    if (v < 25) return 'Normalgewicht';
    if (v < 30) return 'Übergewicht';
    return 'Adipositas';
  }

  /** Gewichtsverlauf: aktueller Wert, Veränderung über 7/30 Tage, Min/Max, Werte sortiert. */
  function weightStats(weights, today = new Date()) {
    const list = [...weights].sort((a, b) => a.date.localeCompare(b.date));
    if (!list.length) return null;
    const t0 = iso(dayStart(today));
    const last = list[list.length - 1];
    const before = (days) => {
      const ref = addDays(t0, -days);
      const older = list.filter((w) => w.date <= ref);
      return older.length ? older[older.length - 1] : list[0] !== last ? list[0] : null;
    };
    const diff = (w) => (w ? Math.round((last.kg - w.kg) * 10) / 10 : null);
    const kgs = list.map((w) => w.kg);
    return { last, list, change7: diff(before(7)), change30: diff(before(30)), min: Math.min(...kgs), max: Math.max(...kgs) };
  }

  /** SVG-Pfad für ein kleines Liniendiagramm. */
  function sparkPath(values, w, h, pad = 4, lo, hi) {
    if (values.length < 2) return '';
    const min = lo ?? Math.min(...values), max = hi ?? Math.max(...values);
    const span = max - min || 1;
    return values.map((v, i) => {
      const x = pad + (i / (values.length - 1)) * (w - 2 * pad);
      const y = pad + (1 - (v - min) / span) * (h - 2 * pad);
      return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    }).join(' ');
  }

  const MOODS = [
    { v: 1, emoji: '😞', label: 'schlecht' },
    { v: 2, emoji: '😕', label: 'mäßig' },
    { v: 3, emoji: '😐', label: 'okay' },
    { v: 4, emoji: '🙂', label: 'gut' },
    { v: 5, emoji: '😄', label: 'super' },
  ];

  /** Durchschnitt (Stimmung, Schlaf) der letzten n Tage. */
  function moodStats(moods, days = 7, today = new Date()) {
    const t0 = iso(dayStart(today));
    const from = addDays(t0, -(days - 1));
    const list = Object.entries(moods).filter(([d]) => d >= from && d <= t0).map(([, m]) => m);
    const avg = (k) => { const v = list.map((m) => m[k]).filter((x) => x != null && x !== ''); return v.length ? Math.round((v.reduce((a, b) => a + Number(b), 0) / v.length) * 10) / 10 : null; };
    return { days: list.length, mood: avg('mood'), sleep: avg('sleep') };
  }

  // ---------- Wetter (Open-Meteo, WMO-Codes) ----------

  function weatherInfo(code) {
    const c = Number(code);
    if (c === 0) return { emoji: '☀️', text: 'Sonnig' };
    if (c === 1) return { emoji: '🌤️', text: 'Überwiegend sonnig' };
    if (c === 2) return { emoji: '⛅', text: 'Teilweise bewölkt' };
    if (c === 3) return { emoji: '☁️', text: 'Bedeckt' };
    if (c === 45 || c === 48) return { emoji: '🌫️', text: 'Nebel' };
    if (c >= 51 && c <= 57) return { emoji: '🌦️', text: 'Nieselregen' };
    if (c >= 61 && c <= 67) return { emoji: '🌧️', text: c >= 65 ? 'Starker Regen' : 'Regen' };
    if (c >= 71 && c <= 77) return { emoji: '🌨️', text: 'Schnee' };
    if (c >= 80 && c <= 82) return { emoji: '🌦️', text: 'Regenschauer' };
    if (c === 85 || c === 86) return { emoji: '🌨️', text: 'Schneeschauer' };
    if (c >= 95) return { emoji: '⛈️', text: 'Gewitter' };
    return { emoji: '🌡️', text: 'Wetter' };
  }

  /** Alltagstipps aus der Tagesvorhersage. */
  function weatherTips(day) {
    const tips = [];
    if (day.rain >= 50 || [61, 63, 65, 80, 81, 82, 95, 96, 99].includes(Number(day.code))) tips.push('☂️ Regenschirm mitnehmen');
    else if (day.rain >= 30) tips.push('🌂 Vielleicht Schirm einpacken');
    if (day.min <= 0) tips.push('🧊 Frost – Scheiben kratzen, warm anziehen');
    else if (day.min <= 5) tips.push('🧣 Kalt am Morgen – Jacke nicht vergessen');
    if (day.max >= 28) tips.push('🥵 Heiß – viel trinken, Sonnencreme');
    else if (day.max >= 24 && day.rain < 30) tips.push('😎 Schönes Wetter – Zeit für einen Spaziergang');
    if (day.rain < 20 && day.max >= 12 && day.max < 28 && day.code <= 3) tips.push('👕 Gutes Wetter zum Wäschetrocknen draußen');
    return tips;
  }

  return {
    TASK_CATEGORIES, TASK_REPEATS, detectTaskCategory, parseTaskText, nextDue, completeTask, taskBuckets, CLEANING_PLAN, cleaningTasks,
    HABIT_PRESETS, habitStreak, habitWeek, habitRate,
    bmi, bmiLabel, weightStats, sparkPath, MOODS, moodStats,
    weatherInfo, weatherTips, addDays,
  };
});
