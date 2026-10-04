const test = require('node:test');
const assert = require('node:assert');
const F = require('../kuehlschrank/life.js');

const TODAY = new Date(2026, 9, 3); // Sa 03.10.2026

test('Aufgaben in normaler Sprache', () => {
  const p = (t) => F.parseTaskText(t, TODAY);
  assert.deepEqual(p('Müll rausbringen jeden Dienstag'), { title: 'Müll rausbringen', due: '2026-10-06', time: '', priority: 0, repeat: 'weekly', category: 'haushalt' });
  assert.deepEqual(p('Steuererklärung bis 31.10. wichtig'), { title: 'Steuererklärung', due: '2026-10-31', time: '', priority: 1, repeat: 'none', category: 'finanzen' });
  assert.deepEqual(p('Mama anrufen morgen um 18 Uhr'), { title: 'Mama anrufen', due: '2026-10-04', time: '18:00', priority: 0, repeat: 'none', category: 'familie' });
  assert.equal(p('Bad putzen am Freitag').due, '2026-10-09');
  assert.equal(p('Vitamine nehmen täglich').repeat, 'daily');
  assert.equal(p('Geschenk kaufen nächste Woche !!').priority, 2);
  assert.equal(p('Rechnung bezahlen in 3 Tagen').due, '2026-10-06');
  assert.deepEqual([p('Präsentation 14:30').due, p('Präsentation 14:30').time, p('Präsentation 14:30').category], ['2026-10-03', '14:30', 'arbeit']);
  assert.equal(p('Fenster putzen').due, null);
  assert.equal(p('Zahnarzt am 2.1.').due, '2027-01-02'); // schon vorbei -> nächstes Jahr
});

test('Wiederkehrende Aufgaben abhaken', () => {
  assert.equal(F.nextDue('2026-10-01', 'weekly', TODAY), '2026-10-08');
  assert.equal(F.nextDue('2026-10-02', 'weekdays', TODAY), '2026-10-05');
  assert.equal(F.nextDue('2026-01-31', 'monthly', new Date(2026, 1, 10)), '2026-02-28');
  assert.equal(F.nextDue('2026-10-03', 'daily', TODAY), '2026-10-04');
  const once = F.completeTask({ title: 'x', due: '2026-10-03', repeat: 'none' }, TODAY);
  assert.equal(once.done, true);
  const rep = F.completeTask({ title: 'Bad', due: '2026-10-03', repeat: 'weekly' }, TODAY);
  assert.deepEqual([rep.done, rep.due, rep.lastDone, rep.doneCount], [undefined, '2026-10-10', '2026-10-03', 1]);
});

test('Aufgaben-Gruppen und Putzplan', () => {
  const b = F.taskBuckets([
    { title: 'a', due: '2026-10-01' }, { title: 'b', due: '2026-10-03', priority: 0 }, { title: 'c', due: '2026-10-03', priority: 2 },
    { title: 'd', due: '2026-10-04' }, { title: 'e', due: '2026-10-08' }, { title: 'f', due: '2026-12-01' }, { title: 'g' }, { title: 'h', done: true, doneAt: '2026-10-02' },
  ], TODAY);
  assert.deepEqual(Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.map((t) => t.title).join('')])),
    { overdue: 'a', today: 'cb', tomorrow: 'd', week: 'e', later: 'f', someday: 'g', done: 'h' });
  const plan = F.cleaningTasks(TODAY);
  assert.equal(plan.length, F.CLEANING_PLAN.length);
  assert.ok(plan.every((t) => t.due >= '2026-10-03' && t.repeat !== 'none' && t.category === 'haushalt'));
  assert.equal(plan.find((t) => t.title === 'Staubsaugen').due, '2026-10-03'); // Samstag = heute
});

test('Gewohnheiten: Serie, Woche, Quote', () => {
  const h = { id: 'w', target: 8, created: '2026-09-24' };
  const log = { '2026-10-03': { w: 8 }, '2026-10-02': { w: 9 }, '2026-10-01': { w: 8 }, '2026-09-30': { w: 3 }, '2026-09-29': { w: 8 } };
  assert.equal(F.habitStreak(log, h, TODAY), 3);
  assert.equal(F.habitStreak({ ...log, '2026-10-03': { w: 2 } }, h, TODAY), 2); // heute noch offen
  assert.deepEqual(F.habitWeek(log, h, TODAY).map((d) => d.met), [false, false, true, false, true, true, true]);
  assert.equal(F.habitRate(log, h, 30, TODAY), 40); // 4 von 10 Tagen seit Anlage
});

test('Gesundheit: BMI, Gewicht, Stimmung', () => {
  assert.equal(F.bmi(80, 180), 24.7);
  assert.equal(F.bmiLabel(24.7), 'Normalgewicht');
  assert.equal(F.bmiLabel(31), 'Adipositas');
  assert.equal(F.bmi(80, 0), null);
  const w = F.weightStats([{ date: '2026-09-01', kg: 84 }, { date: '2026-09-26', kg: 82.4 }, { date: '2026-10-03', kg: 81.9 }], TODAY);
  assert.deepEqual([w.last.kg, w.change7, w.change30, w.min, w.max], [81.9, -0.5, -2.1, 81.9, 84]);
  assert.equal(F.weightStats([]), null);
  assert.match(F.sparkPath([1, 3, 2], 100, 40), /^M4\.0 36\.0 L50\.0 4\.0 L96\.0 20\.0$/);
  assert.deepEqual(F.moodStats({ '2026-10-03': { mood: 4, sleep: 7 }, '2026-10-01': { mood: 2, sleep: 6 }, '2026-09-01': { mood: 1 } }, 7, TODAY), { days: 2, mood: 3, sleep: 6.5 });
});

test('Wetter: Codes und Tipps', () => {
  assert.equal(F.weatherInfo(0).text, 'Sonnig');
  assert.equal(F.weatherInfo(63).emoji, '🌧️');
  assert.ok(F.weatherTips({ code: 61, rain: 80, min: 8, max: 14 }).includes('Regenschirm mitnehmen'));
  assert.ok(F.weatherTips({ code: 0, rain: 0, min: -3, max: 4 })[0].startsWith('Frost'));
  assert.ok(F.weatherTips({ code: 0, rain: 0, min: 16, max: 30 }).includes('Heiß – viel trinken, Sonnencreme'));
});
