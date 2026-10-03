/* Kernlogik: Datumserkennung, Haltbarkeits-Status, Zutaten-Erkennung, Rezept-Vorschläge.
   Läuft im Browser (window.FridgeLogic) und in Node (require) für die Tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FridgeLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DAY = 86400000;

  // ---------- Datum ----------

  function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function toISODate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function fromISODate(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function daysUntil(iso, today = new Date()) {
    if (!iso) return null;
    return Math.round((fromISODate(iso) - startOfDay(today)) / DAY);
  }

  function status(iso, today = new Date()) {
    const d = daysUntil(iso, today);
    if (d === null) return 'none';
    if (d < 0) return 'expired';
    if (d === 0) return 'today';
    if (d <= 3) return 'soon';
    if (d <= 7) return 'week';
    return 'ok';
  }

  function statusText(iso, today = new Date()) {
    const d = daysUntil(iso, today);
    if (d === null) return 'ohne Datum';
    if (d < -1) return `seit ${-d} Tagen abgelaufen`;
    if (d === -1) return 'seit gestern abgelaufen';
    if (d === 0) return 'läuft heute ab';
    if (d === 1) return 'läuft morgen ab';
    if (d <= 13) return `noch ${d} Tage`;
    if (d <= 60) return `noch ${Math.round(d / 7)} Wochen`;
    return `noch ${Math.round(d / 30)} Monate`;
  }

  function formatDate(iso) {
    if (!iso) return '–';
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
  }

  const MONTHS = {
    jan: 1, feb: 2, mar: 3, maer: 3, mrz: 3, apr: 4, mai: 5, may: 5, jun: 6, jul: 7,
    aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, dez: 12, dec: 12,
  };

  const KEYWORDS = /(mhd|mindestens|haltbar|verbrauch|zu verbrauchen|best before|best by|use by|exp|bbe|bb|ablauf|bis)/i;

  function validDate(y, m, d) {
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const dt = new Date(y, m - 1, d);
    if (dt.getMonth() !== m - 1) return null;
    return dt;
  }

  function fullYear(y) {
    y = Number(y);
    return y < 100 ? 2000 + y : y;
  }

  function lastDayOfMonth(y, m) {
    return new Date(y, m, 0);
  }

  /** Häufige OCR-Verwechslungen in Ziffernfolgen korrigieren.
      (Ohne Lookbehind-Regex, damit es auch auf älteren iPhones läuft.) */
  function cleanOcr(text) {
    const s = String(text);
    const isD = (c) => c >= '0' && c <= '9';
    const isNum = (c) => isD(c) || c === '.' || c === '/' || c === '-';
    const isL = (c) => /[A-Za-z]/.test(c);
    let out = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i], p = s[i - 1] || '', n = s[i + 1] || '';
      const digitLike = (isNum(p) && isNum(n)) || (!isL(p) && isD(n));
      if ((c === 'o' || c === 'O') && digitLike) out += '0';
      else if ((c === 'l' || c === 'I' || c === '|') && digitLike) out += '1';
      else if ((c === 's' || c === 'S') && isD(p) && isD(n)) out += '5';
      else if (c === 'B' && isD(p) && isD(n)) out += '8';
      else if (c === ',' && isD(p) && isD(n)) out += '.';
      else out += c;
    }
    return out;
  }

  /** Wie re.exec in einer Schleife, überspringt aber Treffer, vor denen ein Zeichen aus `notBefore` steht. */
  function allMatches(re, str, notBefore) {
    const res = [];
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(str))) {
      if (m.index > 0 && notBefore.test(str[m.index - 1])) { re.lastIndex = m.index + 1; continue; }
      res.push(m);
    }
    return res;
  }

  /**
   * Findet Ablaufdaten in (OCR-)Text. Liefert ISO-Daten, das wahrscheinlichste zuerst:
   * Daten nach "MHD"/"verbrauchen bis" etc. werden bevorzugt, sonst das späteste plausible Datum.
   */
  function parseDates(text, today = new Date()) {
    return parseDateCandidates(text, today).map((f) => f.iso);
  }

  /** Wie parseDates, aber mit Details: { iso, keyword (stand hinter MHD o. ä.), precise (mit Tag) }. */
  function parseDateCandidates(text, today = new Date()) {
    if (!text) return [];
    const src = cleanOcr(String(text));
    const lower = src.toLowerCase().replace(/ä/g, 'ae');
    const found = [];
    const add = (dt, index, precise) => {
      if (!dt) return;
      const diff = (startOfDay(dt) - startOfDay(today)) / DAY;
      if (diff < -366 || diff > 366 * 5) return; // unplausibel
      const before = lower.slice(Math.max(0, index - 30), index);
      found.push({ iso: toISODate(dt), keyword: KEYWORDS.test(before), precise, index });
    };
    let m;

    // 2026-10-03
    const reIso = /(20\d\d)[-./](\d{1,2})[-./](\d{1,2})(?!\d)/g;
    for (m of allMatches(reIso, lower, /\d/)) add(validDate(+m[1], +m[2], +m[3]), m.index, true);

    // 03.10.2026 · 03.10.26 · 03/10/26 · 03 10 26
    const reDMY = /(\d{1,2})\s?[./\- ]\s?(\d{1,2})\s?[./\- ]\s?(\d{4}|\d{2})(?![\d])/g;
    for (m of allMatches(reDMY, lower, /[\d.]/)) {
      if (/^20\d\d$/.test(m[1])) continue;
      add(validDate(fullYear(m[3]), +m[2], +m[1]), m.index, true);
    }

    // 031026 (6 Ziffern direkt hinter einem Schlüsselwort)
    const reCompact = /(mhd|exp|bis)[:.\s]*(\d{2})(\d{2})(\d{2})(?!\d)/g;
    while ((m = reCompact.exec(lower))) add(validDate(fullYear(m[4]), +m[3], +m[2]), m.index + m[1].length, true);

    // 3. Okt 2026 · 03 OCT 26 · 3 Okt
    const reMon = /(\d{1,2})\.?\s*(jan|feb|maer|mar|mrz|apr|mai|may|jun|jul|aug|sep|okt|oct|nov|dez|dec)[a-z]*\.?\s*(\d{4}|\d{2})?(?!\d)/g;
    for (m of allMatches(reMon, lower, /\d/)) {
      let y = m[3] ? fullYear(m[3]) : today.getFullYear();
      let dt = validDate(y, MONTHS[m[2]], +m[1]);
      if (dt && !m[3] && dt < startOfDay(today)) dt = validDate(y + 1, MONTHS[m[2]], +m[1]);
      add(dt, m.index, true);
    }

    // Monat/Jahr: 10/2026 · 10.26 (nach Schlüsselwort) -> letzter Tag des Monats
    const reMY = /(\d{1,2})\s?[./]\s?(20\d\d|\d{2})(?![\d./])/g;
    for (m of allMatches(reMY, lower, /[\d./]/)) {
      const month = +m[1];
      if (month < 1 || month > 12) continue;
      const before = lower.slice(Math.max(0, m.index - 30), m.index);
      if (m[2].length === 2 && !KEYWORDS.test(before)) continue; // "10.26" allein ist zu unsicher
      add(lastDayOfMonth(fullYear(m[2]), month), m.index, false);
    }

    // Duplikate entfernen und sortieren
    const best = new Map();
    for (const f of found) {
      const prev = best.get(f.iso);
      if (!prev || (f.keyword && !prev.keyword)) best.set(f.iso, f);
    }
    return [...best.values()]
      .sort((a, b) =>
        (b.keyword - a.keyword) ||
        (b.precise - a.precise) ||
        (a.iso < b.iso ? 1 : a.iso > b.iso ? -1 : 0));
  }

  /** Eingetipptes Datum: "051026", "05102026", "0510", "5.10.26", "5.10." -> ISO (oder null). */
  function parseTypedDate(str, today = new Date()) {
    const s = String(str || '').trim();
    let d, m, y;
    if (/[^\d\s]/.test(s)) {
      const p = s.split(/[^\d]+/).filter(Boolean);
      if (p.length < 2) return null;
      [d, m, y] = p;
    } else {
      const n = s.replace(/\s/g, '');
      if (n.length === 4) { d = n.slice(0, 2); m = n.slice(2); }
      else if (n.length === 6 || n.length === 8) { d = n.slice(0, 2); m = n.slice(2, 4); y = n.slice(4); }
      else return null;
    }
    if (y !== undefined && y.length !== 2 && y.length !== 4) return null;
    let year = y ? fullYear(y) : today.getFullYear();
    let dt = validDate(year, +m, +d);
    if (dt && !y && dt < startOfDay(today)) dt = validDate(year + 1, +m, +d);
    return dt ? toISODate(dt) : null;
  }

  /**
   * Sammelt Erkennungen über mehrere Kamerabilder/Varianten, weil die Texterkennung sich
   * gelegentlich verliest (z. B. 26 -> 34). add() liefert die Daten (bestes zuerst), sobald ein
   * Ergebnis sicher ist: direkt hinter "MHD"/"haltbar bis" oder mindestens zweimal gelesen.
   */
  function createDateVoter(today = new Date()) {
    const score = new Map();
    const ranked = () => [...score.keys()].sort((a, b) => score.get(b) - score.get(a));
    return {
      add(text) {
        const c = parseDateCandidates(text, today);
        // nur Monat/Jahr (z. B. "11.2026") zählt weniger – oft ist es ein abgeschnittenes Datum
        c.forEach((f, i) => score.set(f.iso, (score.get(f.iso) || 0) + (i === 0 ? 2 : 1) * (f.precise ? 1 : 0.5)));
        if (c[0] && c[0].keyword && c[0].precise) return [c[0].iso, ...ranked().filter((d) => d !== c[0].iso)];
        const r = ranked();
        return r.length && score.get(r[0]) >= 4 ? r : null;
      },
      best: ranked,
    };
  }

  // ---------- Zutaten ----------

  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/ß/g, 'ss')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
  }

  /** Kanonische Zutaten mit Suchbegriffen (Produktname, Open-Food-Facts-Kategorien). */
  const INGREDIENTS = {
    milch: { label: 'Milch', emoji: '🥛', days: 7, terms: ['milch', 'vollmilch', 'h-milch', 'frischmilch', 'buttermilch', 'en:milks', 'milk'] },
    sahne: { label: 'Sahne', emoji: '🥛', days: 7, terms: ['sahne', 'schlagsahne', 'kochsahne', 'cream', 'en:creams'] },
    sauresahne: { label: 'Saure Sahne / Schmand', emoji: '🥛', days: 10, terms: ['saure sahne', 'schmand', 'creme fraiche', 'crème fraîche', 'sour cream'] },
    butter: { label: 'Butter', emoji: '🧈', days: 30, terms: ['butter', 'en:butters'] },
    kaese: { label: 'Käse', emoji: '🧀', days: 21, terms: ['kase', 'gouda', 'emmentaler', 'edamer', 'cheddar', 'bergkase', 'reibekase', 'tilsiter', 'leerdammer', 'butterkase', 'en:cheeses', 'cheese'] },
    mozzarella: { label: 'Mozzarella', emoji: '🧀', days: 10, terms: ['mozzarella', 'burrata'] },
    parmesan: { label: 'Parmesan', emoji: '🧀', days: 60, terms: ['parmesan', 'parmigiano', 'grana padano', 'pecorino'] },
    feta: { label: 'Feta / Hirtenkäse', emoji: '🧀', days: 21, terms: ['feta', 'hirtenkase', 'schafskase', 'salakis'] },
    frischkaese: { label: 'Frischkäse', emoji: '🧀', days: 14, terms: ['frischkase', 'philadelphia', 'cream cheese', 'ricotta', 'mascarpone'] },
    joghurt: { label: 'Joghurt', emoji: '🥣', days: 14, terms: ['joghurt', 'jogurt', 'yoghurt', 'yogurt', 'skyr', 'en:yogurts'] },
    quark: { label: 'Quark', emoji: '🥣', days: 14, terms: ['quark', 'topfen'] },
    eier: { label: 'Eier', emoji: '🥚', days: 21, terms: ['eier', ' ei ', 'freilandeier', 'en:eggs', 'eggs'] },
    schinken: { label: 'Schinken', emoji: '🥓', days: 10, terms: ['schinken', 'kochschinken', ' ham '] },
    speck: { label: 'Speck', emoji: '🥓', days: 14, terms: ['speck', 'bacon', 'pancetta', 'schinkenwurfel'] },
    hackfleisch: { label: 'Hackfleisch', emoji: '🥩', days: 1, terms: ['hackfleisch', 'gehacktes', ' hack ', 'rinderhack', 'minced'] },
    haehnchen: { label: 'Hähnchen', emoji: '🍗', days: 2, terms: ['hahnchen', 'hühnchen', 'huhnchen', 'hahnchenbrust', 'chicken', 'pute', 'putenbrust', 'gefluegel', 'geflugel'] },
    rind: { label: 'Rindfleisch', emoji: '🥩', days: 3, terms: ['rindfleisch', 'rinder', 'steak', 'gulasch', 'beef'] },
    schwein: { label: 'Schweinefleisch', emoji: '🥩', days: 3, terms: ['schweine', 'schnitzel', 'kotelett', 'pork'] },
    wurst: { label: 'Wurst', emoji: '🌭', days: 14, terms: ['wurst', 'wurstchen', 'salami', 'bratwurst', 'wiener', 'chorizo', 'sausage'] },
    lachs: { label: 'Lachs', emoji: '🐟', days: 2, terms: ['lachs', 'salmon'] },
    fisch: { label: 'Fisch', emoji: '🐟', days: 2, terms: ['fisch', 'seelachs', 'kabeljau', 'forelle', 'fish', 'garnelen', 'shrimps'] },
    thunfisch: { label: 'Thunfisch', emoji: '🐟', days: 365, terms: ['thunfisch', 'tuna'] },
    tofu: { label: 'Tofu', emoji: '🧆', days: 14, terms: ['tofu'] },
    tomaten: { label: 'Tomaten', emoji: '🍅', days: 7, terms: ['tomate', 'tomaten', 'cherrytomaten', 'tomato'] },
    passata: { label: 'Passierte Tomaten', emoji: '🥫', days: 365, terms: ['passata', 'passierte tomaten', 'stuckige tomaten', 'tomatenmark', 'tomatensosse', 'tomatensauce', 'dosentomaten', 'pizzatomaten'] },
    paprika: { label: 'Paprika', emoji: '🫑', days: 7, terms: ['paprika', 'bell pepper'] },
    zwiebeln: { label: 'Zwiebeln', emoji: '🧅', days: 30, terms: ['zwiebel', 'schalotte', 'onion'] },
    knoblauch: { label: 'Knoblauch', emoji: '🧄', days: 30, terms: ['knoblauch', 'garlic'] },
    karotten: { label: 'Karotten', emoji: '🥕', days: 14, terms: ['karotte', 'mohre', 'moehre', 'rubli', 'carrot'] },
    zucchini: { label: 'Zucchini', emoji: '🥒', days: 7, terms: ['zucchini', 'zucchetti'] },
    gurke: { label: 'Gurke', emoji: '🥒', days: 7, terms: ['gurke', 'cucumber'] },
    champignons: { label: 'Pilze', emoji: '🍄', days: 4, terms: ['champignon', 'pilze', 'pilz', 'mushroom', 'egerlinge'] },
    spinat: { label: 'Spinat', emoji: '🥬', days: 3, terms: ['spinat', 'spinach', 'blattspinat'] },
    salat: { label: 'Salat', emoji: '🥬', days: 4, terms: ['salat', 'eisberg', 'rucola', 'feldsalat', 'kopfsalat', 'romana', 'lettuce'] },
    brokkoli: { label: 'Brokkoli', emoji: '🥦', days: 5, terms: ['brokkoli', 'broccoli'] },
    blumenkohl: { label: 'Blumenkohl', emoji: '🥦', days: 7, terms: ['blumenkohl', 'cauliflower'] },
    lauch: { label: 'Lauch', emoji: '🥬', days: 10, terms: ['lauch', 'porree', 'fruhlingszwiebel', 'leek'] },
    kartoffeln: { label: 'Kartoffeln', emoji: '🥔', days: 30, terms: ['kartoffel', 'potato', 'drillinge'] },
    kuerbis: { label: 'Kürbis', emoji: '🎃', days: 30, terms: ['kurbis', 'hokkaido', 'butternut', 'pumpkin'] },
    erbsen: { label: 'Erbsen', emoji: '🫛', days: 180, terms: ['erbsen', 'peas'] },
    mais: { label: 'Mais', emoji: '🌽', days: 365, terms: [' mais', 'maiskorner', ' corn '] },
    bohnen: { label: 'Bohnen', emoji: '🫘', days: 365, terms: ['bohnen', 'kidney', 'beans'] },
    kichererbsen: { label: 'Kichererbsen', emoji: '🫘', days: 365, terms: ['kichererbse', 'chickpea'] },
    linsen: { label: 'Linsen', emoji: '🫘', days: 365, terms: ['linsen', 'lentil'] },
    kokosmilch: { label: 'Kokosmilch', emoji: '🥥', days: 365, terms: ['kokosmilch', 'coconut milk'] },
    aepfel: { label: 'Äpfel', emoji: '🍎', days: 21, terms: ['apfel', 'aepfel', 'apple'] },
    bananen: { label: 'Bananen', emoji: '🍌', days: 5, terms: ['banane', 'banana'] },
    beeren: { label: 'Beeren', emoji: '🍓', days: 3, terms: ['beeren', 'erdbeere', 'himbeere', 'heidelbeere', 'blaubeere', 'berries'] },
    zitrone: { label: 'Zitrone', emoji: '🍋', days: 21, terms: ['zitrone', 'limette', 'lemon', 'lime'] },
    nudeln: { label: 'Nudeln', emoji: '🍝', days: 365, terms: ['nudeln', 'spaghetti', 'penne', 'fusilli', 'pasta', 'tagliatelle', 'makkaroni', 'farfalle', 'rigatoni', 'lasagne'] },
    reis: { label: 'Reis', emoji: '🍚', days: 365, terms: ['reis', 'basmati', 'jasmin', 'risotto', 'rice'] },
    mehl: { label: 'Mehl', emoji: '🌾', days: 365, terms: ['mehl', 'weizenmehl', 'flour'] },
    brot: { label: 'Brot', emoji: '🍞', days: 4, terms: ['brot', 'toast', 'brotchen', 'baguette', 'ciabatta', 'bread'] },
    wraps: { label: 'Wraps / Tortillas', emoji: '🌯', days: 30, terms: ['wrap', 'tortilla'] },
    gnocchi: { label: 'Gnocchi', emoji: '🥟', days: 30, terms: ['gnocchi', 'schupfnudeln'] },
    haferflocken: { label: 'Haferflocken', emoji: '🥣', days: 365, terms: ['haferflocken', 'hafer', 'oats', 'musli', 'muesli'] },
    schokolade: { label: 'Schokolade', emoji: '🍫', days: 180, terms: ['schokolade', 'milchschokolade', 'chocolate', 'en:chocolates'] },
    pesto: { label: 'Pesto', emoji: '🌿', days: 30, terms: ['pesto'] },
    getraenk: { label: 'Getränk', emoji: '🧃', days: 180, terms: ['saft', 'limonade', 'cola', 'wasser', 'bier', 'wein', 'en:beverages', 'drink'] },
  };

  /**
   * Ordnet einen Produktnamen (und optional Open-Food-Facts-Kategorien) einer kanonischen Zutat zu.
   * Gewinnt der längste Treffer, damit z. B. "Milchschokolade" nicht als Milch zählt.
   */
  function detectIngredient(name, categories = []) {
    const hay = ' ' + norm(name) + ' ';
    let best = null;
    let bestLen = 0;
    for (const [key, ing] of Object.entries(INGREDIENTS)) {
      for (const term of ing.terms) {
        const t = norm(term);
        if (t.startsWith('en:')) continue;
        if (hay.includes(t) && t.trim().length > bestLen) {
          best = key;
          bestLen = t.trim().length;
        }
      }
    }
    if (best) return best;
    const cats = categories.map(norm);
    for (const [key, ing] of Object.entries(INGREDIENTS)) {
      for (const term of ing.terms) {
        const t = norm(term);
        if (cats.some((c) => c === t || (!t.startsWith('en:') && c.endsWith(':' + t)))) return key;
      }
    }
    return null;
  }

  /** Vorschlag für ein Ablaufdatum, wenn keines eingegeben wird (typische Haltbarkeit). */
  function suggestExpiry(ingredientKey, today = new Date()) {
    const ing = INGREDIENTS[ingredientKey];
    const days = ing ? ing.days : 7;
    return toISODate(new Date(startOfDay(today).getTime() + days * DAY));
  }

  // ---------- Rezepte ----------

  /**
   * Bewertet Rezepte anhand des Vorrats. Zutaten, die bald ablaufen, geben Bonuspunkte.
   * items: [{ ingredient, expiry }]
   */
  function suggestRecipes(recipes, items, today = new Date(), opts = {}) {
    const minCoverage = opts.minCoverage ?? 0.5;
    const have = new Map(); // ingredient -> kleinste Resttage
    for (const it of items) {
      if (!it.ingredient) continue;
      const d = daysUntil(it.expiry, today);
      const val = d === null ? 999 : d;
      if (!have.has(it.ingredient) || val < have.get(it.ingredient)) have.set(it.ingredient, val);
    }
    const results = [];
    for (const r of recipes) {
      const used = r.ingredients.filter((i) => have.has(i));
      const missing = r.ingredients.filter((i) => !have.has(i));
      const extras = (r.optional || []).filter((i) => have.has(i));
      if (!used.length) continue;
      const coverage = used.length / r.ingredients.length;
      if (coverage < minCoverage) continue;
      const urgent = [...used, ...extras].filter((i) => have.get(i) <= 3);
      const urgency = [...used, ...extras].reduce((s, i) => {
        const d = have.get(i);
        return s + (d <= 1 ? 3 : d <= 3 ? 2 : d <= 7 ? 1 : 0);
      }, 0);
      const score = coverage * 10 + urgency * 2 + extras.length * 0.5 - missing.length;
      results.push({ recipe: r, used, missing, extras, urgent, coverage, score });
    }
    return results.sort((a, b) => b.score - a.score);
  }

  return {
    toISODate, fromISODate, daysUntil, status, statusText, formatDate,
    parseDates, parseDateCandidates, parseTypedDate, createDateVoter, cleanOcr, norm, INGREDIENTS, detectIngredient, suggestExpiry, suggestRecipes,
  };
});
