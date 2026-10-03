/* Ernährung: Lebensmittel-Datenbank, Kalorienziel, Nährwert-Erkennung (Etikett, Open Food Facts, Text).
   Läuft im Browser (window.FridgeNutrition) und in Node (Tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FridgeNutrition = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const norm = (s) => String(s || '').toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const r1 = (v) => Math.round(v * 10) / 10;

  // [Name, kcal/100 g, Eiweiß, Kohlenhydrate, Fett, Portion in g, Portionsname, weitere Suchwörter]
  const RAW = [
    ['Apfel', 52, 0.3, 14, 0.2, 150, 'Stück', 'aepfel'],
    ['Banane', 89, 1.1, 23, 0.3, 120, 'Stück', ''],
    ['Orange', 47, 0.9, 12, 0.1, 150, 'Stück', 'apfelsine'],
    ['Birne', 57, 0.4, 15, 0.1, 160, 'Stück', ''],
    ['Erdbeeren', 32, 0.7, 7.7, 0.3, 150, 'Schale', 'erdbeere'],
    ['Weintrauben', 69, 0.7, 18, 0.2, 125, 'Handvoll', 'trauben'],
    ['Heidelbeeren', 57, 0.7, 14, 0.3, 125, 'Schale', 'blaubeeren'],
    ['Kiwi', 61, 1.1, 15, 0.5, 75, 'Stück', ''],
    ['Mandarine', 53, 0.8, 13, 0.3, 80, 'Stück', 'clementine'],
    ['Tomate', 18, 0.9, 3.9, 0.2, 100, 'Stück', 'tomaten'],
    ['Gurke', 15, 0.7, 3.6, 0.1, 100, 'Portion', ''],
    ['Paprika', 31, 1, 6, 0.3, 150, 'Stück', ''],
    ['Karotte', 41, 0.9, 10, 0.2, 80, 'Stück', 'moehre karotten'],
    ['Brokkoli (gekocht)', 35, 2.4, 7, 0.4, 150, 'Portion', 'brokkoli'],
    ['Salat (gemischt, ohne Dressing)', 17, 1.2, 3, 0.2, 100, 'Schüssel', 'salat blattsalat'],
    ['Kartoffeln (gekocht)', 77, 2, 17, 0.1, 200, 'Portion', 'kartoffel salzkartoffeln'],
    ['Pommes frites', 312, 3.4, 41, 15, 150, 'Portion', 'pommes fritten'],
    ['Bratkartoffeln', 160, 2.5, 20, 8, 200, 'Portion', ''],
    ['Kartoffelpüree', 90, 2, 13, 3.5, 200, 'Portion', 'pueree'],
    ['Reis (gekocht)', 130, 2.7, 28, 0.3, 180, 'Portion', 'reis'],
    ['Nudeln (gekocht)', 158, 5.8, 31, 0.9, 250, 'Portion', 'pasta spaghetti nudeln penne'],
    ['Vollkornbrot', 220, 8, 41, 1.5, 50, 'Scheibe', 'brot schwarzbrot'],
    ['Mischbrot', 240, 7, 47, 1.5, 45, 'Scheibe', 'brot'],
    ['Toastbrot', 265, 8, 49, 3.5, 28, 'Scheibe', 'toast'],
    ['Brötchen', 270, 9, 53, 2, 55, 'Stück', 'broetchen semmel'],
    ['Croissant', 406, 8, 46, 21, 60, 'Stück', ''],
    ['Brezel', 280, 8, 56, 2, 90, 'Stück', 'breze laugenbrezel'],
    ['Haferflocken', 370, 13, 59, 7, 50, 'Portion', 'porridge oats'],
    ['Müsli', 360, 9, 64, 6, 60, 'Portion', 'muesli'],
    ['Cornflakes', 375, 7, 84, 1, 40, 'Portion', ''],
    ['Butter', 741, 0.7, 0.6, 83, 10, 'Portion (Brot)', ''],
    ['Margarine', 720, 0, 0, 80, 10, 'Portion (Brot)', ''],
    ['Marmelade', 250, 0.4, 61, 0.1, 20, 'Löffel', 'konfituere'],
    ['Honig', 304, 0.3, 82, 0, 20, 'Löffel', ''],
    ['Nuss-Nougat-Creme', 539, 6, 57, 31, 20, 'Portion', 'nutella'],
    ['Erdnussbutter', 588, 25, 20, 50, 20, 'Löffel', ''],
    ['Ei (gekocht)', 155, 13, 1.1, 11, 60, 'Stück', 'ei eier'],
    ['Rührei', 170, 11, 2, 13, 120, 'Portion', ''],
    ['Spiegelei', 196, 13.6, 0.8, 15, 60, 'Stück', ''],
    ['Milch (3,5 %)', 64, 3.3, 4.8, 3.5, 200, 'Glas', 'milch vollmilch'],
    ['Milch (1,5 %)', 47, 3.4, 4.9, 1.5, 200, 'Glas', 'fettarme milch'],
    ['Joghurt natur (3,5 %)', 61, 3.5, 4.7, 3.5, 150, 'Becher', 'joghurt'],
    ['Fruchtjoghurt', 95, 3.2, 14, 2.8, 150, 'Becher', ''],
    ['Skyr', 63, 11, 4, 0.2, 150, 'Becher', ''],
    ['Magerquark', 67, 12, 4, 0.3, 125, 'Portion', 'quark'],
    ['Gouda', 356, 25, 0, 28, 30, 'Scheibe', 'kaese'],
    ['Mozzarella', 254, 18, 1, 20, 125, 'Kugel', ''],
    ['Feta', 264, 14, 4, 21, 50, 'Portion', 'schafskaese'],
    ['Frischkäse', 250, 6, 3.5, 24, 30, 'Portion', 'frischkaese'],
    ['Salami', 400, 21, 1, 35, 15, 'Scheibe', ''],
    ['Kochschinken', 115, 21, 1, 3, 20, 'Scheibe', 'schinken'],
    ['Wiener Würstchen', 290, 13, 1, 26, 50, 'Stück', 'wuerstchen'],
    ['Bratwurst', 300, 14, 1, 27, 120, 'Stück', ''],
    ['Currywurst mit Soße', 230, 9, 10, 17, 250, 'Portion', 'currywurst'],
    ['Hähnchenbrust (gebraten)', 165, 31, 0, 3.6, 150, 'Portion', 'haehnchen huhn chicken'],
    ['Rinderhack (gebraten)', 250, 26, 0, 16, 125, 'Portion', 'hackfleisch hack'],
    ['Schnitzel (paniert)', 230, 20, 12, 11, 180, 'Stück', 'schnitzel'],
    ['Steak (Rind)', 200, 27, 0, 10, 200, 'Stück', 'steak'],
    ['Lachs (gebraten)', 206, 22, 0, 13, 150, 'Portion', 'lachs'],
    ['Fischstäbchen', 190, 12, 17, 8, 90, 'Portion (3 Stück)', 'fischstaebchen'],
    ['Thunfisch (Dose, natur)', 116, 26, 0, 1, 80, 'Portion', 'thunfisch'],
    ['Tofu', 120, 12, 2, 7, 150, 'Portion', ''],
    ['Linsen (gekocht)', 116, 9, 20, 0.4, 200, 'Portion', 'linsen'],
    ['Kichererbsen (gekocht)', 164, 9, 27, 2.6, 150, 'Portion', 'kichererbsen'],
    ['Spaghetti Bolognese', 150, 7, 18, 5, 400, 'Teller', 'bolognese'],
    ['Spaghetti Carbonara', 200, 8, 21, 9, 350, 'Teller', 'carbonara'],
    ['Lasagne', 160, 8, 13, 8, 350, 'Portion', ''],
    ['Pizza Margherita', 250, 10, 31, 9, 350, 'Pizza (halb)', 'pizza'],
    ['Pizza Salami', 270, 11, 30, 12, 350, 'Pizza (halb)', ''],
    ['Döner Kebab', 215, 12, 20, 10, 400, 'Stück', 'doener doner kebab'],
    ['Burger', 260, 13, 24, 12, 220, 'Stück', 'hamburger cheeseburger'],
    ['Pfannkuchen', 220, 7, 28, 9, 120, 'Stück', 'pfannkuchen eierkuchen crepe'],
    ['Kartoffelsuppe', 75, 2, 9, 3.5, 350, 'Teller', 'suppe'],
    ['Gemüsesuppe', 40, 1.5, 6, 1, 350, 'Teller', 'suppe'],
    ['Chili con Carne', 120, 8, 10, 5, 350, 'Teller', 'chili'],
    ['Curry mit Reis', 150, 5, 20, 5, 400, 'Teller', 'curry'],
    ['Sushi (Maki)', 145, 5, 28, 1, 200, 'Portion (8 Stück)', 'sushi'],
    ['Gemischter Salat mit Dressing', 90, 1.5, 5, 7, 250, 'Schüssel', 'salat dressing'],
    ['Kartoffelsalat', 160, 2, 13, 11, 200, 'Portion', ''],
    ['Belegtes Brötchen (Käse)', 280, 12, 30, 12, 110, 'Stück', 'kaesebroetchen'],
    ['Käsebrot', 270, 12, 28, 12, 90, 'Scheibe', ''],
    ['Schokolade (Vollmilch)', 535, 7, 57, 30, 25, 'Riegel (¼ Tafel)', 'schokolade'],
    ['Gummibärchen', 343, 7, 77, 0.1, 25, 'Handvoll', 'gummibaerchen haribo'],
    ['Chips', 536, 6, 53, 34, 30, 'Handvoll', 'kartoffelchips'],
    ['Kekse', 480, 6, 66, 21, 25, 'Stück (2–3)', 'keks butterkeks'],
    ['Kuchen (Rührkuchen)', 380, 6, 50, 17, 80, 'Stück', 'kuchen'],
    ['Käsekuchen', 260, 7, 26, 14, 120, 'Stück', ''],
    ['Eis (Sahneeis)', 210, 3.5, 24, 11, 100, 'Kugel (2)', 'eiscreme'],
    ['Nüsse (gemischt)', 607, 20, 21, 54, 30, 'Handvoll', 'nuesse studentenfutter mandeln walnuesse'],
    ['Croissant mit Schokolade', 420, 7, 48, 22, 70, 'Stück', 'schokocroissant'],
    ['Apfelsaft', 46, 0.1, 11, 0.1, 250, 'Glas', 'saft'],
    ['Orangensaft', 45, 0.7, 10, 0.2, 250, 'Glas', 'osaft'],
    ['Cola', 42, 0, 10.6, 0, 330, 'Dose', 'coca cola limo limonade'],
    ['Cola Zero', 0.3, 0, 0, 0, 330, 'Dose', 'light'],
    ['Bier', 43, 0.5, 3.6, 0, 500, 'Flasche (0,5 l)', 'pils'],
    ['Wein (rot/weiß)', 83, 0.1, 2.6, 0, 200, 'Glas', 'wein rotwein weisswein'],
    ['Kaffee schwarz', 2, 0.1, 0, 0, 200, 'Tasse', 'kaffee espresso'],
    ['Cappuccino', 40, 2, 3, 2, 200, 'Tasse', 'latte macchiato milchkaffee'],
    ['Tee (ungesüßt)', 1, 0, 0.2, 0, 250, 'Tasse', 'tee'],
    ['Wasser', 0, 0, 0, 0, 250, 'Glas', 'mineralwasser'],
    ['Zucker', 400, 0, 100, 0, 5, 'Teelöffel', ''],
    ['Olivenöl', 884, 0, 0, 100, 10, 'Esslöffel', 'oel'],
    ['Ketchup', 110, 1, 25, 0.2, 20, 'Portion', ''],
    ['Mayonnaise', 680, 1, 1, 75, 15, 'Esslöffel', 'mayo'],
    ['Avocado', 160, 2, 9, 15, 100, 'halbe', ''],
    ['Proteinriegel', 360, 30, 35, 12, 50, 'Riegel', 'eiweissriegel'],
    ['Müsliriegel', 400, 6, 65, 13, 25, 'Riegel', 'muesliriegel'],
  ];
  const FOODS = RAW.map(([name, kcal, p, c, f, portion, portionLabel, extra], i) => ({
    id: 'f' + i, name, kcal, p, c, f, portion, portionLabel, terms: norm(name + ' ' + extra),
  }));

  function searchFoods(q, limit = 12) {
    const n = norm(q).trim();
    if (!n) return [];
    const words = n.split(/\s+/);
    return FOODS.map((f) => {
      let score = 0;
      for (const w of words) {
        if (f.terms.startsWith(w)) score += 3;
        else if (f.terms.includes(' ' + w)) score += 2;
        else if (f.terms.includes(w)) score += 1;
        else return null;
      }
      return { f, score: score - f.name.length / 100 };
    }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.f);
  }

  /** Werte für eine Menge in Gramm (per100: { kcal, p, c, f }). */
  function scale(per100, grams) {
    const k = grams / 100;
    return { kcal: Math.round(per100.kcal * k), p: r1((per100.p || 0) * k), c: r1((per100.c || 0) * k), f: r1((per100.f || 0) * k) };
  }

  // ---------- Ziel ----------

  const ACTIVITY = {
    1.2: 'kaum Bewegung (Büro)', 1.375: 'leicht aktiv (1–2× Sport/Woche)', 1.55: 'aktiv (3–5× Sport/Woche)', 1.725: 'sehr aktiv (täglich Sport/körperliche Arbeit)',
  };
  const GOALS = { lose: 'abnehmen', keep: 'Gewicht halten', gain: 'zunehmen' };

  /** Tagesbedarf nach Mifflin-St Jeor; Ziel ± 500 kcal (nie unter 1200/1500). */
  function dailyGoal({ sex, age, height, weight, activity = 1.375, goal = 'keep' }) {
    if (!age || !height || !weight) return null;
    const bmr = 10 * weight + 6.25 * height - 5 * age + (sex === 'm' ? 5 : -161);
    const tdee = bmr * Number(activity);
    let kcal = tdee + (goal === 'lose' ? -500 : goal === 'gain' ? 300 : 0);
    kcal = Math.max(sex === 'm' ? 1500 : 1200, kcal);
    kcal = Math.round(kcal / 10) * 10;
    const protein = Math.round(weight * (goal === 'lose' ? 1.6 : 1.2));
    const fat = Math.round((kcal * 0.3) / 9);
    const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
    return { kcal, bmr: Math.round(bmr), tdee: Math.round(tdee), protein, fat, carbs };
  }

  /** Summen eines Tages. */
  function totals(entries) {
    const t = entries.reduce((s, e) => ({ kcal: s.kcal + (e.kcal || 0), p: s.p + (e.p || 0), c: s.c + (e.c || 0), f: s.f + (e.f || 0) }), { kcal: 0, p: 0, c: 0, f: 0 });
    return { kcal: Math.round(t.kcal), p: r1(t.p), c: r1(t.c), f: r1(t.f) };
  }

  const MEALS = { fruehstueck: '🌅 Frühstück', mittag: '☀️ Mittagessen', abend: '🌙 Abendessen', snack: '🍎 Snacks' };
  function mealForHour(h) {
    if (h >= 4 && h < 11) return 'fruehstueck';
    if (h >= 11 && h < 15) return 'mittag';
    if (h >= 17 && h < 22) return 'abend';
    return 'snack';
  }

  /** Grober Kalorienverbrauch beim Training (MET ~ 5 für Zirkeltraining, 2,5 für Dehnen). */
  function burned(workout, weightKg) {
    if (!workout || !weightKg) return 0;
    const met = workout.focus === 'dehnen' ? 2.5 : 5;
    return Math.round(met * weightKg * ((workout.seconds || 0) / 3600));
  }

  // ---------- Erkennung ----------

  /**
   * Nährwerttabelle (OCR-Text): Werte pro 100 g.
   * Robust gegen typische Lesefehler: "Fett 9,59" (g als 9 gelesen), "Fett9,5g", "Eiweil3 8,2 g".
   */
  function parseNutritionLabel(text) {
    const t = String(text || '').replace(/(\d),(\d)/g, '$1.$2');
    const lines = t.split('\n').map((l) => l.trim()).filter(Boolean);
    let kcal = null;
    for (const l of lines) { const m = l.match(/(\d{1,3}(?:\.\d)?)\s*kcal/i); if (m) { kcal = parseFloat(m[1]); break; } }
    if (kcal == null) {
      for (const l of lines) { const m = l.match(/(\d{2,4}(?:\.\d)?)\s*kj/i); if (m) { kcal = Math.round(parseFloat(m[1]) / 4.184); break; } }
    }
    if (kcal == null) return null;
    // Wert hinter dem Stichwort: bevorzugt eine Zahl mit "g"
    const valueIn = (rest) => {
      const nums = [...rest.matchAll(/(\d{1,3}(?:\.\d{1,2})?)\s*(g|9)?(?![\d.])/gi)];
      if (!nums.length) return null;
      const withG = nums.filter((m) => m[2]);
      if (withG.length) return parseFloat(withG[withG.length - 1][1]);
      let v = nums[nums.length - 1][1];
      if (/\.\d9$/.test(v)) v = v.slice(0, -1); // "9.59" war "9,5g"
      return parseFloat(v);
    };
    const find = (re) => {
      for (const l of lines) {
        const m = l.toLowerCase().match(re);
        if (m) return valueIn(l.slice(m[0].length));
      }
      return null;
    };
    return {
      kcal: Math.round(kcal),
      p: find(/^(?:eiwei|protein)/),
      c: find(/^(?:kohlenhydrat|carbohydrat)[a-z]*/),
      f: find(/^(?:fett|fat)(?![a-zäöüß])/),
    };
  }

  /** Nährwerte aus einem Open-Food-Facts-Produkt. */
  function fromOpenFoodFacts(p) {
    const n = p.nutriments || {};
    const kcal = n['energy-kcal_100g'] ?? (n.energy_100g != null ? n.energy_100g / 4.184 : null);
    if (kcal == null) return null;
    const serving = parseFloat(String(p.serving_size || '').replace(',', '.')) || null;
    return {
      per100: { kcal: Math.round(kcal), p: r1(n.proteins_100g || 0), c: r1(n.carbohydrates_100g || 0), f: r1(n.fat_100g || 0) },
      serving: serving && serving < 2000 ? serving : null,
    };
  }

  const NUM_WORDS = { ein: 1, eine: 1, einen: 1, einem: 1, zwei: 2, drei: 3, vier: 4, fuenf: 5, halbe: 0.5, halben: 0.5, halbes: 0.5 };

  /** "ein Apfel und zwei Scheiben Toast, 200 g Nudeln" -> [{ food, grams }] */
  function parseFoodText(text) {
    const parts = String(text || '').split(/\s*(?:,|;|\bund\b|\bmit\b|\bsowie\b|\n)\s*/i).map((s) => s.trim()).filter(Boolean);
    const out = [];
    for (const raw of parts) {
      let s = norm(raw).replace(/\b(ich habe|hatte|gegessen|getrunken|zum fruehstueck|zu mittag|zum abendessen)\b/g, ' ').trim();
      let grams = null, count = 1;
      let m = s.match(/(\d+(?:[.,]\d+)?)\s*(g|gramm|ml)\b/);
      if (m) { grams = parseFloat(m[1].replace(',', '.')); s = s.replace(m[0], ' '); }
      m = s.match(/^(\d+(?:[.,]\d+)?|ein|eine|einen|einem|zwei|drei|vier|fuenf|halbe|halben|halbes)\b/);
      if (m) { count = NUM_WORDS[m[1]] || parseFloat(m[1].replace(',', '.')); s = s.slice(m[0].length); }
      s = s.replace(/\b(stueck|scheiben?|glas|glaeser|tassen?|teller|portionen?|schalen?|becher|dosen?|handvoll|kugeln?|riegel|flaschen?|loeffel|essloeffel|teeloeffel)\b/g, ' ').replace(/\s+/g, ' ').trim();
      if (!s) continue;
      const food = searchFoods(s, 1)[0];
      if (!food) { out.push({ food: null, text: raw, grams }); continue; }
      out.push({ food, grams: Math.round(grams || food.portion * count), text: raw });
    }
    return out;
  }

  /** JSON-Schema für die KI-Schätzung aus einem Foto. */
  const PHOTO_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['items', 'note'],
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'grams', 'kcal', 'protein_g', 'carbs_g', 'fat_g'],
          properties: {
            name: { type: 'string', description: 'Deutscher Name des Lebensmittels/Gerichts' },
            grams: { type: 'number', description: 'Geschätzte Menge in Gramm (Getränke in ml)' },
            kcal: { type: 'number' },
            protein_g: { type: 'number' },
            carbs_g: { type: 'number' },
            fat_g: { type: 'number' },
          },
        },
      },
      note: { type: 'string', description: 'Kurzer Hinweis auf Deutsch, z. B. Unsicherheiten der Schätzung; leer, wenn keiner' },
    },
  };

  /** Ergebnis der KI prüfen und in Einträge umwandeln (unplausible Werte verwerfen). */
  function fromPhotoEstimate(json) {
    if (!json || !Array.isArray(json.items)) return [];
    return json.items
      .filter((i) => i && typeof i.name === 'string' && i.name.trim() && Number.isFinite(i.kcal) && i.kcal >= 0 && i.kcal < 5000 && i.grams >= 0 && i.grams < 5000)
      .map((i) => ({ name: i.name.trim().slice(0, 80), grams: Math.round(i.grams), kcal: Math.round(i.kcal), p: r1(i.protein_g || 0), c: r1(i.carbs_g || 0), f: r1(i.fat_g || 0) }));
  }

  return { FOODS, searchFoods, scale, ACTIVITY, GOALS, dailyGoal, totals, MEALS, mealForHour, burned, parseNutritionLabel, fromOpenFoodFacts, parseFoodText, PHOTO_SCHEMA, fromPhotoEstimate };
});
