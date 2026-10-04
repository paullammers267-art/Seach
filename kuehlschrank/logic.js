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
    sahne: { label: 'Sahne', emoji: '🥛', days: 7, terms: ['schlagsah', 'sahne', 'schlagsahne', 'kochsahne', 'cream', 'en:creams'] },
    sauresahne: { label: 'Saure Sahne / Schmand', emoji: '🥛', days: 10, terms: ['saure sahne', 'schmand', 'creme fraiche', 'crème fraîche', 'sour cream'] },
    butter: { label: 'Butter', emoji: '🧈', days: 30, terms: ['butter', 'en:butters'] },
    kaese: { label: 'Käse', emoji: '🧀', days: 21, terms: ['kase', 'gouda', 'emmentaler', 'edamer', 'cheddar', 'bergkase', 'reibekase', 'tilsiter', 'leerdammer', 'butterkase', 'en:cheeses', 'cheese'] },
    mozzarella: { label: 'Mozzarella', emoji: '🧀', days: 10, terms: ['mozzarella', 'burrata'] },
    parmesan: { label: 'Parmesan', emoji: '🧀', days: 60, terms: ['parmesan', 'parmigiano', 'grana padano', 'pecorino'] },
    feta: { label: 'Feta / Hirtenkäse', emoji: '🧀', days: 21, terms: ['feta', 'hirtenkase', 'schafskase', 'salakis'] },
    frischkaese: { label: 'Frischkäse', emoji: '🧀', days: 14, terms: ['frischkase', 'philadelphia', 'cream cheese', 'ricotta', 'mascarpone'] },
    joghurt: { label: 'Joghurt', emoji: '🥣', days: 14, terms: ['joghu', 'joghurt', 'jogurt', 'yoghurt', 'yogurt', 'skyr', 'en:yogurts'] },
    quark: { label: 'Quark', emoji: '🥣', days: 14, terms: ['quark', 'topfen'] },
    eier: { label: 'Eier', emoji: '🥚', days: 21, terms: ['eier', ' ei ', 'freilandeier', 'en:eggs', 'eggs'] },
    schinken: { label: 'Schinken', emoji: '🥓', days: 10, terms: ['schinken', 'kochschinken', ' ham '] },
    speck: { label: 'Speck', emoji: '🥓', days: 14, terms: ['speck', 'bacon', 'pancetta', 'schinkenwurfel'] },
    hackfleisch: { label: 'Hackfleisch', emoji: '🥩', days: 1, terms: ['hackfl', 'hack gem', 'hackfleisch', 'gehacktes', ' hack ', 'rinderhack', 'minced'] },
    haehnchen: { label: 'Hähnchen', emoji: '🍗', days: 2, terms: ['haehn', 'hahn.', 'hahnchen', 'hühnchen', 'huhnchen', 'hahnchenbrust', 'chicken', 'pute', 'putenbrust', 'gefluegel', 'geflugel'] },
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
    zwiebeln: { label: 'Zwiebeln', emoji: '🧅', days: 30, terms: ['zwieb', 'zwiebel', 'schalotte', 'onion'] },
    knoblauch: { label: 'Knoblauch', emoji: '🧄', days: 30, terms: ['knoblauch', 'garlic'] },
    karotten: { label: 'Karotten', emoji: '🥕', days: 14, terms: ['karotte', 'mohre', 'moehre', 'rubli', 'carrot'] },
    zucchini: { label: 'Zucchini', emoji: '🥒', days: 7, terms: ['zucchini', 'zucchetti'] },
    gurke: { label: 'Gurke', emoji: '🥒', days: 7, terms: ['gurke', 'cucumber'] },
    champignons: { label: 'Pilze', emoji: '🍄', days: 4, terms: ['champ', 'champignon', 'pilze', 'pilz', 'mushroom', 'egerlinge'] },
    spinat: { label: 'Spinat', emoji: '🥬', days: 3, terms: ['spinat', 'spinach', 'blattspinat'] },
    salat: { label: 'Salat', emoji: '🥬', days: 4, terms: ['salat', 'eisberg', 'rucola', 'feldsalat', 'kopfsalat', 'romana', 'lettuce'] },
    brokkoli: { label: 'Brokkoli', emoji: '🥦', days: 5, terms: ['brokkoli', 'broccoli'] },
    blumenkohl: { label: 'Blumenkohl', emoji: '🥦', days: 7, terms: ['blumenkohl', 'cauliflower'] },
    lauch: { label: 'Lauch', emoji: '🥬', days: 10, terms: ['lauch', 'porree', 'fruhlingszwiebel', 'leek'] },
    kartoffeln: { label: 'Kartoffeln', emoji: '🥔', days: 30, terms: ['kartoff', 'kartoffel', 'potato', 'drillinge'] },
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
    nudeln: { label: 'Nudeln', emoji: '🍝', days: 365, terms: ['spagh', 'nudeln', 'spaghetti', 'penne', 'fusilli', 'pasta', 'tagliatelle', 'makkaroni', 'farfalle', 'rigatoni', 'lasagne'] },
    reis: { label: 'Reis', emoji: '🍚', days: 365, terms: ['reis', 'basmati', 'jasmin', 'risotto', 'rice'] },
    mehl: { label: 'Mehl', emoji: '🌾', days: 365, terms: ['mehl', 'weizenmehl', 'flour'] },
    brot: { label: 'Brot', emoji: '🍞', days: 4, terms: ['brot', 'toast', 'brotchen', 'baguette', 'ciabatta', 'bread'] },
    wraps: { label: 'Wraps / Tortillas', emoji: '🌯', days: 30, terms: ['wrap', 'tortilla'] },
    gnocchi: { label: 'Gnocchi', emoji: '🥟', days: 30, terms: ['gnocchi', 'schupfnudeln'] },
    haferflocken: { label: 'Haferflocken', emoji: '🥣', days: 365, terms: ['haferflocken', 'hafer', 'oats', 'musli', 'muesli'] },
    schokolade: { label: 'Schokolade', emoji: '🍫', days: 180, terms: ['schokolade', 'milchschokolade', 'chocolate', 'en:chocolates'] },
    pesto: { label: 'Pesto', emoji: '🌿', days: 30, terms: ['pesto'] },
    getraenk: { label: 'Getränk', emoji: '🧃', days: 180, terms: ['saft', 'limonade', 'cola', 'wasser', 'bier', 'wein', 'en:beverages', 'drink'] },
    aubergine: { label: 'Aubergine', emoji: '🍆', days: 7, terms: ['aubergine', 'melanzani', 'eggplant'] },
    kohl: { label: 'Kohl', emoji: '🥬', days: 14, terms: [' kohl', 'weisskohl', 'rotkohl', 'wirsing', 'spitzkohl', 'sauerkraut', 'cabbage'] },
    spargel: { label: 'Spargel', emoji: '🌱', days: 3, terms: ['spargel', 'asparagus'] },
    avocado: { label: 'Avocado', emoji: '🥑', days: 4, terms: ['avocado'] },
    suesskartoffel: { label: 'Süßkartoffel', emoji: '🍠', days: 21, terms: ['susskartoffel', 'suesskartoffel', 'sweet potato', 'batate'] },
  };

  /**
   * Ordnet einen Produktnamen (und optional Open-Food-Facts-Kategorien) einer kanonischen Zutat zu.
   * Gewinnt der längste Treffer, damit z. B. "Milchschokolade" nicht als Milch zählt.
   */
  // Drogerie & Haushalt sind keine Lebensmittel („Zahnpasta“ ist keine Pasta, „Katzenfutter“ kein Fleisch)
  const NON_FOOD = ['zahnpasta', 'zahnburste', 'zahnbuerste', 'shampoo', 'duschgel', 'spulmittel', 'spuelmittel', 'waschmittel', 'weichspuler', 'klopapier', 'toilettenpapier', 'katzenfutter', 'hundefutter', 'tierfutter', 'kuchenrolle', 'kuechenrolle', 'reiniger'];
  function detectIngredient(name, categories = []) {
    const hay = ' ' + norm(name) + ' ';
    if (NON_FOOD.some((w) => hay.includes(w))) return null;
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


  // ---------- Haltbarkeit nach dem Öffnen / Einfrieren, Lagertipps ----------

  /** opened = Tage nach dem Öffnen, freeze = Monate im Gefrierfach (0 = nicht geeignet), tip = Lagertipp. */
  const CARE = {
    milch: { opened: 3, freeze: 2, tip: 'Geöffnet in der Kühlschranktür, innerhalb von 3 Tagen aufbrauchen. H-Milch ungeöffnet ohne Kühlung lagern.' },
    sahne: { opened: 3, freeze: 3, tip: 'Geöffnet 2–3 Tage. Eingefroren flockt sie leicht, zum Kochen aber gut.' },
    sauresahne: { opened: 5, freeze: 0, tip: 'Geöffnet ca. 5 Tage, mit sauberem Löffel entnehmen.' },
    butter: { opened: 30, freeze: 6, tip: 'Gut verpackt lagern, nimmt sonst Gerüche an. Lässt sich sehr gut einfrieren.' },
    kaese: { opened: 10, freeze: 3, tip: 'In Wachs-/Käsepapier oder Box im Gemüsefach. Hartkäse gerieben einfrieren.' },
    mozzarella: { opened: 2, freeze: 1, tip: 'Geöffnet in der Lake 1–2 Tage. Eingefroren nur noch zum Überbacken.' },
    parmesan: { opened: 30, freeze: 6, tip: 'Am Stück in Papier lange haltbar, Schimmel großzügig wegschneiden.' },
    feta: { opened: 5, freeze: 2, tip: 'In der eigenen Lake oder mit Salzwasser bedeckt lagern.' },
    frischkaese: { opened: 7, freeze: 0, tip: 'Geöffnet ca. eine Woche. Einfrieren verändert die Konsistenz.' },
    joghurt: { opened: 4, freeze: 1, tip: 'MHD oft weit überschreitbar – Geruch und Aussehen prüfen.' },
    quark: { opened: 4, freeze: 2, tip: 'Molke obenauf ist normal, einfach unterrühren.' },
    eier: { opened: 2, freeze: 0, tip: 'Spitze nach unten im Kühlschrank. Schwimmtest: liegt flach = frisch, steht = älter, schwimmt = weg damit.' },
    schinken: { opened: 3, freeze: 2, tip: 'Geöffnete Packung luftdicht verschließen, 2–3 Tage.' },
    speck: { opened: 7, freeze: 3, tip: 'Gewürfelt portionsweise einfrieren – direkt gefroren anbraten.' },
    hackfleisch: { opened: 0, freeze: 3, tip: 'Am Kauftag verbrauchen oder sofort flach einfrieren (taut schneller auf). Nie roh essen nach Ablauf.' },
    haehnchen: { opened: 1, freeze: 6, tip: 'Unterste Ablage, auf Teller. Immer vollständig durchgaren.' },
    rind: { opened: 2, freeze: 6, tip: 'Unterste Ablage (kältester Bereich). Am Stück länger haltbar als geschnitten.' },
    schwein: { opened: 2, freeze: 4, tip: 'Unterste Ablage. Portionsweise einfrieren.' },
    wurst: { opened: 5, freeze: 2, tip: 'Angebrochene Wurst in eine Box, nicht in der offenen Packung.' },
    lachs: { opened: 1, freeze: 3, tip: 'Frischer Fisch am Kauftag, geräucherter Lachs geöffnet 2–3 Tage.' },
    fisch: { opened: 1, freeze: 3, tip: 'Am Kauftag zubereiten oder einfrieren.' },
    thunfisch: { opened: 2, freeze: 0, tip: 'Geöffnete Dose umfüllen und abgedeckt kühlen.' },
    tofu: { opened: 4, freeze: 3, tip: 'Geöffnet in Wasser im Kühlschrank, Wasser täglich wechseln. Eingefroren wird er fester – super zum Braten.' },
    tomaten: { opened: 2, freeze: 6, tip: 'Nicht im Kühlschrank, sondern bei Zimmertemperatur – so bleiben sie aromatisch.' },
    passata: { opened: 4, freeze: 3, tip: 'Geöffnet umfüllen, 3–5 Tage. Reste portionsweise einfrieren.' },
    paprika: { opened: 3, freeze: 6, tip: 'Im Gemüsefach ca. 1 Woche. Geschnitten einfrieren für Pfannengerichte.' },
    zwiebeln: { opened: 3, freeze: 6, tip: 'Kühl, dunkel und luftig lagern – nicht neben Kartoffeln.' },
    knoblauch: { opened: 7, freeze: 6, tip: 'Trocken und luftig, nicht im Kühlschrank (keimt sonst).' },
    karotten: { opened: 5, freeze: 9, tip: 'Grün abschneiden, im Gemüsefach bis zu 3 Wochen.' },
    zucchini: { opened: 3, freeze: 6, tip: 'Im Gemüsefach. Geraspelt einfrieren für Puffer und Soßen.' },
    gurke: { opened: 2, freeze: 0, tip: 'Mag es nicht zu kalt – am besten im Gemüsefach oben oder kühl im Raum. Nicht neben Tomaten/Äpfeln.' },
    champignons: { opened: 2, freeze: 6, tip: 'In Papiertüte im Kühlschrank, nicht in Plastik (werden schmierig).' },
    spinat: { opened: 1, freeze: 10, tip: 'Sehr kurz haltbar – blanchiert einfrieren.' },
    salat: { opened: 2, freeze: 0, tip: 'In ein feuchtes Tuch gewickelt im Gemüsefach. Welker Salat erholt sich in kaltem Wasser.' },
    brokkoli: { opened: 2, freeze: 10, tip: 'Röschen blanchieren und einfrieren.' },
    blumenkohl: { opened: 3, freeze: 10, tip: 'Im Gemüsefach, Röschen blanchiert einfrieren.' },
    lauch: { opened: 4, freeze: 6, tip: 'In Ringen roh einfrieren – perfekt für Suppen.' },
    kartoffeln: { opened: 2, freeze: 0, tip: 'Dunkel und kühl, nicht im Kühlschrank. Grüne Stellen und Keime großzügig entfernen.' },
    kuerbis: { opened: 4, freeze: 10, tip: 'Ganz monatelang haltbar, angeschnitten in Folie 4–5 Tage.' },
    erbsen: { opened: 3, freeze: 10, tip: 'TK-Erbsen direkt gefroren verwenden.' },
    mais: { opened: 3, freeze: 6, tip: 'Geöffnete Dose umfüllen.' },
    bohnen: { opened: 3, freeze: 6, tip: 'Geöffnete Dose umfüllen, abgespült einfrieren.' },
    kichererbsen: { opened: 3, freeze: 6, tip: 'Kochwasser (Aquafaba) als Eiersatz nutzen.' },
    linsen: { opened: 180, freeze: 0, tip: 'Trocken und luftdicht lagern.' },
    kokosmilch: { opened: 4, freeze: 3, tip: 'Reste im Eiswürfelbehälter einfrieren.' },
    aepfel: { opened: 1, freeze: 8, tip: 'Getrennt von anderem Obst lagern – Äpfel lassen es schneller reifen.' },
    bananen: { opened: 1, freeze: 4, tip: 'Überreif geschält einfrieren – ideal für Smoothies und Bananenbrot.' },
    beeren: { opened: 1, freeze: 10, tip: 'Erst kurz vor dem Essen waschen. Ausgebreitet einfrieren, dann umfüllen.' },
    zitrone: { opened: 5, freeze: 4, tip: 'Angeschnitten mit Schnittfläche nach unten auf einen Teller.' },
    nudeln: { opened: 365, freeze: 0, tip: 'Trocken lagern. Gekochte Nudeln 3 Tage im Kühlschrank.' },
    reis: { opened: 365, freeze: 0, tip: 'Gekochten Reis schnell abkühlen und max. 1–2 Tage kühlen.' },
    mehl: { opened: 180, freeze: 0, tip: 'Luftdicht gegen Mehlmotten lagern.' },
    brot: { opened: 3, freeze: 3, tip: 'Im Brotkasten, nicht im Kühlschrank (wird schneller altbacken). Scheiben einfrieren und toasten.' },
    wraps: { opened: 5, freeze: 3, tip: 'Geöffnet gut verschließen.' },
    gnocchi: { opened: 3, freeze: 3, tip: 'Geöffnet innerhalb von 3 Tagen.' },
    haferflocken: { opened: 180, freeze: 0, tip: 'Luftdicht lagern.' },
    schokolade: { opened: 60, freeze: 0, tip: 'Weißer Belag (Fettreif) ist harmlos.' },
    pesto: { opened: 7, freeze: 3, tip: 'Mit Öl bedeckt halten, dann ca. eine Woche.' },
    getraenk: { opened: 3, freeze: 0, tip: 'Säfte geöffnet gekühlt 3–5 Tage.' },
    aubergine: { opened: 2, freeze: 6, tip: 'Nicht zu kalt lagern (max. 1 Woche im Gemüsefach). Zum Einfrieren in Scheiben grillen oder braten.' },
    kohl: { opened: 5, freeze: 10, tip: 'Ganze Köpfe halten im Gemüsefach 2–3 Wochen. Angeschnitten in Folie wickeln. Blanchiert gut einfrierbar.' },
    spargel: { opened: 2, freeze: 8, tip: 'In ein feuchtes Tuch gewickelt im Kühlschrank 2–3 Tage. Roh geschält einfrieren und gefroren kochen.' },
    avocado: { opened: 1, freeze: 4, tip: 'Hart kaufen und bei Zimmertemperatur reifen lassen (schneller neben Äpfeln). Angeschnitten mit Zitrone beträufeln, Kern drin lassen.' },
    suesskartoffel: { opened: 2, freeze: 10, tip: 'Kühl und dunkel, aber nicht im Kühlschrank lagern. Gekocht als Püree gut einfrierbar.' },
  };

  /** Neues Ablaufdatum nach dem Öffnen: das frühere aus aufgedrucktem Datum und "heute + Tage nach Öffnen". */
  function afterOpening(expiryIso, ingredientKey, today = new Date()) {
    const care = CARE[ingredientKey];
    const days = care ? care.opened : 3;
    const opened = toISODate(new Date(startOfDay(today).getTime() + days * DAY));
    return expiryIso && expiryIso < opened ? expiryIso : opened;
  }

  /** Ablaufdatum beim Einfrieren (null = Einfrieren nicht empfohlen). */
  function afterFreezing(ingredientKey, today = new Date()) {
    const care = CARE[ingredientKey];
    const months = care ? care.freeze : 3;
    if (!months) return null;
    const d = startOfDay(today);
    d.setMonth(d.getMonth() + months);
    return toISODate(d);
  }

  /** Hinweis bei überschrittenem Datum – MHD ist kein Wegwerfdatum, Verbrauchsdatum schon. */
  function expiredAdvice(item, today = new Date()) {
    const d = daysUntil(item.expiry, today);
    if (d === null || d >= 0) return '';
    if (item.dateType === 'verbrauch') return 'Verbrauchsdatum überschritten – nicht mehr essen.';
    return 'MHD überschritten – oft noch gut: Aussehen, Geruch und Geschmack prüfen.';
  }

  // ---------- Rezepte: Filter, Einkauf ----------

  const MEAT_FISH = ['schinken', 'speck', 'hackfleisch', 'haehnchen', 'rind', 'schwein', 'wurst', 'lachs', 'fisch', 'thunfisch'];

  function isVegetarian(recipe) {
    return !recipe.ingredients.some((i) => MEAT_FISH.includes(i));
  }

  /** Zutaten eines Rezepts, die nicht im Vorrat sind. */
  function missingIngredients(recipe, items) {
    const have = new Set(items.map((i) => i.ingredient).filter(Boolean));
    return recipe.ingredients.filter((i) => !have.has(i));
  }

  /** Einkaufsliste als Text zum Teilen. */
  function shoppingText(list) {
    const open = list.filter((i) => !i.done);
    return '🛒 Einkaufsliste\n' + open.map((i) => '☐ ' + i.name + (i.note ? ` (${i.note})` : '')).join('\n');
  }

  const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

  /** Die nächsten n Tage ab heute: [{ iso, label }] */
  function nextDays(n, today = new Date()) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const d = startOfDay(today);
      d.setDate(d.getDate() + i);
      const label = i === 0 ? 'Heute' : i === 1 ? 'Morgen' : `${WEEKDAYS[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`;
      out.push({ iso: toISODate(d), label });
    }
    return out;
  }

  // ---------- Statistik ----------

  /** Verlauf [{ date, kind: 'consumed'|'wasted', name, price }] -> letzte n Monate. */
  function monthlyStats(history, months = 6, today = new Date()) {
    const out = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      out.push({ key, label: d.toLocaleDateString('de-DE', { month: 'short' }), consumed: 0, wasted: 0, wastedValue: 0, savedValue: 0 });
    }
    const byKey = new Map(out.map((m) => [m.key, m]));
    for (const h of history) {
      const m = byKey.get(String(h.date).slice(0, 7));
      if (!m) continue;
      m[h.kind] += 1;
      if (h.price) m[h.kind === 'wasted' ? 'wastedValue' : 'savedValue'] += h.price;
    }
    return out;
  }

  /** Was landet am häufigsten im Müll? */
  function topWasted(history, n = 3) {
    const count = new Map();
    for (const h of history) if (h.kind === 'wasted') count.set(h.name, (count.get(h.name) || 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, times]) => ({ name, times }));
  }

  /** Preis aus Eingabe wie "1,99" oder "2.49 €" -> Zahl oder null. */
  /**
   * Zahl aus deutscher oder englischer Schreibweise: „1.250“ → 1250, „1.250,50“ → 1250.5, „12,5“ → 12.5, „2.99“ → 2.99.
   * (Früher wurde „1.250“ als 1,25 gelesen.)
   */
  function parsePrice(str) {
    const m = String(str || '').replace(/[\s\u00a0']/g, '').match(/\d[\d.,]*/);
    if (!m) return null;
    let t = m[0].replace(/[.,]+$/, '');
    const c = t.lastIndexOf(','), d = t.lastIndexOf('.');
    if (c > -1 && d > -1) t = c > d ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, ''); // beides: das letzte Zeichen trennt die Nachkommastellen
    else if (c > -1) t = /^\d{1,3}(,\d{3}){2,}$/.test(t) ? t.replace(/,/g, '') : t.replace(/,/g, '.').replace(/\.(?=.*\.)/g, '');
    else if (d > -1 && /^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, ''); // Tausenderpunkt
    const v = parseFloat(t);
    return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  }

  function formatEuro(v) {
    return (v || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  }


  // ---------- Spracheingabe ----------

  const NUMBER_WORDS = { ein: 1, eine: 1, einen: 1, einer: 1, zwei: 2, drei: 3, vier: 4, fuenf: 5, funf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, zwoelf: 12, zwolf: 12 };
  const UNITS = /^(x|mal|stuck|stueck|packung(en)?|pack|packchen|flasche(n)?|dose(n)?|becher|glas|glaser|beutel|netz|bund|liter|l|kilo|kg|gramm|g|tafel(n)?|tute(n)?|schale(n)?|kiste(n)?)$/;

  /** Menge am Anfang abtrennen: "2 Packungen Milch" -> { qty: 2, rest: "Milch" } */
  function splitQuantity(text) {
    const words = String(text).trim().split(/\s+/);
    let qty = 1;
    const n = norm(words[0] || '').replace(/ue/g, 'u');
    if (/^\d+$/.test(words[0])) { qty = parseInt(words[0], 10); words.shift(); }
    else if (NUMBER_WORDS[norm(words[0] || '')] || NUMBER_WORDS[n]) { qty = NUMBER_WORDS[norm(words[0])] || NUMBER_WORDS[n]; words.shift(); }
    while (words.length > 1 && UNITS.test(norm(words[0]).replace(/[.,]/g, ''))) words.shift();
    if (words.length > 1 && /^(mit|vom|von)$/i.test(words[0])) words.shift();
    return { qty: Math.max(1, Math.min(qty, 99)), rest: words.join(' ') };
  }

  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  /** "Milch, zwei Packungen Eier und Brot" -> [{ name: 'Milch', qty: 1 }, { name: 'Eier', qty: 2 }, { name: 'Brot', qty: 1 }] */
  function parseSpokenList(text) {
    return String(text || '')
      .split(/\s*(?:,|;|\bund\b|\bsowie\b|\bauch noch\b|\bnoch\b|\bdann\b|\n)\s*/i)
      .map((p) => p.replace(/^(bitte|ich brauche|wir brauchen|kaufen?|noch)\s+/i, '').replace(/[.!?]+$/, '').trim())
      .filter(Boolean)
      .map((p) => { const { qty, rest } = splitQuantity(p); return { name: cap(rest), qty }; })
      .filter((x) => x.name.length > 1);
  }

  /** "zwei Joghurt bis 12. Oktober" -> { name: 'Joghurt', qty: 2, expiry: '2026-10-12' } */
  function parseSpokenItem(text, today = new Date()) {
    const t = String(text || '').trim();
    const m = t.match(/\s(?:bis(?:\s+zum)?|haltbar(?:\s+bis)?|mhd|ablauf(?:datum)?|läuft\s+ab(?:\s+am)?|laeuft\s+ab(?:\s+am)?)\s+(.*)$/i);
    const head = m ? t.slice(0, m.index) : t;
    let expiry = null;
    if (m) {
      const tail = m[1].replace(/\b(\d{1,2})(?:ter|ten|te)\b/gi, '$1.');
      expiry = parseTypedDate(tail, today) || parseDateCandidates('mhd ' + tail, today).map((f) => f.iso)[0] || relativeDate(tail, today);
    }
    const { qty, rest } = splitQuantity(head.replace(/[.!?]+$/, ''));
    return { name: cap(rest), qty, expiry };
  }

  /** "morgen", "übermorgen", "in 5 Tagen", "nächste Woche" -> ISO */
  function relativeDate(text, today = new Date()) {
    const t = norm(text);
    const plus = (n) => toISODate(new Date(startOfDay(today).getTime() + n * DAY));
    if (/ubermorgen|uebermorgen/.test(t)) return plus(2);
    if (/morgen/.test(t)) return plus(1);
    if (/heute/.test(t)) return plus(0);
    let m = t.match(/in (\d+|\w+) tag/);
    if (m) return plus(/^\d+$/.test(m[1]) ? +m[1] : NUMBER_WORDS[m[1]] || 1);
    m = t.match(/in (\d+|\w+) woche/);
    if (m) return plus(7 * (/^\d+$/.test(m[1]) ? +m[1] : NUMBER_WORDS[m[1]] || 1));
    if (/nachste woche|naechste woche/.test(t)) return plus(7);
    return null;
  }

  // ---------- Kassenbon ----------

  const RECEIPT_SKIP = /(summe|zu zahlen|zwischensumme|gesamt|\btotal\b|\bmwst\b|\bust\b|ust-id|\bnetto\b|\bbrutto\b|rueckgeld|ruckgeld|gegeben|\bbar\b|\bkarte\b|kartenzahlung|\bec-|girocard|\bvisa\b|mastercard|kontaktlos|\bbeleg|\bbon\b|\bkasse\b|filiale|\bstr\.|strasse|\btel\b|telefon|steuer|\bdatum\b|uhrzeit|vielen dank|danke|payback|punkte|rabatt|coupon|\bpfand\b|leergut|\btse\b|signatur|terminal|\btrace\b|betrag|\beur\s*$|^eur\b)/;

  /**
   * Liest Produkte aus dem OCR-Text eines Kassenbons.
   * Zeilen wie "H-MILCH 3,5% 1L   1,19 A" -> { name: 'H-Milch 3,5% 1l', price: 1.19, ingredient: 'milch' }
   */
  function parseReceipt(text) {
    const out = [];
    for (let raw of String(text || '').split('\n')) {
      raw = raw.replace(/\s+/g, ' ').trim();
      const line = norm(raw);
      if (raw.length < 4 || RECEIPT_SKIP.test(line)) continue;
      if (/^\d+([.,]\d+)?\s*(x|stk|kg)\s/i.test(raw) && !/[a-z]{3,}/i.test(raw.replace(/^\S+\s+\S+/, ''))) continue; // "2 x 0,99"
      const m = raw.match(/^(.*?[A-Za-zÄÖÜäöüß].*?)\s+(-?\d{1,3}[,.]\d{2})\s*(?:[*]?\s*[ABCDE12]\b|€|EUR)?\s*[*]?$/i);
      if (!m) continue;
      const price = parseFloat(m[2].replace(',', '.'));
      if (!(price > 0) || price > 200) continue; // Rabatte/Unsinn
      let name = m[1].replace(/\b\d+\s*x\s*$/i, '').replace(/[|_*#]+/g, ' ').replace(/\s+/g, ' ').trim();
      if (name.replace(/[^A-Za-zÄÖÜäöüß]/g, '').length < 3) continue;
      name = name.toLowerCase().replace(/(^|[\s\-/])([a-zäöü])/g, (x, a, b) => a + b.toUpperCase());
      out.push({ name, price, ingredient: detectIngredient(name) });
    }
    return out;
  }

  /** Endbetrag eines Kassenbons ("SUMME EUR 19,98", "ZU ZAHLEN 19,98") oder null. */
  function parseReceiptTotal(text) {
    for (const raw of String(text || '').split('\n')) {
      const line = norm(raw);
      if (!/(summe|zu zahlen|gesamtbetrag|total|betrag)/.test(line) || /zwischen/.test(line)) continue;
      const m = raw.match(/(\d{1,4}[,.]\d{2})\s*(?:€|eur)?\s*$/i);
      if (m) return parseFloat(m[1].replace(',', '.'));
    }
    return null;
  }

  // ---------- Kochmodus ----------

  /** Zeitangaben in einem Rezeptschritt: "20 Min.", "1,5 Std.", "10–15 Minuten" -> Minuten (größerer Wert) */
  function findTimers(step) {
    const res = [];
    const re = /(\d+(?:[,.]\d+)?)(?:\s*[–-]\s*(\d+(?:[,.]\d+)?))?\s*(min|minute|minuten|std|stunde|stunden)\b/gi;
    let m;
    while ((m = re.exec(step))) {
      const v = parseFloat((m[2] || m[1]).replace(',', '.'));
      const mins = /^(std|stunde)/i.test(m[3]) ? v * 60 : v;
      if (mins > 0 && mins <= 600 && !res.includes(mins)) res.push(mins);
    }
    return res;
  }

  function formatTimer(sec) {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
  }

  // ---------- Teilen per Link ----------

  function encodeShare(obj) {
    const json = JSON.stringify(obj);
    const bin = unescape(encodeURIComponent(json));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function decodeShare(code) {
    try {
      const b64 = String(code).replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(decodeURIComponent(escape(atob(b64))));
    } catch (e) { return null; }
  }

  return {
    toISODate, fromISODate, daysUntil, status, statusText, formatDate,
    parseDates, parseDateCandidates, parseTypedDate, createDateVoter, cleanOcr, norm, INGREDIENTS, detectIngredient, suggestExpiry, suggestRecipes,
    CARE, afterOpening, afterFreezing, expiredAdvice, isVegetarian, missingIngredients, shoppingText,
    nextDays, monthlyStats, topWasted, parsePrice, formatEuro,
    parseSpokenList, parseSpokenItem, relativeDate, parseReceipt, parseReceiptTotal, findTimers, formatTimer, encodeShare, decodeShare,
  };
});
