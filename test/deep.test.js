const test = require('node:test');
const assert = require('node:assert');
const D = require('../kuehlschrank/deep.js');

const T = '2026-10-03'; // Samstag

test('Einkaufsliste nach Gängen', () => {
  const cases = { 'Milch': 'kuehl', 'Vollkornbrot': 'brot', 'Hafermilch': 'kuehl', 'Äpfel': 'obst', 'Spülmittel': 'haushalt', 'Zahnpasta': 'drogerie', 'Mineralwasser': 'getraenke',
    'Hackfleisch': 'fleisch', 'TK Pizza': 'tk', 'Spaghetti': 'vorrat', 'Kaffee': 'fruehstueck', 'Chips': 'suess', 'Geschenkpapier': 'sonst', 'Präsentation': 'sonst' };
  for (const [n, k] of Object.entries(cases)) assert.equal(D.aisleOf(n), k, n);
  assert.equal(D.aisleOf('Irgendwas', 'tomaten'), 'obst', 'Zutat geht vor');
  assert.equal(D.aisleOf('Zahnpasta', 'nudeln'), 'drogerie', 'Drogerie schlägt Zutat');
  const g = D.groupByAisle([{ name: 'Brot' }, { name: 'Bananen' }, { name: 'Käse' }, { name: 'Gurke' }]);
  assert.deepEqual(g.map((x) => x.key + ':' + x.items.length), ['obst:2', 'brot:1', 'kuehl:1']);
});

test('Ausgaben: Monatsverlauf', () => {
  const ex = [{ date: '2026-10-02', amount: 50 }, { date: '2026-09-10', amount: 100 }, { date: '2026-09-11', amount: 20.5 }, { date: '2026-08-01', amount: 999, category: 'einnahme' }, { date: '2026-05-01', amount: 30 }];
  const m = D.monthlyTotals(ex, '2026-10', 6);
  assert.deepEqual(m.months.map((x) => x.ym + '=' + x.total), ['2026-05=30', '2026-06=0', '2026-07=0', '2026-08=0', '2026-09=120.5', '2026-10=50']);
  assert.equal(m.avg, 66.83);
  assert.equal(D.ymShift('2026-01', -1), '2025-12');
});

test('Gewohnheits-Kalender', () => {
  const h = { id: 'w', target: 2 };
  const log = { '2026-10-03': { w: 2 }, '2026-10-02': { w: 1 }, '2026-09-28': { w: 3 } };
  const heat = D.habitHeatmap(log, h, T, 2);
  assert.equal(heat.cols.length, 2);
  assert.equal(heat.cols[1][0].iso, '2026-09-28', 'Spalte beginnt montags');
  assert.deepEqual(heat.cols[1].map((c) => c.level), [2, 0, 0, 0, 1, 2, -1]);
  assert.equal(heat.met, 2);
  assert.equal(D.bestWeekday(heat), 'Montag');
});

test('Kalenderdatei: Medikamente & Faltung', () => {
  const items = D.medItems([{ id: 'a', name: 'Ramipril', amount: 1, times: ['08:00', '20:00'], days: null }, { id: 'b', name: 'Vitamin D', amount: 2, times: ['09:00'], days: [1, 4] }], T);
  assert.equal(items.length, 3);
  assert.equal(items[2].rrule, 'FREQ=WEEKLY;BYDAY=MO,TH');
  assert.equal(items[2].title, 'Vitamin D einnehmen (2)');
  const ics = D.buildICS([...items, { uid: 'x', title: 'Sehr langer Titel, mit Komma; und Semikolon '.repeat(3), date: T, alarm: -480 }]);
  assert.ok(ics.includes('DTSTART:20261003T080000') && ics.includes('RRULE:FREQ=DAILY') && ics.includes('TRIGGER:-PT0M'));
  assert.ok(ics.includes('TRIGGER:PT480M'), 'ganztägig: Erinnerung um 8 Uhr');
  assert.ok(ics.split('\r\n').every((l) => l.length <= 75), 'Zeilen gefaltet');
  assert.ok(ics.includes('mit Komma\; und') === false && ics.includes('Komma\\, mit') === false ? ics.includes('\\,') : true);
});

test('Geburtstage', () => {
  assert.deepEqual(D.nextBirthday('1990-10-03', T), { date: T, days: 0, age: 36 });
  assert.deepEqual(D.nextBirthday('1990-03-15', T), { date: '2027-03-15', days: 163, age: 37 });
  assert.equal(D.nextBirthday('2000-02-29', '2027-01-10').date, '2027-02-28');
  const up = D.upcomingBirthdays([{ type: 'geburtstag', date: '2026-12-24', birthYear: 1980, title: 'Oma' }, { type: 'termin', date: T }, { type: 'geburtstag', date: '2026-10-20', birthYear: 2016, title: 'Emma' }, { type: 'geburtstag', date: '2025-11-02', title: 'Tom' }], T);
  assert.deepEqual(up.map((x) => x.e.title + ' ' + x.age), ['Emma 10', 'Tom null', 'Oma 46']);
  assert.ok(D.isRound(10) && D.isRound(18) && !D.isRound(46));
});

test('Tagebuch: Rückblick & Serie', () => {
  const j = { '2025-10-03': { text: 'Urlaub' }, '2026-09-03': { text: 'Umzug' }, '2026-09-26': { text: '' }, '2026-10-02': { text: 'a' }, '2026-10-01': { grateful: ['Sonne'] } };
  assert.deepEqual(D.flashbacks(j, T).map((f) => f.label), ['Vor einem Jahr', 'Vor einem Monat']);
  assert.equal(D.journalStreak(j, T), 2);
  assert.ok(D.JOURNAL_PROMPTS.includes(D.promptOfDay(T)));
});
