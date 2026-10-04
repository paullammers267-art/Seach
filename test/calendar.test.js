const test = require('node:test');
const assert = require('node:assert');
const C = require('../kuehlschrank/calendar.js');
const P = require('../kuehlschrank/planner.js');

test('Woche & Überschriften', () => {
  assert.equal(C.weekStart('2026-10-04'), '2026-09-28', 'Sonntag gehört zur Woche ab Montag');
  assert.deepEqual(C.weekDays('2026-10-07').slice(0, 2), ['2026-10-05', '2026-10-06']);
  assert.equal(C.isoWeek('2026-10-05'), 41);
  assert.equal(C.isoWeek('2027-01-01'), 53);
  assert.equal(C.weekLabel('2026-10-05'), 'KW 41 · 5.–11. Okt 2026');
  assert.equal(C.weekLabel('2026-09-30'), 'KW 40 · 28. Sep–4. Okt 2026');
  assert.equal(C.weekLabel('2026-10-05', 2026), 'KW 41 · 5.–11. Okt');
  assert.equal(C.dayHeading('2026-10-04', '2026-10-03'), 'Morgen');
  assert.equal(C.dayHeading('2026-10-07', '2026-10-03'), 'Mittwoch, 7. Oktober');
  assert.equal(C.timeRange({ time: '15:30', endTime: '16:15' }), '15:30–16:15');
  assert.equal(C.timeRange({}), 'ganztägig');
});

test('Neue Wiederholungen: täglich und werktags', () => {
  const ev = (repeat) => ({ date: '2026-10-01', repeat });
  assert.ok(P.occursOn(ev('daily'), '2026-10-04'));
  assert.ok(P.occursOn(ev('weekdays'), '2026-10-05'));
  assert.ok(!P.occursOn(ev('weekdays'), '2026-10-04'), 'Sonntag nicht');
  assert.ok(P.toICS([{ id: 'x', title: 'Stand-up', date: '2026-10-05', time: '09:00', repeat: 'weekdays', location: 'Büro' }]).includes('RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'));
  assert.ok(P.toICS([{ id: 'x', title: 'A', date: '2026-10-05', location: 'Praxis Dr. Meyer, Ahaus' }]).includes('LOCATION:Praxis Dr. Meyer\\, Ahaus'));
});

test('Gruppieren nach Tag', () => {
  const occ = [{ date: '2026-10-05', event: { title: 'B', time: '10:00' } }, { date: '2026-10-05', event: { title: 'A', time: '' } }, { date: '2026-10-06', event: { title: 'C', time: '08:00' } }];
  const g = C.groupByDay(occ, [{ date: '2026-10-06', text: 'Milch läuft ab' }], '2026-10-05', '2026-10-07');
  assert.equal(g.length, 3);
  assert.deepEqual(g[0].events.map((o) => o.event.title), ['A', 'B'], 'ganztägig zuerst');
  assert.equal(g[1].extra[0].text, 'Milch läuft ab');
});

test('Termin teilen: Text und Link', () => {
  const ev = { id: 'x', title: 'Grillen bei Tom 🍖', date: '2026-10-10', time: '18:00', endTime: '22:00', location: 'Gartenstr. 5', note: 'Salat mitbringen', repeat: 'none', remind: 60, cal: 'geheim' };
  assert.equal(C.shareText(ev), 'Grillen bei Tom 🍖\nSa., 10. Oktober 2026, 18:00–22:00 Uhr\nGartenstr. 5\nSalat mitbringen');
  const code = C.encodeEvent(ev);
  assert.match(code, /^[A-Za-z0-9_-]+$/);
  const back = C.decodeEvent(code);
  assert.deepEqual(back, { repeat: 'none', remind: 60, note: 'Salat mitbringen', time: '18:00', title: 'Grillen bei Tom 🍖', date: '2026-10-10', endTime: '22:00', location: 'Gartenstr. 5' });
  assert.equal(back.cal, undefined, 'interne Felder werden nicht geteilt');
  assert.equal(C.decodeEvent('kaputt'), null);
  assert.equal(C.decodeEvent(Buffer.from(JSON.stringify({ title: 'x', date: 'gestern' })).toString('base64url')), null);
});

test('Einladungscode', () => {
  assert.equal(C.parseInviteCode('https://x.github.io/app/?join=Ab12Cd34Ef56'), 'ab12cd34ef56');
  assert.equal(C.parseInviteCode('  ab12 cd34 ef56 '), 'ab12cd34ef56');
  assert.equal(C.parseInviteCode('kurz'), null);
  assert.equal(C.inviteLink('https://x.github.io/app/?view=calendar', 'abc123def456'), 'https://x.github.io/app/?join=abc123def456');
});
