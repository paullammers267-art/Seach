const test = require('node:test');
const assert = require('node:assert');
const C = require('../categories.js');

test('classify erkennt Kategorien', () => {
  assert.equal(C.classify({ office: 'taxi', name: 'Funktaxi Müller' }), 'taxi');
  assert.equal(C.classify({ name: 'Taxi Schmidt', shop: 'yes' }), 'taxi');
  assert.equal(C.classify({ office: 'moving_company', name: 'Meyer' }), 'moving');
  assert.equal(C.classify({ name: 'Umzüge Krause', craft: 'yes' }), 'moving');
  assert.equal(C.classify({ office: 'courier', name: 'Blitz' }), 'courier');
  assert.equal(C.classify({ name: 'Omnibusbetrieb Weber', office: 'company' }), 'bus');
  assert.equal(C.classify({ name: 'Reisebus Nord', office: 'company' }), 'bus');
  assert.equal(C.classify({ name: 'Krankenfahrten Sonne', office: 'company' }), 'patient');
  assert.equal(C.classify({ emergency: 'ambulance_station' }), 'patient');
  assert.equal(C.classify({ name: 'Spedition Hansen', office: 'company' }), 'freight');
  assert.equal(C.classify({ name: 'Airport Shuttle', office: 'company' }), 'shuttle');
  assert.equal(C.classify({ amenity: 'taxi' }), 'taxi_stand');
});

test('classify ignoriert Nicht-Unternehmen', () => {
  assert.equal(C.classify({ amenity: 'bus_station', name: 'ZOB' }), null);
  assert.equal(C.classify({ highway: 'bus_stop', name: 'Busbahnhof' }), null);
  assert.equal(C.classify({ name: 'Business Center', office: 'company' }), null);
  assert.equal(C.classify({ office: 'lawyer', name: 'Kanzlei' }), null);
});

test('toCompanies sortiert nach Entfernung und entfernt Duplikate', () => {
  const origin = { lat: 50, lon: 8 };
  const data = { elements: [
    { type: 'node', id: 1, lat: 50.02, lon: 8, tags: { office: 'taxi', name: 'Fern', phone: '+49 1' } },
    { type: 'way', id: 2, center: { lat: 50.001, lon: 8 }, tags: { office: 'moving_company', name: 'Nah', 'addr:street': 'Hauptstr.', 'addr:housenumber': '1', 'addr:postcode': '12345', 'addr:city': 'Ort' } },
    { type: 'node', id: 3, lat: 50.02, lon: 8, tags: { office: 'taxi', name: 'Fern' } },
    { type: 'node', id: 4, lat: 50.01, lon: 8, tags: { office: 'lawyer', name: 'X' } },
  ] };
  const res = C.toCompanies(data, origin);
  assert.deepEqual(res.map((c) => c.name), ['Nah', 'Fern']);
  assert.equal(res[0].address, 'Hauptstr. 1, 12345 Ort');
  assert.ok(Math.abs(res[1].distance - 2224) < 5);
});

test('buildQuery und CSV', () => {
  const q = C.buildQuery(50.1, 8.2, 5000);
  assert.match(q, /around:5000,50\.100000,8\.200000/);
  const csv = C.toCSV([{ name: 'A "B"', category: 'taxi', address: '', phone: '', email: '', website: '', openingHours: '', distance: 12.4, lat: 1, lon: 2 }]);
  assert.match(csv, /"A ""B""";"Taxi & Mietwagen"/);
});
