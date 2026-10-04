/* Alltag: Müllabfuhr, Parken, Pakete & Retouren, Tankbuch, wichtige Nummern, Schnellmenü.
   Läuft im Browser (window.FridgeDaily) und in Node (Tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FridgeDaily = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DAY = 86400000;
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / DAY);
  const r1 = (v) => Math.round(v * 10) / 10;
  const r2 = (v) => Math.round(v * 100) / 100;

  // ---------- Schnellmenü ----------

  /** Was man jeden Tag braucht – der Rest lässt sich in den Einstellungen dazuschalten. */
  const DEFAULT_QUICK = ['task', 'shopping', 'event', 'expense', 'product', 'meal', 'note', 'timer'];

  // ---------- Müllabfuhr ----------

  const WASTE_TYPES = {
    rest: { label: 'Restmüll', color: '#6b7280' },
    bio: { label: 'Biotonne', color: '#92400e' },
    papier: { label: 'Papier', color: '#2563eb' },
    gelb: { label: 'Gelber Sack', color: '#eab308' },
    glas: { label: 'Glas', color: '#16a34a' },
    sperr: { label: 'Sperrmüll', color: '#7c3aed' },
  };
  const WASTE_RHYTHMS = { 7: 'jede Woche', 14: 'alle 2 Wochen', 28: 'alle 4 Wochen', 0: 'nur einmal' };

  /** Nächster Abholtag ab `from` (inklusive). every = 0 → einmaliger Termin. */
  function nextPickup(w, from) {
    if (!w.start) return null;
    if (!w.every) return w.start >= from ? w.start : null;
    if (w.start >= from) return w.start;
    const n = Math.ceil(daysBetween(w.start, from) / w.every);
    return addDays(w.start, n * w.every);
  }
  /** Alle Abholtermine im Zeitraum [from, to], sortiert. */
  function pickupsBetween(list, from, to) {
    const out = [];
    for (const w of list) {
      let d = nextPickup(w, from);
      while (d && d <= to) {
        out.push({ w, date: d });
        if (!w.every) break;
        d = addDays(d, w.every);
      }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date) || a.w.type.localeCompare(b.w.type));
  }
  /** Was muss heute Abend / morgen früh raus? */
  function wasteTomorrow(list, today) {
    return pickupsBetween(list, addDays(today, 1), addDays(today, 1)).map((x) => x.w);
  }

  /** Abfuhrtermine als Kalenderdatei – mit Erinnerung um 18 Uhr am Vorabend. */
  function wasteICS(list) {
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Alltagsheld//Muell//DE', 'CALSCALE:GREGORIAN'];
    for (const w of list) {
      if (!w.start) continue;
      const d = w.start.replace(/-/g, '');
      const label = (WASTE_TYPES[w.type] || { label: w.type }).label;
      lines.push('BEGIN:VEVENT', `UID:muell-${w.id || w.type}-${d}@alltagsheld`, `DTSTAMP:${d}T000000Z`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${addDays(w.start, 1).replace(/-/g, '')}`,
        `SUMMARY:${label} rausstellen`, 'TRANSP:TRANSPARENT');
      if (w.every) lines.push(`RRULE:FREQ=WEEKLY;INTERVAL=${w.every / 7}`);
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:Morgen: ${label}`, 'TRIGGER:-PT6H', 'END:VALARM', 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  // ---------- Parken ----------

  const mapLink = (lat, lon) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}`;
  const routeLink = (lat, lon) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=walking`;
  /** Restzeit der Parkuhr in Minuten (negativ = abgelaufen), null ohne Parkuhr. */
  function parkingLeft(p, now) {
    if (!p || !p.until) return null;
    return Math.ceil((p.until - now) / 60000); // angefangene Minute zählt noch
  }
  function durationText(min) {
    const m = Math.abs(min);
    const t = m >= 60 ? `${Math.floor(m / 60)} Std ${pad(m % 60)} Min` : `${m} Min`;
    return min < 0 ? `seit ${t} abgelaufen` : `noch ${t}`;
  }

  // ---------- Pakete & Retouren ----------

  /** Status einer Bestellung. */
  function parcelStatus(p, today) {
    if (p.returned) return { state: 'returned' };
    if (p.received) {
      const days = p.returnDays == null ? 14 : p.returnDays;
      if (!days) return { state: 'kept' };
      const until = addDays(p.received, days);
      const left = daysBetween(today, until);
      return { state: left < 0 ? 'kept' : left <= 3 ? 'return-soon' : 'return-open', until, left };
    }
    if (!p.expected) return { state: 'transit' };
    const left = daysBetween(today, p.expected);
    return { state: left < 0 ? 'late' : left === 0 ? 'today' : 'transit', left };
  }
  /** Sendungsnummer → passender Verfolgungs-Link (DHL, Hermes, DPD, GLS, UPS). */
  function trackingLink(nr, carrier) {
    const n = String(nr || '').replace(/\s+/g, '');
    if (!n) return null;
    const c = carrier || guessCarrier(n);
    const urls = {
      dhl: `https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=${n}`,
      hermes: `https://www.myhermes.de/empfangen/sendungsverfolgung/sendungsinformation#${n}`,
      dpd: `https://tracking.dpd.de/status/de_DE/parcel/${n}`,
      gls: `https://gls-group.com/DE/de/paketverfolgung?match=${n}`,
      ups: `https://www.ups.com/track?tracknum=${n}`,
    };
    return urls[c] || null;
  }
  function guessCarrier(n) {
    if (/^1Z[0-9A-Z]{16}$/i.test(n)) return 'ups';
    if (/^(JJD|JVGL|00340)/i.test(n) || /^\d{12}$/.test(n) || /^\d{20}$/.test(n)) return 'dhl';
    if (/^\d{14}$/.test(n)) return 'dpd';
    if (/^H\d{19}$/i.test(n) || /^\d{16}$/.test(n)) return 'hermes';
    if (/^\d{11}$/.test(n)) return 'gls';
    return 'dhl';
  }
  const CARRIERS = { dhl: 'DHL', hermes: 'Hermes', dpd: 'DPD', gls: 'GLS', ups: 'UPS' };

  // ---------- Tankbuch ----------

  /** Verbrauch, Kosten und Preis/Liter aus den Tankvorgängen (km = Kilometerstand). */
  function fuelStats(entries, year) {
    const list = [...entries].filter((e) => e.km > 0 && e.liters > 0).sort((a, b) => a.km - b.km);
    const cons = [];
    for (let i = 1; i < list.length; i++) {
      const cur = list[i];
      if (!cur.full) continue;
      // bis zur letzten Volltankung zurück – Teiltankungen dazwischen zählen mit
      let j = i - 1, liters = cur.liters;
      while (j >= 0 && !list[j].full) { liters += list[j].liters; j--; }
      if (j < 0) continue;
      const km = cur.km - list[j].km;
      if (km > 0) cons.push({ date: cur.date, km, l100: r1((liters / km) * 100) });
    }
    const totalKm = cons.reduce((a, c) => a + c.km, 0);
    const avg = totalKm ? r1(cons.reduce((a, c) => a + (c.l100 * c.km) / 100, 0) / totalKm * 100) : null;
    const withPrice = list.filter((e) => e.price > 0);
    const ppl = withPrice.length ? r2(withPrice.reduce((a, e) => a + e.price, 0) / withPrice.reduce((a, e) => a + e.liters, 0)) : null;
    const y = String(year || '');
    const yearList = list.filter((e) => !y || (e.date || '').startsWith(y));
    const yearCost = r2(yearList.reduce((a, e) => a + (e.price || 0), 0));
    const span = list.length > 1 ? list[list.length - 1].km - list[0].km : 0;
    const allCost = list.slice(1).reduce((a, e) => a + (e.price || 0), 0);
    return { consumption: cons, avg, last: cons.length ? cons[cons.length - 1].l100 : null, pricePerLiter: ppl, yearCost, costPerKm: span > 0 && allCost ? r2(allCost / span) : null, odometer: list.length ? list[list.length - 1].km : null };
  }

  // ---------- Wichtige Nummern ----------

  const CONTACT_ROLES = ['Hausarzt', 'Zahnarzt', 'Kinderarzt', 'Apotheke', 'Vermieter', 'Hausverwaltung', 'Hausmeister', 'Arbeit', 'Kita / Schule', 'Tierarzt', 'Handwerker', 'Schlüsseldienst', 'Versicherung', 'Nachbar'];
  const HOTLINES = [
    { name: 'Polizei', phone: '110' },
    { name: 'Feuerwehr & Rettungsdienst', phone: '112' },
    { name: 'Ärztlicher Bereitschaftsdienst', phone: '116117' },
    { name: 'Karten- & Konto-Sperre', phone: '116116' },
    { name: 'Telefonseelsorge (rund um die Uhr)', phone: '08001110111' },
  ];
  const telHref = (s) => 'tel:' + String(s || '').replace(/[^\d+]/g, '');

  return {
    addDays, daysBetween,
    DEFAULT_QUICK,
    WASTE_TYPES, WASTE_RHYTHMS, nextPickup, pickupsBetween, wasteTomorrow, wasteICS,
    mapLink, routeLink, parkingLeft, durationText,
    parcelStatus, trackingLink, guessCarrier, CARRIERS,
    fuelStats,
    CONTACT_ROLES, HOTLINES, telHref,
  };
});
