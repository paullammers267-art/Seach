const test = require('node:test');
const assert = require('node:assert');
const O = require('../kuehlschrank/organize.js');

const T = '2026-10-03';

test('Monate addieren am Monatsende', () => {
  assert.equal(O.addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(O.addMonths('2026-03-15', -3), '2025-12-15');
});

test('Verträge: Laufzeit, Kündigungstag, Kosten', () => {
  // Handy seit 01.11.2024, 24 Monate, danach monatlich, 1 Monat Frist
  const h = { start: '2024-11-01', min: 24, renew: 1, notice: 1, unit: 'm', cost: 30, interval: 'monat' };
  // Frist zum 01.11.2026 war der 01.10. – verpasst → nächstes Ende 01.12., kündigen bis 01.11. (29 Tage)
  assert.deepEqual(O.contractInfo(h, T), { end: '2026-12-01', cancelBy: '2026-11-01', left: 29, state: 'soon' });
  // Versicherung jährlich, 3 Monate Frist: Frist 01.10.2026 verpasst → Ende 01.01.2028
  const v = { start: '2020-01-01', min: 12, renew: 12, notice: 3, unit: 'm', cost: 120, interval: 'jahr' };
  assert.deepEqual(O.contractInfo(v, T), { end: '2028-01-01', cancelBy: '2027-10-01', left: 363, state: 'running' });
  // 2 Wochen Frist
  assert.equal(O.contractInfo({ start: '2026-09-15', min: 1, renew: 1, notice: 2, unit: 'w' }, T).cancelBy, '2026-11-01');
  assert.equal(O.contractInfo({ start: '2026-09-20', min: 1, renew: 1, notice: 2, unit: 'w' }, T).cancelBy, '2026-10-06');
  // gekündigt
  assert.equal(O.contractInfo({ start: '2025-01-01', min: 12, cancelled: '2026-09-01', endDate: '2026-12-31' }, T).state, 'cancelled');
  assert.deepEqual(O.contractTotals([h, v, { cost: 9.99, interval: 'monat' }, { cost: 50, cancelled: '2026-01-01' }]), { month: 49.99, year: 599.88, count: 3 });
});

test('Checklisten: tägliche Routinen zurücksetzen', () => {
  const l = [{ daily: true, lastReset: '2026-10-02', items: [{ done: true }, { done: false }] }, { daily: false, items: [{ done: true }] }];
  assert.equal(O.resetChecklists(l, T), true);
  assert.deepEqual(l[0].items.map((i) => i.done), [false, false]);
  assert.equal(l[1].items[0].done, true, 'Einmal-Liste bleibt');
  assert.equal(O.resetChecklists(l, T), false);
  assert.deepEqual(O.checklistProgress(l[1]), { done: 1, total: 1 });
});

test('Stundenplan', () => {
  const plan = { entries: [{ day: 1, start: '09:45', end: '10:30', title: 'Deutsch' }, { day: 1, start: '08:00', end: '08:45', title: 'Mathe' }, { day: 2, start: '08:00', title: 'Sport' }] };
  const mo = O.dayEntries(plan, 1);
  assert.deepEqual(mo.map((e) => e.title), ['Mathe', 'Deutsch']);
  const nn = O.nowAndNext(mo, 8 * 60 + 20);
  assert.deepEqual([nn.now.title, nn.next.title], ['Mathe', 'Deutsch']);
  assert.equal(O.nowAndNext(mo, 9 * 60).now, null);
  assert.equal(O.subjectColor('Mathe'), O.subjectColor('mathe'));
});

test('Rechner', () => {
  assert.deepEqual(O.discount(79.99, 25), { save: 20, final: 59.99 });
  assert.deepEqual(O.vat(119, 19, true), { net: 100, gross: 119, tax: 19 });
  assert.deepEqual(O.vat(100, 7, false), { net: 100, gross: 107, tax: 7 });
  assert.equal(O.pctChange(80, 100), 25);
  assert.deepEqual(O.bedtimes('06:30').map((b) => b.time), ['21:15', '22:45', '00:15']);
  assert.deepEqual(O.wakeTimes('23:00').map((b) => b.time), ['05:15', '06:45', '08:15']);
});
