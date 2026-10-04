/* Pflanzen, Verliehen & Geliehen, Countdowns, Fokus-Timer, Notfallpass, Gedanke des Tages, Farbthemen.
   Läuft im Browser (window.FridgePlus) und in Node (Tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FridgePlus = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DAY = 86400000;
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / DAY);

  /** „heute“, „morgen“, „in 5 Tagen“, „vor 2 Tagen“ */
  function relDays(n) {
    if (n === 0) return 'heute';
    if (n === 1) return 'morgen';
    if (n === -1) return 'gestern';
    return n > 0 ? `in ${n} Tagen` : `vor ${-n} Tagen`;
  }

  // ---------- 🪴 Pflanzen ----------

  const PLANT_PRESETS = [
    { name: 'Monstera', emoji: '🪴', every: 7 },
    { name: 'Orchidee', emoji: '🌸', every: 7 },
    { name: 'Kaktus', emoji: '🌵', every: 21 },
    { name: 'Sukkulente', emoji: '🪴', every: 14 },
    { name: 'Ficus', emoji: '🌳', every: 7 },
    { name: 'Grünlilie', emoji: '🌱', every: 5 },
    { name: 'Bogenhanf', emoji: '🌿', every: 14 },
    { name: 'Efeutute', emoji: '🍃', every: 7 },
    { name: 'Basilikum', emoji: '🌿', every: 2 },
    { name: 'Balkonblumen', emoji: '🌼', every: 1 },
    { name: 'Tomaten', emoji: '🍅', every: 2 },
    { name: 'Zitronenbaum', emoji: '🍋', every: 4 },
  ];

  /** Wann muss die Pflanze wieder gegossen werden? */
  function plantStatus(p, today) {
    const last = p.watered || p.added || today;
    const next = addDays(last, Math.max(1, p.every || 7));
    const left = daysBetween(today, next);
    return { next, left, state: left < 0 ? 'overdue' : left === 0 ? 'today' : 'ok', last };
  }
  function waterPlant(p, today) {
    p.watered = today;
    p.log = [today, ...(p.log || []).filter((d) => d !== today)].slice(0, 30);
    return p;
  }
  /** Pflanzen, die heute oder früher dran sind – überfällige zuerst */
  function plantsDue(plants, today) {
    return plants.map((p) => ({ p, s: plantStatus(p, today) })).filter((x) => x.s.left <= 0).sort((a, b) => a.s.left - b.s.left);
  }

  // ---------- 🤝 Verliehen & Geliehen ----------

  function loanStatus(l, today) {
    if (l.returned) return { state: 'done', left: null };
    if (!l.due) return { state: 'open', left: null, since: daysBetween(l.date, today) };
    const left = daysBetween(today, l.due);
    return { state: left < 0 ? 'overdue' : left <= 2 ? 'soon' : 'open', left, since: daysBetween(l.date, today) };
  }

  // ---------- ⏳ Countdowns ----------

  /** Tage bis zum Ereignis; bei „jährlich“ immer das nächste Mal. */
  function countdownInfo(c, today) {
    let date = c.date;
    if (c.yearly) {
      const [, m, d] = c.date.split('-');
      const y = Number(today.slice(0, 4));
      date = `${y}-${m}-${d}`;
      if (date < today) date = `${y + 1}-${m}-${d}`;
    }
    const days = daysBetween(today, date);
    let text;
    if (days === 0) text = 'heute! 🎉';
    else if (days === 1) text = 'morgen';
    else if (days < 0) text = `vor ${-days} Tagen`;
    else if (days < 14) text = `noch ${days} Tage`;
    else if (days < 70) text = `noch ${days} Tage (${Math.round(days / 7)} Wochen)`;
    else text = `noch ${days} Tage (≈ ${Math.round(days / 30.4)} Monate)`;
    const total = c.created ? daysBetween(c.created, date) : 0;
    const progress = total > 0 ? Math.min(100, Math.max(0, Math.round(((total - days) / total) * 100))) : null;
    return { date, days, text, past: days < 0, progress };
  }
  function upcomingCountdowns(list, today) {
    return list.map((c) => ({ c, i: countdownInfo(c, today) })).filter((x) => !x.i.past).sort((a, b) => a.i.days - b.i.days);
  }

  // ---------- 🎯 Fokus-Timer (Pomodoro) ----------

  const FOCUS_PRESETS = {
    klassisch: { label: '25 Min', focus: 25, short: 5, long: 15 },
    kurz: { label: '15 Min', focus: 15, short: 3, long: 10 },
    lang: { label: '50 Min', focus: 50, short: 10, long: 20 },
  };
  /** Nächste Phase: nach jeder 4. Fokuseinheit eine lange Pause. */
  function nextFocusPhase(phase, done, longEvery = 4) {
    if (phase === 'focus') {
      const n = done + 1;
      return { phase: n % longEvery === 0 ? 'long' : 'short', done: n };
    }
    return { phase: 'focus', done };
  }
  function focusMinutesOn(sessions, date) {
    return sessions.filter((s) => s.date === date).reduce((a, s) => a + s.minutes, 0);
  }
  const fmtClock = (sec) => `${pad(Math.floor(Math.max(0, sec) / 60))}:${pad(Math.max(0, sec) % 60)}`;

  // ---------- 🆘 Notfallpass ----------

  const BLOOD_TYPES = ['', '0+', '0−', 'A+', 'A−', 'B+', 'B−', 'AB+', 'AB−'];
  function ageFrom(birth, today) {
    if (!birth) return null;
    const [y, m, d] = birth.split('-').map(Number);
    const [ty, tm, td] = today.split('-').map(Number);
    return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
  }
  /** Telefonnummer für tel:-Links säubern */
  const telHref = (s) => 'tel:' + String(s || '').replace(/[^\d+]/g, '');

  // ---------- 💡 Gedanke des Tages ----------

  const THOUGHTS = [
    'Der Weg ist das Ziel. – Konfuzius',
    'Auch eine Reise von tausend Meilen beginnt mit einem Schritt. – Laozi',
    'Es ist nicht wenig Zeit, die wir haben, sondern es ist viel, die wir nicht nutzen. – Seneca',
    'Was du heute kannst besorgen, das verschiebe nicht auf morgen.',
    'Man muss das Unmögliche versuchen, um das Mögliche zu erreichen. – Hermann Hesse',
    'Glück ist das Einzige, das sich verdoppelt, wenn man es teilt. – Albert Schweitzer',
    'Wer immer tut, was er schon kann, bleibt immer das, was er schon ist. – Henry Ford',
    'Steter Tropfen höhlt den Stein.',
    'In der Ruhe liegt die Kraft.',
    'Es ist nicht genug zu wissen, man muss auch anwenden. – Goethe',
    'Ordnung ist das halbe Leben.',
    'Kleine Schritte sind besser als keine Schritte.',
    'Heute ist ein guter Tag, um ein Glas Wasser mehr zu trinken. 💧',
    'Fünf Minuten Aufräumen am Abend sparen dir morgen eine halbe Stunde.',
    'Geh heute ein paar Schritte an der frischen Luft – dein Kopf dankt es dir. 🌳',
    'Schreib drei Dinge auf, für die du heute dankbar bist. 🙏',
    'Ruf heute jemanden an, von dem du lange nichts gehört hast. 📞',
    'Plane heute eine Mahlzeit mit dem, was weg muss – gut für Geldbeutel und Umwelt. 🥕',
    'Wer lächelt, statt zu toben, ist immer der Stärkere. – japanisches Sprichwort',
    'Die beste Zeit, einen Baum zu pflanzen, war vor zwanzig Jahren. Die zweitbeste ist jetzt.',
    'Nicht weil es schwer ist, wagen wir es nicht, sondern weil wir es nicht wagen, ist es schwer. – Seneca',
    'Morgenstund hat Gold im Mund.',
    'Erledige die unangenehmste Aufgabe zuerst – der Rest des Tages wird leichter. 🐸',
    'Pausen sind kein Luxus, sondern Teil der Arbeit. ☕',
    'Handy weg beim Essen – schmeckt besser. 🍽️',
    'Ein aufgeräumter Schreibtisch ist ein aufgeräumter Kopf.',
    'Das Leben ist wie Fahrradfahren. Um die Balance zu halten, musst du in Bewegung bleiben. – Albert Einstein',
    'Lieber eine Kerze anzünden, als über die Dunkelheit zu klagen. – Konfuzius',
    'Heute schon gestreckt? Zwei Minuten Dehnen wirken Wunder. 🧘',
    'Gut Ding will Weile haben.',
    'Aller Anfang ist schwer.',
    'Sei du selbst die Veränderung, die du dir wünschst für diese Welt. – Mahatma Gandhi',
    'Freundlichkeit kostet nichts – und macht zwei Menschen glücklich.',
    'Geh heute eine Stunde früher ins Bett. Dein Morgen-Ich wird es lieben. 😴',
    'Prüfe heute kurz deinen Vorrat – was bald abläuft, kommt zuerst auf den Teller.',
    'Wer kämpft, kann verlieren. Wer nicht kämpft, hat schon verloren. – Bertolt Brecht',
    'Zufriedenheit ist der Stein der Weisen. – Benjamin Franklin',
    'Ein Lächeln ist die kürzeste Verbindung zwischen zwei Menschen.',
    'Mach heute etwas, worauf du morgen stolz bist. ✨',
  ];
  function thoughtOfDay(date) {
    const n = Math.floor(parse(date).getTime() / DAY);
    return THOUGHTS[((n % THOUGHTS.length) + THOUGHTS.length) % THOUGHTS.length];
  }

  // ---------- 🎨 Design ----------

  const ACCENTS = {
    teal: { label: 'Türkis', light: '#0f766e', dark: '#2dd4bf' },
    blue: { label: 'Blau', light: '#1d4ed8', dark: '#60a5fa' },
    violet: { label: 'Violett', light: '#6d28d9', dark: '#a78bfa' },
    rose: { label: 'Beere', light: '#be185d', dark: '#f472b6' },
    orange: { label: 'Orange', light: '#c2410c', dark: '#fb923c' },
    green: { label: 'Grün', light: '#15803d', dark: '#4ade80' },
    graphite: { label: 'Grafit', light: '#374151', dark: '#cbd5e1' },
  };
  const TEXT_SIZES = { normal: { label: 'Normal', px: 16 }, gross: { label: 'Groß', px: 18 }, riesig: { label: 'Sehr groß', px: 20 } };

  return {
    addDays, daysBetween, relDays,
    PLANT_PRESETS, plantStatus, waterPlant, plantsDue,
    loanStatus,
    countdownInfo, upcomingCountdowns,
    FOCUS_PRESETS, nextFocusPhase, focusMinutesOn, fmtClock,
    BLOOD_TYPES, ageFrom, telHref,
    THOUGHTS, thoughtOfDay,
    ACCENTS, TEXT_SIZES,
  };
});
