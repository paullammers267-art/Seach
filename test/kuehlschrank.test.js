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

test('Öffnen und Einfrieren passen das Datum an', () => {
  assert.equal(L.afterOpening('2026-11-30', 'milch', TODAY), '2026-10-06');   // 3 Tage nach Öffnen
  assert.equal(L.afterOpening('2026-10-04', 'milch', TODAY), '2026-10-04');   // aufgedrucktes Datum früher
  assert.equal(L.afterOpening(null, null, TODAY), '2026-10-06');
  assert.equal(L.afterFreezing('hackfleisch', TODAY), '2027-01-03');
  assert.equal(L.afterFreezing('salat', TODAY), null);
});

test('expiredAdvice unterscheidet MHD und Verbrauchsdatum', () => {
  assert.match(L.expiredAdvice({ expiry: '2026-10-01' }, TODAY), /oft noch gut/);
  assert.match(L.expiredAdvice({ expiry: '2026-10-01', dateType: 'verbrauch' }, TODAY), /nicht mehr essen/);
  assert.equal(L.expiredAdvice({ expiry: '2026-10-05' }, TODAY), '');
});

test('Rezeptfilter, fehlende Zutaten, Einkaufsliste', () => {
  const carbonara = RECIPES.find((r) => r.id === 'carbonara');
  assert.equal(L.isVegetarian(carbonara), false);
  assert.equal(L.isVegetarian(RECIPES.find((r) => r.id === 'pfannkuchen')), true);
  assert.deepEqual(L.missingIngredients(carbonara, [{ ingredient: 'nudeln' }, { ingredient: 'eier' }]), ['speck', 'parmesan']);
  assert.equal(L.shoppingText([{ name: 'Milch' }, { name: 'Brot', done: true }, { name: 'Eier', note: '10 Stück' }]),
    '🛒 Einkaufsliste\n☐ Milch\n☐ Eier (10 Stück)');
});

test('nextDays, Statistik, Preise', () => {
  const days = L.nextDays(3, TODAY);
  assert.deepEqual(days.map((d) => d.iso), ['2026-10-03', '2026-10-04', '2026-10-05']);
  assert.equal(days[2].label, 'Mo 5.10.');
  const hist = [
    { date: '2026-10-01', kind: 'wasted', name: 'Salat', price: 1.5 },
    { date: '2026-10-02', kind: 'wasted', name: 'Salat', price: 1.5 },
    { date: '2026-10-02', kind: 'consumed', name: 'Milch', price: 1.1 },
    { date: '2026-09-15', kind: 'wasted', name: 'Brot' },
    { date: '2025-01-01', kind: 'wasted', name: 'Alt' },
  ];
  const m = L.monthlyStats(hist, 2, TODAY);
  assert.deepEqual(m.map((x) => [x.key, x.consumed, x.wasted, x.wastedValue]), [['2026-09', 0, 1, 0], ['2026-10', 1, 2, 3]]);
  assert.deepEqual(L.topWasted(hist, 1), [{ name: 'Salat', times: 2 }]);
  assert.equal(L.parsePrice('1,99 €'), 1.99);
  assert.equal(L.parsePrice(''), null);
});

test('Spracheingabe: Listen und Produkte mit Datum', () => {
  assert.deepEqual(L.parseSpokenList('Milch, zwei Packungen Eier und Brot'),
    [{ name: 'Milch', qty: 1 }, { name: 'Eier', qty: 2 }, { name: 'Brot', qty: 1 }]);
  assert.deepEqual(L.parseSpokenList('Ich brauche 3 Bananen sowie Butter.'), [{ name: 'Bananen', qty: 3 }, { name: 'Butter', qty: 1 }]);
  assert.deepEqual(L.parseSpokenItem('zwei Joghurt bis 12. Oktober', TODAY), { name: 'Joghurt', qty: 2, expiry: '2026-10-12' });
  assert.deepEqual(L.parseSpokenItem('Hackfleisch bis morgen', TODAY), { name: 'Hackfleisch', qty: 1, expiry: '2026-10-04' });
  assert.deepEqual(L.parseSpokenItem('Käse haltbar bis 20.10.', TODAY), { name: 'Käse', qty: 1, expiry: '2026-10-20' });
  assert.deepEqual(L.parseSpokenItem('Quark bis zum fünfzehnten', TODAY).name, 'Quark');
  assert.deepEqual(L.parseSpokenItem('Milch', TODAY), { name: 'Milch', qty: 1, expiry: null });
  assert.equal(L.relativeDate('in 5 Tagen', TODAY), '2026-10-08');
  assert.equal(L.relativeDate('nächste Woche', TODAY), '2026-10-10');
});

test('parseReceipt liest Produkte und Preise vom Kassenbon', () => {
  const bon = [
    'REWE Markt GmbH', 'Musterstr. 5', 'H-MILCH 3,5% 1L        1,19 A', 'GOUDA JUNG SCHEIBEN    2,29 A', '2 x 0,99',
    'BIO EIER 10ER          3,49 A', 'SPAGH. NO.5            1,49 A', 'HAEHNCHENBRUSTFILET    5,99 A', 'KARTOFFELN 2KG         2,99 A', 'PFAND 0,25             0,25 A', 'SUMME EUR             8,46', 'GEGEBEN BAR           10,00',
  ].join('\n');
  assert.deepEqual(L.parseReceipt(bon), [
    { name: 'H-Milch 3,5% 1l', price: 1.19, ingredient: 'milch' },
    { name: 'Gouda Jung Scheiben', price: 2.29, ingredient: 'kaese' },
    { name: 'Bio Eier 10er', price: 3.49, ingredient: 'eier' },
    { name: 'Spagh. No.5', price: 1.49, ingredient: 'nudeln' },
    { name: 'Haehnchenbrustfilet', price: 5.99, ingredient: 'haehnchen' },
    { name: 'Kartoffeln 2kg', price: 2.99, ingredient: 'kartoffeln' },
  ]);
  assert.deepEqual(L.parseReceipt(''), []);
});

test('Kochmodus-Timer und Teilen-Link', () => {
  assert.deepEqual(L.findTimers('Bei 180 °C ca. 35–40 Min. backen, dann 1,5 Std. ruhen'), [40, 90]);
  assert.deepEqual(L.findTimers('Nudeln kochen.'), []);
  assert.equal(L.formatTimer(125), '2:05');
  assert.equal(L.formatTimer(3725), '1:02:05');
  const list = [{ name: 'Käse', note: 'für Pizza' }];
  assert.deepEqual(L.decodeShare(L.encodeShare(list)), list);
  assert.equal(L.decodeShare('kaputt!!'), null);
});
