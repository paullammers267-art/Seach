const test = require('node:test');
const assert = require('node:assert');
const S = require('../kuehlschrank/sport.js');
const P = require('../kuehlschrank/planner.js');
const L = require('../kuehlschrank/logic.js');

const TODAY = new Date(2026, 9, 3); // Sa 03.10.2026

test('Übungen sind vollständig beschrieben', () => {
  const ids = new Set();
  for (const e of S.EXERCISES) {
    assert.ok(!ids.has(e.id), 'doppelt: ' + e.id); ids.add(e.id);
    assert.ok(e.name && e.emoji && e.cues && [1, 2, 3].includes(e.level), e.id);
    if (e.kind === 'main') assert.ok(S.GROUPS[e.group], e.id);
  }
});

test('Workout-Generator: Dauer, Aufbau, leise, Level', () => {
  for (const minutes of [10, 20, 30]) {
    for (const focus of Object.keys(S.FOCUS)) {
      for (const level of [1, 2, 3]) {
        for (const quiet of [false, true]) {
          const w = S.generateWorkout({ minutes, focus, level, quiet, seed: minutes * 7 + level });
          assert.ok(Math.abs(w.totalSeconds - minutes * 60) <= 90, `${minutes}/${focus}/${level}: ${w.totalSeconds}s`);
          for (const st of w.steps) {
            if (st.id === 'pause') continue;
            const e = S.byId(st.id);
            assert.ok(e, st.id);
            if (quiet) assert.ok(e.quiet, `leise, aber ${e.id}`);
            assert.ok(e.level <= level, `Level ${level}, aber ${e.id}`);
          }
          assert.notEqual(w.steps[w.steps.length - 1].phase, 'rest');
        }
      }
    }
  }
  const w = S.generateWorkout({ minutes: 20, focus: 'beine', level: 1, seed: 3 });
  assert.equal(w.steps[0].phase, 'warmup');
  assert.equal(w.steps[w.steps.length - 1].phase, 'cooldown');
  assert.ok(w.steps.filter((s) => s.phase === 'work').every((s) => S.byId(s.id).group === 'beine'));
  assert.deepEqual(S.generateWorkout({ minutes: 20, seed: 5 }).steps, S.generateWorkout({ minutes: 20, seed: 5 }).steps);
  const seven = S.sevenMinute(true);
  assert.equal(seven.exercises, 12);
  assert.ok(seven.steps.every((s) => s.id === 'pause' || S.byId(s.id).quiet));
});

test('Trainings-Serie und Woche', () => {
  const w = [{ date: '2026-10-03', seconds: 600 }, { date: '2026-10-02', seconds: 1200 }, { date: '2026-10-01', seconds: 600 }, { date: '2026-09-28', seconds: 300 }];
  assert.equal(S.streak(w, TODAY), 3);
  assert.equal(S.streak(w.slice(1), TODAY), 2); // heute noch nicht trainiert – Serie zählt bis gestern
  assert.equal(S.streak([], TODAY), 0);
  assert.deepEqual(S.thisWeek(w, TODAY), { count: 4, sessions: 4, minutes: 45, from: '2026-09-28', to: '2026-10-04' });
});

test('Kalender: Wiederholungen', () => {
  const muell = { id: 'm', date: '2026-10-02', repeat: 'biweekly' };
  assert.ok(P.occursOn(muell, '2026-10-16'));
  assert.ok(!P.occursOn(muell, '2026-10-09'));
  assert.ok(!P.occursOn(muell, '2026-09-18'));
  const miete = { id: 'x', date: '2026-01-31', repeat: 'monthly' };
  assert.ok(P.occursOn(miete, '2026-02-28'));
  assert.ok(P.occursOn(miete, '2026-04-30'));
  const geb = { id: 'g', date: '1990-10-05', repeat: 'yearly', birthYear: 1990 };
  assert.ok(P.occursOn(geb, '2026-10-05'));
  assert.equal(P.ageOn(geb, '2026-10-05'), 36);
  const kurs = { id: 'k', date: '2026-10-01', repeat: 'weekly', until: '2026-10-15' };
  assert.deepEqual(P.occurrences([kurs], '2026-10-01', '2026-10-31').map((o) => o.date), ['2026-10-01', '2026-10-08', '2026-10-15']);
  const grid = P.monthGrid(2026, 9);
  assert.equal(grid[0][0].iso, '2026-09-28');
  assert.ok(grid[0][0].out && !grid[0][3].out);
  assert.equal(grid.flat().filter((d) => !d.out).length, 31);
});

test('Kalender: Erinnerungen und iCal-Export', () => {
  const ev = { id: 'a', title: 'Zahnarzt', type: 'arzt', date: '2026-10-05', time: '14:30', remind: 60 };
  const before = new Date(2026, 9, 5, 13, 0).getTime();
  const at = new Date(2026, 9, 5, 13, 31).getTime();
  assert.equal(P.dueReminders([ev], before).length, 0);
  assert.equal(P.dueReminders([ev], at).length, 1);
  assert.equal(P.dueReminders([ev], at, ['a@2026-10-05']).length, 0);
  assert.equal(P.dueReminders([ev], new Date(2026, 9, 5, 16, 0).getTime()).length, 0); // längst vorbei
  const ics = P.toICS([ev, { id: 'b', title: 'Müll, gelb', type: 'muell', date: '2026-10-02', repeat: 'biweekly' }], new Date(Date.UTC(2026, 9, 3)));
  assert.match(ics, /DTSTART:20261005T143000\r\n/);
  assert.match(ics, /DTEND:20261005T153000/);
  assert.match(ics, /TRIGGER:-PT60M/);
  assert.match(ics, /SUMMARY:🗑️ Müll\\, gelb/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261002/);
  assert.match(ics, /RRULE:FREQ=WEEKLY;INTERVAL=2/);
});

test('Ausgaben: Text erkennen, Kategorien', () => {
  assert.deepEqual(P.parseExpenseText('12,50 Tanken'), { amount: 12.5, note: 'Tanken', category: 'mobilitaet' });
  assert.deepEqual(P.parseExpenseText('Pizza bei Luigi 23 Euro 40'), { amount: 23.4, note: 'Pizza Luigi', category: 'essen' });
  assert.deepEqual(P.parseExpenseText('Miete 850'), { amount: 850, note: 'Miete', category: 'wohnen' });
  assert.equal(P.parseExpenseText('Apotheke 8.99 €').category, 'gesundheit');
  assert.equal(P.parseExpenseText('Einkauf Aldi 34,20').category, 'lebensmittel');
  assert.equal(P.parseExpenseText('ohne Betrag'), null);
  assert.equal(P.detectExpenseCategory('Netflix'), 'abos');
});

test('Ausgaben: Monat, Fixkosten, Budget, CSV', () => {
  const ex = [
    { id: '1', date: '2026-10-02', amount: 34.2, category: 'lebensmittel', note: 'Aldi' },
    { id: '2', date: '2026-09-30', amount: 10, category: 'freizeit', note: 'Kino' },
    { id: '3', date: '2026-01-31', amount: 850, category: 'wohnen', note: 'Miete', repeat: 'monthly' },
    { id: '4', date: '2026-10-03', amount: 12.5, category: 'mobilitaet', note: 'Tanken' },
  ];
  const oct = P.monthEntries(ex, '2026-10');
  assert.deepEqual(oct.map((e) => e.date), ['2026-10-31', '2026-10-03', '2026-10-02']);
  const sum = P.summarize(oct);
  assert.equal(sum.total, 896.7);
  assert.deepEqual(sum.byCategory[0], { category: 'wohnen', amount: 850 });
  assert.equal(P.monthEntries(ex, '2026-02').find((e) => e.note === 'Miete').date, '2026-02-28');
  assert.equal(P.monthEntries(ex, '2025-12').length, 0);
  const b = P.budgetStatus(400, 1000, '2026-10', TODAY);
  assert.deepEqual(b, { budget: 1000, left: 600, pct: 40, perDay: 20.69, over: false });
  assert.equal(P.budgetStatus(10, 0, '2026-10'), null);
  const csv = P.toCSV(oct);
  assert.match(csv, /^﻿Datum;Betrag;Kategorie;Notiz;Fixkosten\r\n31\.10\.2026;850,00;"Wohnen & Energie";"Miete";ja/);
  assert.equal(P.shiftMonth('2026-01', -1), '2025-12');
  assert.equal(P.monthLabel('2026-10'), 'Oktober 2026');
});

test('Kassenbon-Endbetrag', () => {
  assert.equal(L.parseReceiptTotal('ZWISCHENSUMME 3,00\nSUMME EUR 19,98\nGEGEBEN BAR 20,00'), 19.98);
  assert.equal(L.parseReceiptTotal('ZU ZAHLEN          7,45'), 7.45);
  assert.equal(L.parseReceiptTotal('MILCH 1,19'), null);
});
