// Kategorien von Beförderungsunternehmen und wie sie aus OpenStreetMap-Tags erkannt werden.
// Wird im Browser (window.Categories) und in den Node-Tests (module.exports) verwendet.
(function (root) {
  const CATEGORIES = [
    { id: 'taxi', label: 'Taxi & Mietwagen', color: '#f2b705', icon: '🚕' },
    { id: 'bus', label: 'Bus & Reisen', color: '#2b7bd6', icon: '🚌' },
    { id: 'patient', label: 'Krankentransport', color: '#d63b3b', icon: '🚑' },
    { id: 'moving', label: 'Umzüge', color: '#8a5a2b', icon: '📦' },
    { id: 'courier', label: 'Kurier & Express', color: '#7b3fbf', icon: '🛵' },
    { id: 'freight', label: 'Spedition & Logistik', color: '#3c8d4a', icon: '🚚' },
    { id: 'shuttle', label: 'Shuttle & Limousine', color: '#1f9e9e', icon: '🚐' },
    { id: 'taxi_stand', label: 'Taxistände', color: '#999999', icon: '🅃' },
  ];

  const NAME_PATTERN =
    'Taxi|Mietwagen|Omnibus|Busreise|Bus-|Busunternehmen|Reisedienst|Touristik|Krankenfahrt|Krankentransport|' +
    'Patiententransport|Fahrdienst|Umzug|Umzüge|Spedition|Kurier|Courier|Logistik|Transporte|Transport|' +
    'Shuttle|Limousin|Chauffeur|Beförderung|Personenbeförderung';

  // Overpass-QL-Abfrage für einen Umkreis um (lat, lon).
  function buildQuery(lat, lon, radius) {
    const a = `(around:${Math.round(radius)},${lat.toFixed(6)},${lon.toFixed(6)})`;
    return `[out:json][timeout:60];
(
  nwr["office"~"^(taxi|moving_company|courier|logistics|transport|bus)$"]${a};
  nwr["shop"~"^(taxi|moving|courier)$"]${a};
  nwr["craft"~"^(taxi|removals)$"]${a};
  nwr["amenity"~"^(taxi|courier)$"]${a};
  nwr["emergency"="ambulance_station"]${a};
  nwr["industrial"="logistics"]["name"]${a};
  nwr["name"~"${NAME_PATTERN}",i][~"^(office|shop|craft|amenity|company)$"~"."]${a};
);
out center tags;`;
  }

  const has = (s, re) => re.test(s || '');

  // Ordnet ein OSM-Element einer Kategorie zu (oder null, falls kein Beförderungsunternehmen).
  function classify(tags) {
    const t = tags || {};
    const name = `${t.name || ''} ${t.operator || ''} ${t.brand || ''}`;
    const office = t.office || '';
    const shop = t.shop || '';
    const craft = t.craft || '';
    const amenity = t.amenity || '';

    // Ausschlüsse: Haltestellen/Bahnhöfe o. Ä. sind keine Unternehmen.
    if (['bus_station', 'parking', 'fuel', 'car_rental', 'charging_station'].includes(amenity)) return null;
    if (t.public_transport || t.highway === 'bus_stop' || t.railway) return null;

    if (amenity === 'taxi' && !office && !shop && !craft) {
      // Reiner Taxistand ohne Firmenangaben
      return t.phone || t['contact:phone'] || t.website ? 'taxi' : 'taxi_stand';
    }
    if (t.emergency === 'ambulance_station' || has(name, /kranken(fahrt|transport)|patiententransport|fahrdienst/i)) return 'patient';
    if (office === 'moving_company' || shop === 'moving' || craft === 'removals' || has(name, /umz[uü]g/i)) return 'moving';
    if (office === 'courier' || shop === 'courier' || amenity === 'courier' || has(name, /kurier|courier/i)) return 'courier';
    if (office === 'taxi' || shop === 'taxi' || craft === 'taxi' || has(name, /taxi|mietwagen/i)) return 'taxi';
    if (has(name, /shuttle|limousin|chauffeur/i)) return 'shuttle';
    if (office === 'bus' || has(name, /(omni|reise)?bus(se|reisen?|unternehmen|betrieb|verkehr|service)?\b|reisedienst|touristik/i)) return 'bus';
    if (office === 'logistics' || t.industrial === 'logistics' || has(name, /spedition|logistik|transport|fracht|cargo/i)) return 'freight';
    if (office === 'transport' || has(name, /beförderung/i)) return 'shuttle';
    return null;
  }

  function address(tags) {
    const t = tags || {};
    const street = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ');
    const city = [t['addr:postcode'], t['addr:city']].filter(Boolean).join(' ');
    return [street, city].filter(Boolean).join(', ');
  }

  // Entfernung in Metern (Haversine).
  function distance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const rad = (d) => (d * Math.PI) / 180;
    const dLat = rad(lat2 - lat1);
    const dLon = rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  // Wandelt die Overpass-Antwort in eine sortierte, deduplizierte Liste von Unternehmen um.
  function toCompanies(data, origin) {
    const seen = new Set();
    const out = [];
    for (const el of (data && data.elements) || []) {
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      if (lat == null || lon == null) continue;
      const t = el.tags || {};
      const category = classify(t);
      if (!category) continue;
      const name = t.name || t.operator || t.brand || (category === 'taxi_stand' ? 'Taxistand' : 'Unbenannt');
      const key = `${name.toLowerCase()}|${lat.toFixed(3)}|${lon.toFixed(3)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: `${el.type}/${el.id}`,
        name,
        category,
        lat,
        lon,
        distance: origin ? distance(origin.lat, origin.lon, lat, lon) : 0,
        address: address(t),
        phone: t.phone || t['contact:phone'] || t['contact:mobile'] || '',
        website: t.website || t['contact:website'] || t.url || '',
        email: t.email || t['contact:email'] || '',
        openingHours: t.opening_hours || '',
      });
    }
    return out.sort((a, b) => a.distance - b.distance);
  }

  function toCSV(companies) {
    const cols = ['name', 'category', 'address', 'phone', 'email', 'website', 'openingHours', 'distance', 'lat', 'lon'];
    const label = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = companies.map((c) =>
      cols.map((k) => esc(k === 'category' ? label[c.category] : k === 'distance' ? Math.round(c.distance) : c[k])).join(';')
    );
    return [cols.join(';'), ...rows].join('\r\n');
  }

  const api = { CATEGORIES, buildQuery, classify, address, distance, toCompanies, toCSV };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Categories = api;
})(typeof window !== 'undefined' ? window : globalThis);
