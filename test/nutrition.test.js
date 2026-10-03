const test = require('node:test');
const assert = require('node:assert');
const N = require('../kuehlschrank/nutrition.js');

test('Lebensmittel-Datenbank ist plausibel', () => {
  const names = new Set();
  for (const f of N.FOODS) {
    assert.ok(!names.has(f.name), 'doppelt: ' + f.name); names.add(f.name);
    assert.ok(f.kcal >= 0 && f.kcal <= 900, f.name);
    // Makros passen grob zu den Kalorien (4/4/9 kcal pro g, Alkohol ausgenommen)
    const est = f.p * 4 + f.c * 4 + f.f * 9;
    if (!/Bier|Wein/.test(f.name) && f.kcal > 20) assert.ok(Math.abs(est - f.kcal) / f.kcal < 0.3, `${f.name}: ${f.kcal} vs ${est}`);
    assert.ok(f.portion > 0 && f.portionLabel, f.name);
  }
  assert.ok(N.FOODS.length >= 100);
});

test('Suche und Text-Eingabe', () => {
  assert.equal(N.searchFoods('nudeln')[0].name, 'Nudeln (gekocht)');
  assert.equal(N.searchFoods('Döner')[0].name, 'Döner Kebab');
  assert.deepEqual(N.searchFoods(''), []);
  const r = N.parseFoodText('Ich habe einen Apfel und zwei Scheiben Toast gegessen, 200 g Nudeln, ein Glas Milch');
  assert.deepEqual(r.map((x) => [x.food.name, x.grams]), [['Apfel', 150], ['Toastbrot', 56], ['Nudeln (gekocht)', 200], ['Milch (3,5 %)', 200]]);
  assert.deepEqual(N.scale({ kcal: 250, p: 8.2, c: 30, f: 9.5 }, 40), { kcal: 100, p: 3.3, c: 12, f: 3.8 });
});

test('Kalorienziel nach Mifflin-St Jeor', () => {
  const w = N.dailyGoal({ sex: 'w', age: 35, height: 168, weight: 70, activity: 1.375, goal: 'lose' });
  assert.deepEqual([w.bmr, w.tdee, w.kcal], [1414, 1944, 1440]);
  assert.ok(Math.abs(w.protein * 4 + w.carbs * 4 + w.fat * 9 - w.kcal) < 15);
  assert.equal(N.dailyGoal({ sex: 'm', age: 40, height: 180, weight: 85, activity: 1.55, goal: 'keep' }).kcal, 2760);
  assert.equal(N.dailyGoal({ sex: 'w', age: 80, height: 150, weight: 45, activity: 1.2, goal: 'lose' }).kcal, 1200); // Untergrenze
  assert.equal(N.dailyGoal({ sex: 'w', height: 168, weight: 70 }), null);
});

test('Tagessumme, Mahlzeit, Training', () => {
  assert.deepEqual(N.totals([{ kcal: 100, p: 1.25, c: 2, f: 3 }, { kcal: 250.4, p: 1.3, c: 0, f: 0 }]), { kcal: 350, p: 2.6, c: 2, f: 3 });
  assert.deepEqual([7, 12, 16, 19, 23].map(N.mealForHour), ['fruehstueck', 'mittag', 'snack', 'abend', 'snack']);
  assert.equal(N.burned({ seconds: 1200, focus: 'ganz' }, 80), 133);
});

test('Nährwerttabelle, Open Food Facts', () => {
  assert.deepEqual(N.parseNutritionLabel('Nährwerte pro 100 g\nBrennwert 1046 kJ / 250 kcal\nFett 9,5 g\ndavon gesättigte Fettsäuren 6 g\nKohlenhydrate 30 g\ndavon Zucker 20 g\nEiweiß 8,2 g'), { kcal: 250, p: 8.2, c: 30, f: 9.5 });
  assert.deepEqual(N.parseNutritionLabel('Energy 1500 kJ\nFat 3.1 g\nCarbohydrate 70 g\nProtein 10 g'), { kcal: 359, p: 10, c: 70, f: 3.1 });
  assert.equal(N.parseNutritionLabel('Zutaten: Milch, Zucker'), null);
  assert.deepEqual(N.fromOpenFoodFacts({ nutriments: { 'energy-kcal_100g': 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9 }, serving_size: '15 g' }),
    { per100: { kcal: 539, p: 6.3, c: 57.5, f: 30.9 }, serving: 15 });
  assert.equal(N.fromOpenFoodFacts({ nutriments: {} }), null);
});

test('Nährwerttabelle: typische Lesefehler der Texterkennung', () => {
  const ocr1 = 'Néahrwerte pro 100 g\n\nBrennwert 1046 kJ / 250 kcal\nFett 9,59\n\ndavon gesattigte Fettsauren 6,0 g\nKohlenhydrate 30 g\n\ndavon Zucker 20 g\n\nEiweil3 8,2 g\n\nSalz 0,30 g\n';
  const ocr2 = 'N&hrwerte pro 100 g\n\nBrennwert 1046 kJ / 250 kcal\nFett9,5g\n\ndavon geséttigte Fettsauren 6,0 g\nKohlenhydrate 30 g\n\ndavon Zucker 20 g\n\nEiwei 8,2 g\n\nSalz 0,30 g\n';
  assert.deepEqual(N.parseNutritionLabel(ocr1), { kcal: 250, p: 8.2, c: 30, f: 9.5 });
  assert.deepEqual(N.parseNutritionLabel(ocr2), { kcal: 250, p: 8.2, c: 30, f: 9.5 });
});
