const test = require('node:test');
const assert = require('node:assert');
const L = require('../kuehlschrank/logic.js');
const RECIPES = require('../kuehlschrank/recipes.js');

const TODAY = new Date(2026, 9, 3); // 03.10.2026

test('parseDates erkennt gängige Formate auf Verpackungen', () => {
  assert.deepEqual(L.parseDates('MHD 12.10.2026', TODAY), ['2026-10-12']);
  assert.deepEqual(L.parseDates('mindestens haltbar bis: 05.11.26 L4711', TODAY), ['2026-11-05']);
  assert.deepEqual(L.parseDates('Verbrauchen bis 7/10/26', TODAY), ['2026-10-07']);
  assert.deepEqual(L.parseDates('EXP 2027-01-15', TODAY), ['2027-01-15']);
  assert.deepEqual(L.parseDates('18 OKT 2026', TODAY), ['2026-10-18']);
  assert.deepEqual(L.parseDates('best before 3 Dec 26', TODAY), ['2026-12-03']);
  assert.deepEqual(L.parseDates('MHD 03/2027', TODAY), ['2027-03-31']);
  assert.deepEqual(L.parseDates('MHD 091026', TODAY), ['2026-10-09']);
});

test('parseDates korrigiert typische OCR-Fehler', () => {
  assert.deepEqual(L.parseDates('MHD 1O.1O.2O26', TODAY), ['2026-10-10']);
  assert.deepEqual(L.parseDates('MHD l2.1l.26', TODAY), ['2026-11-12']);
  assert.deepEqual(L.parseDates('MHD 12,10,26', TODAY), ['2026-10-12']);
});

test('parseDates bevorzugt das Datum nach MHD und verwirft Unsinn', () => {
  assert.deepEqual(L.parseDates('hergestellt 01.09.2026  MHD 20.10.2026', TODAY), ['2026-10-20', '2026-09-01']);
  assert.deepEqual(L.parseDates('Charge 31.02.2026', TODAY), []);
  assert.deepEqual(L.parseDates('12.10.1999', TODAY), []);
  assert.deepEqual(L.parseDates('Preis 1.99 EUR 250 g', TODAY), []);
  assert.deepEqual(L.parseDates('', TODAY), []);
});

test('status und statusText', () => {
  assert.equal(L.status('2026-10-01', TODAY), 'expired');
  assert.equal(L.status('2026-10-03', TODAY), 'today');
  assert.equal(L.status('2026-10-05', TODAY), 'soon');
  assert.equal(L.status('2026-10-09', TODAY), 'week');
  assert.equal(L.status('2026-11-30', TODAY), 'ok');
  assert.equal(L.status(null, TODAY), 'none');
  assert.equal(L.statusText('2026-10-04', TODAY), 'läuft morgen ab');
  assert.equal(L.statusText('2026-10-01', TODAY), 'seit 2 Tagen abgelaufen');
  assert.equal(L.formatDate('2026-10-04'), '04.10.2026');
});

test('detectIngredient ordnet Produktnamen zu', () => {
  assert.equal(L.detectIngredient('Weihenstephan H-Milch 3,5% 1 l'), 'milch');
  assert.equal(L.detectIngredient('Alpenmilch Milchschokolade'), 'schokolade');
  assert.equal(L.detectIngredient('Kokosmilch 400 ml'), 'kokosmilch');
  assert.equal(L.detectIngredient('Philadelphia Frischkäse Natur'), 'frischkaese');
  assert.equal(L.detectIngredient('Gouda jung in Scheiben'), 'kaese');
  assert.equal(L.detectIngredient('Bio Freilandeier 10 Stück'), 'eier');
  assert.equal(L.detectIngredient('Laktosefreie Milch'), 'milch');
  assert.equal(L.detectIngredient('Hähnchenbrustfilet'), 'haehnchen');
  assert.equal(L.detectIngredient('Champignons braun 250 g'), 'champignons');
  assert.equal(L.detectIngredient('Barilla Spaghetti n.5'), 'nudeln');
  assert.equal(L.detectIngredient('Irgendwas', ['en:dairies', 'en:yogurts']), 'joghurt');
  assert.equal(L.detectIngredient('Xyz'), null);
});

test('Rezepte verwenden nur bekannte Zutaten', () => {
  const ids = new Set();
  for (const r of RECIPES) {
    assert.ok(!ids.has(r.id), 'doppelte id ' + r.id);
    ids.add(r.id);
    assert.ok(r.steps.length > 0, r.id);
    for (const k of [...r.ingredients, ...(r.optional || [])]) assert.ok(L.INGREDIENTS[k], `${r.id}: unbekannte Zutat ${k}`);
  }
});

test('suggestRecipes bevorzugt Rezepte mit bald ablaufenden Zutaten', () => {
  const items = [
    { ingredient: 'eier', expiry: '2026-10-04' },
    { ingredient: 'milch', expiry: '2026-10-04' },
    { ingredient: 'mehl', expiry: null },
    { ingredient: 'nudeln', expiry: '2027-06-01' },
    { ingredient: 'passata', expiry: '2027-06-01' },
  ];
  const res = L.suggestRecipes(RECIPES, items, TODAY);
  assert.equal(res[0].recipe.id, 'pfannkuchen');
  assert.deepEqual(res[0].missing, []);
  assert.deepEqual(res[0].urgent.sort(), ['eier', 'milch']);
  assert.ok(res.some((r) => r.recipe.id === 'pasta-tomate'));
  assert.ok(!res.some((r) => r.recipe.id === 'chili'), 'Chili braucht Hack und Bohnen');
});

test('suggestExpiry nutzt typische Haltbarkeit', () => {
  assert.equal(L.suggestExpiry('hackfleisch', TODAY), '2026-10-04');
  assert.equal(L.suggestExpiry('', TODAY), '2026-10-10');
});

test('createDateVoter übernimmt nur sichere Ergebnisse', () => {
  let v = L.createDateVoter(TODAY);
  assert.equal(v.add('a5. 10. 30'), null);             // einmal gelesen, ohne MHD: noch unsicher
  assert.equal(v.add('05.10.26 L7'), null);
  assert.deepEqual(v.add('05.10.26 14:34')[0], '2026-10-05'); // zweimal gelesen
  v = L.createDateVoter(TODAY);
  assert.deepEqual(v.add('MHD 05.10.2026'), ['2026-10-05']); // direkt hinter MHD
  v = L.createDateVoter(TODAY);
  v.add('xx 07.12.26');
  assert.deepEqual(v.best(), ['2026-12-07']);
});

test('parseDates verwirft Daten mehr als 5 Jahre in der Zukunft', () => {
  assert.deepEqual(L.parseDates('05.10.34', TODAY), []);
  assert.deepEqual(L.parseDates('MHD 05.10.2029', TODAY), ['2029-10-05']);
});

test('parseTypedDate versteht schnelle Eingaben', () => {
  assert.equal(L.parseTypedDate('051026', TODAY), '2026-10-05');
  assert.equal(L.parseTypedDate('05102026', TODAY), '2026-10-05');
  assert.equal(L.parseTypedDate('5.10.26', TODAY), '2026-10-05');
  assert.equal(L.parseTypedDate('05.10.2026', TODAY), '2026-10-05');
  assert.equal(L.parseTypedDate('2010', TODAY), '2026-10-20');   // TTMM, dieses Jahr
  assert.equal(L.parseTypedDate('0110', TODAY), '2027-10-01');   // schon vorbei -> nächstes Jahr
  assert.equal(L.parseTypedDate('5.10.', TODAY), '2026-10-05');
  assert.equal(L.parseTypedDate('31.02.26', TODAY), null);
  assert.equal(L.parseTypedDate('05102', TODAY), null);
  assert.equal(L.parseTypedDate('', TODAY), null);
});
