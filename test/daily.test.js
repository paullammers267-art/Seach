const test = require('node:test');
const assert = require('node:assert');
const D = require('../kuehlschrank/daily.js');

const T = '2026-10-03'; // Samstag

test('Müllabfuhr: nächste Termine', () => {
  const gelb = { type: 'gelb', start: '2026-09-08', every: 14 };
  const rest = { type: 'rest', start: '2026-10-05', every: 7 };
  const sperr = { type: 'sperr', start: '2026-10-04', every: 0 };
  assert.equal(D.nextPickup(gelb, T), '2026-10-06');
  assert.equal(D.nextPickup(rest, T), '2026-10-05');
  assert.equal(D.nextPickup(sperr, '2026-10-05'), null);
  const list = D.pickupsBetween([gelb, rest, sperr], T, '2026-10-20');
  assert.deepEqual(list.map((x) => x.w.type + '@' + x.date), ['sperr@2026-10-04', 'rest@2026-10-05', 'gelb@2026-10-06', 'rest@2026-10-12', 'rest@2026-10-19', 'gelb@2026-10-20']);
  const ics = D.wasteICS([gelb, sperr]);
  assert.ok(ics.includes('RRULE:FREQ=WEEKLY;INTERVAL=2') && ics.includes('SUMMARY:Gelber Sack rausstellen') && ics.includes('TRIGGER:-PT6H'));
  assert.equal(ics.split('RRULE').length, 2, 'Sperrmüll ohne Wiederholung');
  assert.deepEqual(D.wasteTomorrow([gelb, rest, sperr], T).map((w) => w.type), ['sperr']);
});

test('Parken', () => {
  const now = Date.UTC(2026, 9, 3, 10, 0);
  assert.equal(D.parkingLeft({ until: now + 95 * 60000 }, now), 95);
  assert.equal(D.durationText(95), 'noch 1 Std 35 Min');
  assert.equal(D.durationText(-5), 'seit 5 Min abgelaufen');
  assert.equal(D.parkingLeft({}, now), null);
  assert.ok(D.mapLink(52.08, 7.01).includes('mlat=52.08'));
});

test('Pakete & Retouren', () => {
  assert.equal(D.parcelStatus({ expected: T }, T).state, 'today');
  assert.equal(D.parcelStatus({ expected: '2026-10-01' }, T).state, 'late');
  const r = D.parcelStatus({ received: '2026-09-21' }, T);
  assert.deepEqual([r.state, r.until, r.left], ['return-soon', '2026-10-05', 2]);
  assert.equal(D.parcelStatus({ received: '2026-09-01' }, T).state, 'kept');
  assert.equal(D.parcelStatus({ received: '2026-10-01', returnDays: 30 }, T).state, 'return-open');
  assert.equal(D.guessCarrier('1Z999AA10123456784'), 'ups');
  assert.equal(D.guessCarrier('JJD0001234567890'), 'dhl');
  assert.ok(D.trackingLink('0034 0434 1234', null).includes('dhl.de'));
});

test('Tankbuch: Verbrauch und Kosten', () => {
  const s = D.fuelStats([
    { date: '2026-08-01', km: 10000, liters: 40, price: 70, full: true },
    { date: '2026-08-20', km: 10600, liters: 36, price: 63, full: true },
    { date: '2026-09-05', km: 11000, liters: 15, price: 27, full: false },
    { date: '2026-09-20', km: 11500, liters: 30, price: 54, full: true },
  ], 2026);
  assert.deepEqual(s.consumption.map((c) => c.l100), [6, 5]);
  assert.equal(s.avg, 5.4); // 81 l auf 1500 km
  assert.equal(s.odometer, 11500);
  assert.equal(s.yearCost, 214);
  assert.equal(s.pricePerLiter, 1.77);
  assert.equal(s.costPerKm, 0.1);
});
