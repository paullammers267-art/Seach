const test = require('node:test');
const assert = require('node:assert');
const P = require('../kuehlschrank/plus.js');

const T = '2026-10-03';

test('Pflanzen: Gießplan', () => {
  const p = { name: 'Monstera', every: 7, added: '2026-09-20' };
  assert.deepEqual([P.plantStatus(p, T).state, P.plantStatus(p, T).left], ['overdue', -6]);
  P.waterPlant(p, T);
  const s = P.plantStatus(p, T);
  assert.equal(s.next, '2026-10-10');
  assert.equal(s.state, 'ok');
  assert.deepEqual(p.log, [T]);
  P.waterPlant(p, T);
  assert.equal(p.log.length, 1, 'gleicher Tag nicht doppelt');
  const due = P.plantsDue([p, { name: 'Basilikum', every: 2, watered: '2026-10-01' }, { name: 'Kaktus', every: 21, watered: '2026-09-01' }], T);
  assert.deepEqual(due.map((x) => x.p.name), ['Kaktus', 'Basilikum']);
});

test('Verliehen: Status', () => {
  assert.equal(P.loanStatus({ date: '2026-09-01', due: '2026-10-01' }, T).state, 'overdue');
  assert.equal(P.loanStatus({ date: '2026-09-01', due: '2026-10-04' }, T).state, 'soon');
  assert.equal(P.loanStatus({ date: '2026-09-01' }, T).since, 32);
  assert.equal(P.loanStatus({ date: '2026-09-01', returned: '2026-09-05' }, T).state, 'done');
});

test('Countdowns', () => {
  assert.equal(P.countdownInfo({ date: T }, T).text, 'heute! 🎉');
  assert.equal(P.countdownInfo({ date: '2026-10-04' }, T).text, 'morgen');
  assert.equal(P.countdownInfo({ date: '2026-10-24' }, T).text, 'noch 21 Tage (3 Wochen)');
  const y = P.countdownInfo({ date: '2020-03-15', yearly: true }, T);
  assert.equal(y.date, '2027-03-15');
  assert.equal(P.countdownInfo({ date: '2020-12-24', yearly: true }, T).date, '2026-12-24');
  assert.equal(P.countdownInfo({ date: '2026-10-13', created: '2026-09-23' }, T).progress, 50);
  const up = P.upcomingCountdowns([{ date: '2026-12-24' }, { date: '2026-09-01' }, { date: '2026-10-10' }], T);
  assert.deepEqual(up.map((x) => x.c.date), ['2026-10-10', '2026-12-24']);
});

test('Fokus-Timer: Phasen', () => {
  let s = { phase: 'focus', done: 0 };
  const seq = [];
  for (let i = 0; i < 8; i++) { s = P.nextFocusPhase(s.phase, s.done); seq.push(s.phase); }
  assert.deepEqual(seq, ['short', 'focus', 'short', 'focus', 'short', 'focus', 'long', 'focus']);
  assert.equal(P.focusMinutesOn([{ date: T, minutes: 25 }, { date: T, minutes: 25 }, { date: '2026-10-02', minutes: 50 }], T), 50);
  assert.equal(P.fmtClock(1499), '24:59');
});

test('Notfallpass & Gedanke des Tages', () => {
  assert.equal(P.ageFrom('1990-10-04', T), 35);
  assert.equal(P.ageFrom('1990-10-03', T), 36);
  assert.equal(P.telHref('0171 / 123 45-6'), 'tel:0171123456');
  assert.equal(P.thoughtOfDay(T), P.thoughtOfDay(T));
  assert.notEqual(P.thoughtOfDay(T), P.thoughtOfDay('2026-10-04'));
});
