/* Sport für zuhause: Übungen ohne Geräte, Workout-Generator, Trainings-Statistik.
   Läuft im Browser (window.FridgeSport) und in Node (Tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FridgeSport = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const GROUPS = {
    beine: '🦵 Beine & Po',
    bauch: '🧘 Bauch & Rücken',
    oben: '💪 Oberkörper',
    cardio: '🔥 Cardio',
  };

  // kind: warmup | main | stretch · level 1–3 · quiet = ohne Springen (wohnungstauglich)
  const EXERCISES = [
    // Aufwärmen
    { id: 'marschieren', name: 'Marschieren auf der Stelle', emoji: '🚶', kind: 'warmup', level: 1, quiet: true, cues: 'Knie locker anheben, Arme mitschwingen, ruhig atmen.' },
    { id: 'armkreisen', name: 'Armkreisen', emoji: '🙆', kind: 'warmup', level: 1, quiet: true, cues: 'Arme seitlich ausstrecken, kleine Kreise, nach der Hälfte Richtung wechseln.' },
    { id: 'hueftkreisen', name: 'Hüftkreisen', emoji: '🌀', kind: 'warmup', level: 1, quiet: true, cues: 'Hände in die Hüften, große Kreise, nach der Hälfte Richtung wechseln.' },
    { id: 'katzekuh', name: 'Katze-Kuh', emoji: '🐈', kind: 'warmup', level: 1, quiet: true, cues: 'Im Vierfüßlerstand Rücken abwechselnd rund machen und sanft durchhängen lassen.' },
    { id: 'ausfallrotation', name: 'Ausfallschritt mit Drehung', emoji: '🔄', kind: 'warmup', level: 1, quiet: true, cues: 'Langsamer Ausfallschritt, Oberkörper zum vorderen Bein drehen, Seiten wechseln.' },
    { id: 'schulterkreisen', name: 'Schulterkreisen', emoji: '🤷', kind: 'warmup', level: 1, quiet: true, cues: 'Schultern langsam nach hinten kreisen, dann nach vorne.' },

    // Beine & Po
    { id: 'kniebeugen', name: 'Kniebeugen', emoji: '🏋️', kind: 'main', group: 'beine', level: 1, quiet: true, cues: 'Füße hüftbreit, Po nach hinten wie auf einen Stuhl, Knie über den Zehen, Rücken gerade.' },
    { id: 'ausfallschritte', name: 'Ausfallschritte', emoji: '🦵', kind: 'main', group: 'beine', level: 1, quiet: true, cues: 'Großer Schritt nach vorn, hinteres Knie Richtung Boden, abwechselnd links und rechts.' },
    { id: 'glutebridge', name: 'Beckenheben (Glute Bridge)', emoji: '🌉', kind: 'main', group: 'beine', level: 1, quiet: true, cues: 'Rückenlage, Füße aufgestellt, Becken hoch bis zur Linie Knie–Schulter, Po anspannen.' },
    { id: 'wandsitzen', name: 'Wandsitzen', emoji: '🧱', kind: 'main', group: 'beine', level: 1, quiet: true, cues: 'Rücken an die Wand, runterrutschen bis Knie 90°, halten.' },
    { id: 'sumo', name: 'Sumo-Kniebeugen', emoji: '🤼', kind: 'main', group: 'beine', level: 1, quiet: true, cues: 'Breiter Stand, Fußspitzen nach außen, tief runter, Knie nach außen drücken.' },
    { id: 'stepups', name: 'Step-ups auf Stuhl', emoji: '🪑', kind: 'main', group: 'beine', level: 1, quiet: true, cues: 'Mit einem Fuß auf einen stabilen Stuhl steigen, oben strecken, Bein wechseln.' },
    { id: 'seitausfall', name: 'Seitliche Ausfallschritte', emoji: '↔️', kind: 'main', group: 'beine', level: 2, quiet: true, cues: 'Weit zur Seite treten, in ein Knie sinken, anderes Bein gestreckt, Seiten wechseln.' },
    { id: 'splitsquat', name: 'Bulgarische Kniebeuge (Stuhl)', emoji: '🪑', kind: 'main', group: 'beine', level: 2, quiet: true, cues: 'Hinteren Fuß auf Stuhl legen, vorderes Bein beugen, nach der Hälfte wechseln.' },
    { id: 'einbeinbridge', name: 'Einbeiniges Beckenheben', emoji: '🌉', kind: 'main', group: 'beine', level: 2, quiet: true, cues: 'Wie Beckenheben, ein Bein gestreckt in der Luft, nach der Hälfte wechseln.' },
    { id: 'sprungkniebeugen', name: 'Sprung-Kniebeugen', emoji: '🚀', kind: 'main', group: 'beine', level: 3, quiet: false, cues: 'Kniebeuge, explosiv hochspringen, weich landen.' },

    // Bauch & Rücken
    { id: 'plank', name: 'Unterarmstütz (Plank)', emoji: '📏', kind: 'main', group: 'bauch', level: 1, quiet: true, cues: 'Unterarme unter den Schultern, Körper eine gerade Linie, Bauch und Po fest.' },
    { id: 'crunches', name: 'Crunches', emoji: '🔁', kind: 'main', group: 'bauch', level: 1, quiet: true, cues: 'Rückenlage, Füße auf, Schulterblätter vom Boden heben, Nacken locker.' },
    { id: 'superman', name: 'Superman', emoji: '🦸', kind: 'main', group: 'bauch', level: 1, quiet: true, cues: 'Bauchlage, Arme und Beine gleichzeitig leicht anheben, kurz halten, ablegen.' },
    { id: 'birddog', name: 'Bird Dog', emoji: '🐕', kind: 'main', group: 'bauch', level: 1, quiet: true, cues: 'Vierfüßlerstand, rechten Arm und linkes Bein strecken, wechseln. Rücken bleibt ruhig.' },
    { id: 'seitstuetz', name: 'Seitstütz', emoji: '📐', kind: 'main', group: 'bauch', level: 2, quiet: true, cues: 'Auf einem Unterarm, Hüfte hoch, gerade Linie. Nach der Hälfte Seite wechseln.' },
    { id: 'russiantwist', name: 'Russian Twist', emoji: '🌪️', kind: 'main', group: 'bauch', level: 2, quiet: true, cues: 'Sitzend, Oberkörper leicht zurück, Hände abwechselnd neben die Hüfte führen.' },
    { id: 'beinheben', name: 'Beinheben', emoji: '🦿', kind: 'main', group: 'bauch', level: 2, quiet: true, cues: 'Rückenlage, Hände unter den Po, gestreckte Beine langsam heben und senken.' },
    { id: 'fahrrad', name: 'Fahrrad-Crunch', emoji: '🚲', kind: 'main', group: 'bauch', level: 2, quiet: true, cues: 'Ellbogen zum gegenüberliegenden Knie, Beine wie beim Radfahren.' },
    { id: 'hollow', name: 'Hollow Hold', emoji: '🍌', kind: 'main', group: 'bauch', level: 3, quiet: true, cues: 'Rückenlage, Arme und Beine gestreckt knapp über dem Boden, unterer Rücken am Boden.' },

    // Oberkörper
    { id: 'wandliegestuetz', name: 'Wand-Liegestütze', emoji: '🧱', kind: 'main', group: 'oben', level: 1, quiet: true, cues: 'Hände an die Wand, Körper gerade, Brust zur Wand und zurück drücken.' },
    { id: 'knieliegestuetz', name: 'Knie-Liegestütze', emoji: '🙇', kind: 'main', group: 'oben', level: 1, quiet: true, cues: 'Auf den Knien, Hände schulterbreit, Brust Richtung Boden, Körper gerade.' },
    { id: 'liegestuetz', name: 'Liegestütze', emoji: '💪', kind: 'main', group: 'oben', level: 2, quiet: true, cues: 'Hände schulterbreit, Körper eine Linie, Brust knapp über den Boden.' },
    { id: 'dips', name: 'Dips am Stuhl', emoji: '🪑', kind: 'main', group: 'oben', level: 2, quiet: true, cues: 'Hände auf die Stuhlkante, Po vor dem Stuhl, Ellbogen nach hinten beugen und strecken.' },
    { id: 'schultertap', name: 'Plank mit Schulter-Antippen', emoji: '👋', kind: 'main', group: 'oben', level: 2, quiet: true, cues: 'Hoher Stütz, abwechselnd mit einer Hand die andere Schulter antippen, Hüfte ruhig.' },
    { id: 'rotationsliegestuetz', name: 'Liegestütze mit Drehung', emoji: '🔃', kind: 'main', group: 'oben', level: 2, quiet: true, cues: 'Liegestütz, oben zur Seite aufdrehen und Arm zur Decke strecken, abwechselnd.' },
    { id: 'pike', name: 'Pike-Liegestütze', emoji: '🔺', kind: 'main', group: 'oben', level: 3, quiet: true, cues: 'Po hoch (umgedrehtes V), Kopf Richtung Boden zwischen die Hände senken.' },
    { id: 'diamant', name: 'Diamant-Liegestütze', emoji: '💎', kind: 'main', group: 'oben', level: 3, quiet: true, cues: 'Hände eng zusammen (Daumen und Zeigefinger bilden eine Raute), langsam runter.' },

    // Cardio
    { id: 'steptouch', name: 'Step-Touch mit Armen', emoji: '💃', kind: 'main', group: 'cardio', level: 1, quiet: true, cues: 'Seitlich hin und her steppen, Arme über den Kopf mitnehmen. Zügiges Tempo.' },
    { id: 'schattenboxen', name: 'Schattenboxen', emoji: '🥊', kind: 'main', group: 'cardio', level: 1, quiet: true, cues: 'Leicht federnd stehen, schnelle Schläge in die Luft, Bauch fest.' },
    { id: 'hampelmann', name: 'Hampelmann', emoji: '⭐', kind: 'main', group: 'cardio', level: 1, quiet: false, cues: 'Springend Beine grätschen und Arme über den Kopf, zurück.' },
    { id: 'kniehebelauf', name: 'Kniehebelauf', emoji: '🏃', kind: 'main', group: 'cardio', level: 1, quiet: false, cues: 'Auf der Stelle laufen, Knie hoch bis Hüfthöhe.' },
    { id: 'mountainclimber', name: 'Mountain Climbers', emoji: '⛰️', kind: 'main', group: 'cardio', level: 2, quiet: true, cues: 'Hoher Stütz, Knie abwechselnd zügig zur Brust ziehen.' },
    { id: 'skater', name: 'Eisschnellläufer', emoji: '⛸️', kind: 'main', group: 'cardio', level: 2, quiet: false, cues: 'Seitlich von einem Bein aufs andere springen, weich landen.' },
    { id: 'burpees', name: 'Burpees', emoji: '🔥', kind: 'main', group: 'cardio', level: 3, quiet: false, cues: 'Hocke, in den Stütz springen, zurück, hochspringen.' },

    // Dehnen
    { id: 'oberschenkel', name: 'Oberschenkel dehnen', emoji: '🦩', kind: 'stretch', level: 1, quiet: true, cues: 'Ferse zum Po ziehen, Knie zeigt nach unten. Nach der Hälfte Bein wechseln.' },
    { id: 'hueftbeuger', name: 'Hüftbeuger dehnen', emoji: '🧎', kind: 'stretch', level: 1, quiet: true, cues: 'Tiefer Ausfallschritt, hinteres Knie am Boden, Hüfte nach vorne schieben. Seite wechseln.' },
    { id: 'kindhaltung', name: 'Kindhaltung', emoji: '🙏', kind: 'stretch', level: 1, quiet: true, cues: 'Auf die Fersen setzen, Oberkörper ablegen, Arme nach vorne, tief atmen.' },
    { id: 'brustdehnung', name: 'Brust dehnen an der Wand', emoji: '🚪', kind: 'stretch', level: 1, quiet: true, cues: 'Unterarm an Wand oder Türrahmen, Oberkörper sanft wegdrehen. Seite wechseln.' },
    { id: 'vorbeuge', name: 'Vorbeuge', emoji: '🙇', kind: 'stretch', level: 1, quiet: true, cues: 'Knie leicht gebeugt, Oberkörper locker nach unten hängen lassen.' },
    { id: 'liegedrehung', name: 'Liegende Drehung', emoji: '🔄', kind: 'stretch', level: 1, quiet: true, cues: 'Rückenlage, Knie zur Seite fallen lassen, Blick zur anderen Seite. Seite wechseln.' },
  ];

  const FOCUS = {
    ganz: { label: '🌟 Ganzkörper', groups: ['beine', 'bauch', 'oben', 'cardio'] },
    beine: { label: GROUPS.beine, groups: ['beine'] },
    bauch: { label: GROUPS.bauch, groups: ['bauch'] },
    oben: { label: GROUPS.oben, groups: ['oben'] },
    cardio: { label: GROUPS.cardio, groups: ['cardio', 'beine'] },
    dehnen: { label: '🧘 Dehnen & Entspannen', groups: [] },
  };

  const LEVELS = {
    1: { label: 'Einsteiger', work: 30, rest: 30 },
    2: { label: 'Fortgeschritten', work: 40, rest: 20 },
    3: { label: 'Profi', work: 45, rest: 15 },
  };

  const byId = (id) => EXERCISES.find((e) => e.id === id);

  /** Kleiner reproduzierbarer Zufallsgenerator (für Tests und "nochmal würfeln"). */
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rand) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /**
   * Erstellt ein Workout. opts: { minutes, focus, level, quiet, seed }
   * Ergebnis: { steps: [{ id, seconds, phase: warmup|work|rest|cooldown, round }], totalSeconds, ... }
   */
  function generateWorkout(opts = {}) {
    const minutes = opts.minutes || 20;
    const focus = FOCUS[opts.focus] ? opts.focus : 'ganz';
    const level = LEVELS[opts.level] ? Number(opts.level) : 1;
    const quiet = !!opts.quiet;
    const rand = rng(opts.seed == null ? Date.now() : opts.seed);
    const ok = (e) => e.level <= level && (!quiet || e.quiet);
    const steps = [];

    if (focus === 'dehnen') {
      const pool = shuffle(EXERCISES.filter((e) => (e.kind === 'stretch' || e.kind === 'warmup') && ok(e)), rand);
      const n = Math.max(4, Math.round((minutes * 60) / 45));
      for (let i = 0; i < n; i++) steps.push({ id: pool[i % pool.length].id, seconds: 45, phase: 'cooldown', round: 1 });
      return finish(steps, { minutes, focus, level, quiet });
    }

    const warmCount = minutes <= 10 ? 2 : 3;
    const coolCount = minutes <= 10 ? 2 : 3;
    shuffle(EXERCISES.filter((e) => e.kind === 'warmup'), rand).slice(0, warmCount)
      .forEach((e) => steps.push({ id: e.id, seconds: 30, phase: 'warmup', round: 0 }));

    const { work, rest } = LEVELS[level];
    const mainSeconds = minutes * 60 - (warmCount + coolCount) * 30;
    const slots = Math.max(3, Math.floor((mainSeconds + rest) / (work + rest)));
    // Abwechslung: reihum aus den Muskelgruppen ziehen
    const groups = FOCUS[focus].groups;
    const perGroup = groups.map((g) => shuffle(EXERCISES.filter((e) => e.kind === 'main' && e.group === g && ok(e)), rand));
    const circuit = [];
    const size = Math.min(6, perGroup.reduce((s, g) => s + g.length, 0));
    for (let i = 0; circuit.length < size; i++) {
      const g = perGroup[i % perGroup.length];
      const e = g.shift();
      if (e) circuit.push(e);
      if (perGroup.every((x) => !x.length)) break;
    }
    for (let i = 0; i < slots; i++) {
      const round = Math.floor(i / circuit.length) + 1;
      steps.push({ id: circuit[i % circuit.length].id, seconds: work, phase: 'work', round });
      if (i < slots - 1) steps.push({ id: 'pause', seconds: rest, phase: 'rest', round });
    }

    shuffle(EXERCISES.filter((e) => e.kind === 'stretch'), rand).slice(0, coolCount)
      .forEach((e) => steps.push({ id: e.id, seconds: 30, phase: 'cooldown', round: 0 }));
    return finish(steps, { minutes, focus, level, quiet, rounds: Math.ceil(slots / circuit.length), circuit: circuit.map((e) => e.id) });
  }

  /** Das klassische 7-Minuten-Workout (12 Übungen, 30 s Belastung, 10 s Pause). */
  function sevenMinute(quiet) {
    const ids = ['hampelmann', 'wandsitzen', 'liegestuetz', 'crunches', 'stepups', 'kniebeugen', 'dips', 'plank', 'kniehebelauf', 'ausfallschritte', 'rotationsliegestuetz', 'seitstuetz']
      .map((id) => (quiet && id === 'hampelmann' ? 'steptouch' : quiet && id === 'kniehebelauf' ? 'marschieren' : id));
    const steps = [];
    ids.forEach((id, i) => {
      steps.push({ id, seconds: 30, phase: 'work', round: 1 });
      if (i < ids.length - 1) steps.push({ id: 'pause', seconds: 10, phase: 'rest', round: 1 });
    });
    return finish(steps, { minutes: 7, focus: 'ganz', level: 2, quiet: !!quiet, name: '7-Minuten-Workout' });
  }

  function finish(steps, meta) {
    const totalSeconds = steps.reduce((s, x) => s + x.seconds, 0);
    const exercises = steps.filter((s) => s.phase === 'work').length;
    const name = meta.name || `${FOCUS[meta.focus].label.replace(/^\S+\s/, '')} · ${Math.round(totalSeconds / 60)} Min`;
    return { ...meta, name, steps, totalSeconds, exercises };
  }

  // ---------- Statistik ----------
  const DAY = 86400000;
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  /** Tage am Stück mit Training (zählt bis heute oder gestern). */
  function streak(workouts, today = new Date()) {
    const days = new Set(workouts.map((w) => w.date));
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (!days.has(iso(d))) d.setTime(d.getTime() - DAY);
    let n = 0;
    while (days.has(iso(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  /** Trainings in der aktuellen Woche (Mo–So). */
  function thisWeek(workouts, today = new Date()) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const monday = new Date(d.getTime() - ((d.getDay() + 6) % 7) * DAY);
    const from = iso(monday);
    const to = iso(new Date(monday.getTime() + 6 * DAY));
    const list = workouts.filter((w) => w.date >= from && w.date <= to);
    return { count: new Set(list.map((w) => w.date)).size, sessions: list.length, minutes: Math.round(list.reduce((s, w) => s + (w.seconds || 0), 0) / 60), from, to };
  }

  return { GROUPS, EXERCISES, FOCUS, LEVELS, byId, rng, generateWorkout, sevenMinute, streak, thisWeek };
});
