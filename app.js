(function () {
  const { CATEGORIES, buildQuery, toCompanies, toCSV } = window.Categories;

  const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
  ];
  const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
  const DEFAULT_VIEW = { lat: 51.1657, lon: 10.4515, zoom: 6 }; // Deutschland

  const $ = (id) => document.getElementById(id);
  const catById = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
  const state = {
    origin: null,
    companies: [],
    active: new Set(CATEGORIES.filter((c) => c.id !== 'taxi_stand').map((c) => c.id)),
    text: '',
    markers: new Map(),
  };

  // ---------- Karte ----------
  const map = L.map('map').setView([DEFAULT_VIEW.lat, DEFAULT_VIEW.lon], DEFAULT_VIEW.zoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap-Mitwirkende',
  }).addTo(map);
  const markerLayer = L.layerGroup().addTo(map);
  let originMarker = null;
  let radiusCircle = null;

  map.on('click', (e) => search({ lat: e.latlng.lat, lon: e.latlng.lng }, 'Kartenpunkt'));

  function icon(cat) {
    return L.divIcon({
      className: 'pin',
      html: `<span style="background:${cat.color}">${cat.icon}</span>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -14],
    });
  }

  // ---------- Hilfsfunktionen ----------
  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const fmtDist = (m) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`);
  const safeUrl = (u) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);

  function setStatus(text, isError = false) {
    $('status').textContent = text;
    $('status').classList.toggle('error', isError);
  }

  function details(c) {
    const cat = catById[c.category];
    const parts = [
      `<strong>${escapeHtml(c.name)}</strong>`,
      `<span class="tag" style="--c:${cat.color}">${cat.icon} ${escapeHtml(cat.label)}</span> · ${fmtDist(c.distance)}`,
    ];
    if (c.address) parts.push(escapeHtml(c.address));
    if (c.phone) parts.push(`☎ <a href="tel:${escapeHtml(c.phone.replace(/[^+\d]/g, ''))}">${escapeHtml(c.phone)}</a>`);
    if (c.email) parts.push(`✉ <a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a>`);
    if (c.website) parts.push(`🌐 <a href="${escapeHtml(safeUrl(c.website))}" target="_blank" rel="noopener">Website</a>`);
    if (c.openingHours) parts.push(`🕑 ${escapeHtml(c.openingHours)}`);
    parts.push(
      `<a href="https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lon}" target="_blank" rel="noopener">Route</a> · ` +
        `<a href="https://www.openstreetmap.org/${c.id}" target="_blank" rel="noopener">OSM</a>`
    );
    return parts.join('<br>');
  }

  // ---------- Darstellung ----------
  function renderFilters() {
    const counts = {};
    for (const c of state.companies) counts[c.category] = (counts[c.category] || 0) + 1;
    $('filters').innerHTML = CATEGORIES.map(
      (cat) => `<label class="chip" style="--c:${cat.color}">
        <input type="checkbox" value="${cat.id}" ${state.active.has(cat.id) ? 'checked' : ''}>
        ${cat.icon} ${cat.label} <em>${counts[cat.id] || 0}</em></label>`
    ).join('');
  }

  function visibleCompanies() {
    const q = state.text.trim().toLowerCase();
    return state.companies.filter(
      (c) => state.active.has(c.category) && (!q || `${c.name} ${c.address}`.toLowerCase().includes(q))
    );
  }

  function render() {
    renderFilters();
    const list = visibleCompanies();
    markerLayer.clearLayers();
    state.markers.clear();

    $('results').innerHTML = list
      .map((c) => `<li data-id="${c.id}" tabindex="0">${details(c)}</li>`)
      .join('');

    for (const c of list) {
      const m = L.marker([c.lat, c.lon], { icon: icon(catById[c.category]), title: c.name }).bindPopup(details(c));
      m.addTo(markerLayer);
      state.markers.set(c.id, m);
    }

    $('export').disabled = list.length === 0;
    if (state.origin) {
      setStatus(`${list.length} von ${state.companies.length} Einträgen angezeigt`);
    }
  }

  function focusCompany(id) {
    const m = state.markers.get(id);
    if (!m) return;
    map.setView(m.getLatLng(), Math.max(map.getZoom(), 15));
    m.openPopup();
  }

  // ---------- Datenabruf ----------
  async function fetchOverpass(query) {
    let lastErr;
    for (const url of OVERPASS_ENDPOINTS) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          body: new URLSearchParams({ data: query }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error('Keine Verbindung zur Overpass API');
  }

  async function geocode(q) {
    const url = `${NOMINATIM}?format=json&limit=1&accept-language=de&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Adresssuche fehlgeschlagen (HTTP ${res.status})`);
    const [hit] = await res.json();
    if (!hit) throw new Error(`„${q}“ wurde nicht gefunden`);
    return { lat: parseFloat(hit.lat), lon: parseFloat(hit.lon), label: hit.display_name };
  }

  let searchId = 0;
  async function search(origin, label) {
    const id = ++searchId;
    const radius = Number($('radius').value);
    state.origin = origin;

    if (originMarker) originMarker.remove();
    if (radiusCircle) radiusCircle.remove();
    originMarker = L.circleMarker([origin.lat, origin.lon], { radius: 8, color: '#111', fillColor: '#fff', fillOpacity: 1 })
      .bindTooltip(label || 'Suchpunkt')
      .addTo(map);
    radiusCircle = L.circle([origin.lat, origin.lon], { radius, color: '#2b7bd6', weight: 1, fillOpacity: 0.04 }).addTo(map);
    map.fitBounds(radiusCircle.getBounds());

    setStatus('Suche läuft …');
    document.body.classList.add('loading');
    try {
      const data = await fetchOverpass(buildQuery(origin.lat, origin.lon, radius));
      if (id !== searchId) return; // veraltete Antwort
      state.companies = toCompanies(data, origin);
      render();
      if (state.companies.length === 0) setStatus('Keine Beförderungsunternehmen im gewählten Umkreis gefunden. Umkreis vergrößern?');
    } catch (err) {
      if (id !== searchId) return;
      setStatus(`Fehler bei der Suche: ${err.message}`, true);
    } finally {
      if (id === searchId) document.body.classList.remove('loading');
    }
  }

  // ---------- Ereignisse ----------
  $('search-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = $('address').value.trim();
    if (!q) return;
    setStatus('Adresse wird gesucht …');
    try {
      const hit = await geocode(q);
      search(hit, hit.label);
    } catch (err) {
      setStatus(err.message, true);
    }
  });

  $('locate').addEventListener('click', () => {
    if (!navigator.geolocation) return setStatus('Standortbestimmung wird vom Browser nicht unterstützt.', true);
    setStatus('Standort wird ermittelt …');
    navigator.geolocation.getCurrentPosition(
      (pos) => search({ lat: pos.coords.latitude, lon: pos.coords.longitude }, 'Mein Standort'),
      (err) => setStatus(`Standort nicht verfügbar: ${err.message}. Bitte Adresse eingeben.`, true),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });

  $('radius').addEventListener('change', () => {
    if (state.origin) search(state.origin, originMarker?.getTooltip()?.getContent());
  });

  $('filters').addEventListener('change', (e) => {
    const cb = e.target;
    if (cb.type !== 'checkbox') return;
    cb.checked ? state.active.add(cb.value) : state.active.delete(cb.value);
    render();
  });

  $('text-filter').addEventListener('input', (e) => {
    state.text = e.target.value;
    render();
  });

  $('results').addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    const li = e.target.closest('li[data-id]');
    if (li) focusCompany(li.dataset.id);
  });
  $('results').addEventListener('keydown', (e) => {
    const li = e.target.closest('li[data-id]');
    if (li && e.key === 'Enter') focusCompany(li.dataset.id);
  });

  $('export').addEventListener('click', () => {
    const blob = new Blob(['﻿' + toCSV(visibleCompanies())], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'befoerderungsunternehmen.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  renderFilters();

  // Suche direkt per URL möglich: index.html?q=München oder ?lat=..&lon=..
  const params = new URLSearchParams(location.search);
  if (params.get('r')) $('radius').value = params.get('r');
  if (params.get('lat') && params.get('lon')) {
    search({ lat: Number(params.get('lat')), lon: Number(params.get('lon')) }, 'Suchpunkt');
  } else if (params.get('q')) {
    $('address').value = params.get('q');
    $('search-form').requestSubmit();
  }
})();
