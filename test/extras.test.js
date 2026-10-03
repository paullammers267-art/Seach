const test = require('node:test');
const assert = require('node:assert');
const X = require('../kuehlschrank/extras.js');

const TODAY = new Date(2026, 9, 3); // Sa 03.10.2026

test('Küchen-Umrechner', () => {
  assert.equal(X.convertKitchen(1, 'tasse', 'g', 'mehl'), 125);
  assert.equal(X.convertKitchen(250, 'g', 'tasse', 'zucker'), 1.25);
  assert.equal(X.convertKitchen(3, 'el', 'ml'), 45);
  assert.equal(X.convertKitchen(100, 'g', 'el', 'butter'), 7.05);
  assert.equal(X.convertKitchen(1, 'l', 'tasse'), 4.17);
  assert.equal(X.convertKitchen('x', 'g', 'ml'), null);
  assert.equal(X.fToC(350), 177);
  assert.equal(X.cToF(180), 356);
  assert.equal(X.toUmluft(200), 180);
});

test('Rechnung teilen auf den Cent genau', () => {
  assert.deepEqual(X.splitBill(100, 3, 10), { total: 110, tip: 10, each: 36.66, first: 36.68 });
  assert.deepEqual(X.splitBill(45.5, 2, 0), { total: 45.5, tip: 0, each: 22.75, first: 22.75 });
  const r = X.splitBill(87.3, 4, 15);
  assert.equal(Math.round((r.each * 3 + r.first) * 100), Math.round(r.total * 100));
});

test('Medikamente: Plan und Vorrat', () => {
  const meds = [
    { id: 'a', name: 'Vitamin D', times: ['08:00'], amount: 1, stock: 20, days: null },
    { id: 'b', name: 'Blutdruck', times: ['20:00', '08:00'], amount: 1, stock: 30, days: null },
    { id: 'c', name: 'Wochenpille', times: ['09:00'], amount: 1, stock: 4, days: [1] },
  ];
  const doses = X.dosesOn(meds, '2026-10-03', { 'a@2026-10-03T08:00': true });
  assert.deepEqual(doses.map((d) => `${d.med.id} ${d.time} ${d.taken}`), ['a 08:00 true', 'b 08:00 false', 'b 20:00 false']);
  assert.equal(X.dosesOn(meds, '2026-10-05').length, 4); // Montag: Wochenpille dazu
  assert.equal(X.stockDays(meds[0]), 20);
  assert.equal(X.stockDays(meds[1]), 15);
  assert.equal(X.stockDays(meds[2]), 28);
  assert.equal(X.stockDays({ times: ['08:00'] }), null);
});

test('Fristen und Dokumente', () => {
  assert.equal(X.expiryFrom('2018-05-20', 10), '2028-05-20');
  assert.deepEqual(X.deadlineStatus({ type: 'tuev', date: '2026-10-20' }, TODAY), { left: 17, state: 'due', remindDate: '2026-09-20' });
  assert.equal(X.deadlineStatus({ type: 'ausweis', date: '2027-10-01' }, TODAY).state, 'ok');
  assert.equal(X.deadlineStatus({ type: 'garantie', date: '2026-10-01' }, TODAY).state, 'overdue');
  assert.equal(X.deadlineStatus({ type: 'garantie', date: '2026-12-01', remind: 90 }, TODAY).state, 'due');
});

test('Zählerstände: Verbrauch, Hochrechnung, Kosten', () => {
  const s = X.meterStats([{ date: '2026-01-01', value: 10000 }, { date: '2026-07-01', value: 11450 }, { date: '2026-10-01', value: 11850 }], 0.35, 120);
  assert.equal(s.perDay, 6.78); // 1850 kWh in 273 Tagen
  assert.equal(s.lastPerDay, 4.35);
  assert.equal(s.year, 2473);
  assert.equal(s.costYear, 986);
  assert.equal(s.costMonth, 82);
  assert.equal(s.trend, -36);
  assert.deepEqual(s.lastPeriod, { from: '2026-07-01', to: '2026-10-01', used: 400 });
  assert.equal(X.meterStats([{ date: '2026-01-01', value: 1 }]), null);
});

test('Sparziele', () => {
  assert.deepEqual(X.savingsPlan({ target: 1200, saved: 300, until: '2027-04-01' }, TODAY), { pct: 25, left: 900, perMonth: 150, months: 6, done: false });
  assert.equal(X.savingsPlan({ target: 500, saved: 600 }).done, true);
  assert.equal(X.savingsPlan({ target: 500, saved: 100 }).perMonth, null);
});

test('Atemübung, Zufall, Vorlagen', () => {
  assert.deepEqual(X.breathingPhase('box', 0), { name: 'Einatmen', left: 4, dur: 4, index: 0, cycle: 0 });
  assert.deepEqual(X.breathingPhase('box', 9.5), { name: 'Ausatmen', left: 2.5, dur: 4, index: 2, cycle: 0 });
  assert.equal(X.breathingPhase('478', 20).cycle, 1);
  assert.equal(X.pick(['A', ' ', 'B'], () => 0.99), 'B');
  assert.equal(X.pick([]), null);
  assert.ok(X.NOTE_TEMPLATES.every((t) => t.title && t.text));
});

test('Erfolge', () => {
  const s = {
    items: [{}], history: Array.from({ length: 12 }, (_, i) => ({ kind: 'consumed', date: '2026-09-' + String(10 + i).padStart(2, '0') })),
    habits: [{ id: 'h', target: 1 }], habitLog: Object.fromEntries(Array.from({ length: 8 }, (_, i) => ['2026-09-' + String(20 + i), { h: 1 }])),
    tasks: [{ done: true }, { doneCount: 3 }], workouts: [{}], customRecipes: [], plan: {}, food: [], expenses: [], savings: [{ target: 100, saved: 100 }],
  };
  const a = Object.fromEntries(X.achievements(s, '2026-10-03').map((x) => [x.id, x]));
  assert.ok(a['retter-10'].done && a['null-muell'].done && a['gewohnheit-7'].done && a['sparer'].done && a['erstes-training'].done);
  assert.ok(!a['retter-50'].done && Math.abs(a['retter-50'].progress - 0.24) < 0.001);
  assert.equal(X.longestStreak(s.habitLog, s.habits[0]), 8);
});
