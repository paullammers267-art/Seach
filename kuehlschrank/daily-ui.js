/* Oberfläche für Müllabfuhr, Parken, Pakete & Retouren, Auto & Tanken, wichtige Nummern
   und das anpassbare Schnellmenü „Neu“. Baut auf window.App und window.FridgeDaily auf. */
(() => {
  'use strict';
  const A = window.App;
  const L = A.L;
  const D = window.FridgeDaily;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const esc = A.esc;
  const st = () => A.state;
  const today = () => A.today();
  const euro = (v) => L.formatEuro(v);
  const num = (v) => (v === '' || v == null ? null : L.parsePrice(String(v)));
  const fmt = (v, d = 0) => (v == null ? '–' : Number(v).toLocaleString('de-DE', { maximumFractionDigits: d, minimumFractionDigits: d }));
  for (const k of ['waste', 'parcels', 'fuel', 'contacts']) if (!Array.isArray(st()[k])) st()[k] = [];
  if (st().parking === undefined) st().parking = null;
  const dayLabel = (d) => {
    const n = D.daysBetween(today(), d);
    if (n === 0) return 'Heute';
    if (n === 1) return 'Morgen';
    return new Date(d + 'T12:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
  };
  const wasteDot = (type) => `<i class="w-dot" style="background:${(D.WASTE_TYPES[type] || {}).color || '#999'}"></i>`;
  const wasteLabel = (type) => (D.WASTE_TYPES[type] || { label: type }).label;

  // =====================================================================
  // Schnellmenü „Neu“: nur, was man jeden Tag braucht
  // =====================================================================
  const quick = () => (Array.isArray(st().settings.quickActions) ? st().settings.quickActions : D.DEFAULT_QUICK);
  function applyQuick() {
    const q = quick();
    $$('#actionSheet [data-action]').forEach((b) => { b.hidden = !q.includes(b.dataset.action); b.style.order = q.indexOf(b.dataset.action); });
    $('#quickToggles').innerHTML = $$('#actionSheet [data-action]').map((b) =>
      `<button class="chip ${q.includes(b.dataset.action) ? 'active' : ''}" data-qa="${b.dataset.action}">${b.innerHTML}</button>`).join('') +
      '<button class="chip" data-qa-reset>Standard</button>';
  }
  $('#quickToggles').addEventListener('click', (e) => {
    if (e.target.closest('[data-qa-reset]')) { st().settings.quickActions = null; A.save(); applyQuick(); return; }
    const c = e.target.closest('[data-qa]');
    if (!c) return;
    const q = quick().slice();
    const k = c.dataset.qa;
    st().settings.quickActions = q.includes(k) ? q.filter((x) => x !== k) : q.concat(k);
    A.save(); applyQuick();
  });
  $('#sheetCustomize').addEventListener('click', () => {
    $('#actionSheet').close();
    setTimeout(() => $('#quickCard').scrollIntoView({ block: 'start' }), 60);
  });

  // =====================================================================
  // Müllabfuhr
  // =====================================================================
  const wasteDlg = $('#wasteDialog');
  let editingWaste = null, wType = 'rest', wEvery = 14;
  $('#wasteAdd').innerHTML = Object.entries(D.WASTE_TYPES).map(([k, t]) => `<button class="chip" data-newwaste="${k}">${wasteDot(k)}${t.label}</button>`).join('');
  $('#wasteType').innerHTML = Object.entries(D.WASTE_TYPES).map(([k, t]) => `<button type="button" class="chip" data-v="${k}">${wasteDot(k)}${t.label}</button>`).join('');
  $('#wasteEvery').innerHTML = Object.entries(D.WASTE_RHYTHMS).map(([k, l]) => `<button type="button" data-v="${k}">${l}</button>`).join('');
  const setWType = (k) => { wType = k; $$('#wasteType [data-v]').forEach((b) => b.classList.toggle('active', b.dataset.v === k)); };
  const setWEvery = (k) => { wEvery = Number(k); $$('#wasteEvery [data-v]').forEach((b) => b.classList.toggle('active', Number(b.dataset.v) === wEvery)); };
  $('#wasteType').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) { setWType(b.dataset.v); if (!editingWaste) setWEvery(b.dataset.v === 'sperr' ? 0 : b.dataset.v === 'rest' || b.dataset.v === 'bio' ? 14 : 28); } });
  $('#wasteEvery').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) setWEvery(b.dataset.v); });
  function openWaste(w, type) {
    editingWaste = w || null;
    $('#wasteDlgTitle').textContent = w ? 'Tonne bearbeiten' : 'Neue Tonne';
    setWType(w ? w.type : type || 'rest');
    setWEvery(w ? w.every : type === 'sperr' ? 0 : type === 'rest' || type === 'bio' ? 14 : 28);
    $('#wasteStart').value = w ? D.nextPickup(w, today()) || w.start : '';
    $('#wasteDelete').hidden = !w;
    wasteDlg.showModal();
  }
  $('#wasteAdd').addEventListener('click', (e) => { const c = e.target.closest('[data-newwaste]'); if (c) openWaste(null, c.dataset.newwaste); });
  $('#wasteCancel').onclick = () => wasteDlg.close();
  $('#wasteDelete').onclick = () => { st().waste = st().waste.filter((w) => w.id !== editingWaste.id); A.save(); wasteDlg.close(); A.render(); };
  $('#wasteForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = { type: wType, start: $('#wasteStart').value, every: wEvery };
    if (!data.start) return;
    if (editingWaste) Object.assign(st().waste.find((w) => w.id === editingWaste.id), data);
    else st().waste.push({ id: A.uid(), ...data });
    A.save(); wasteDlg.close();
    if (A.view !== 'waste') A.showView('waste'); else A.render();
    A.toast(`${wasteLabel(data.type)}: ${dayLabel(D.nextPickup(data, today()))}${data.every ? ', dann ' + D.WASTE_RHYTHMS[data.every] : ''}`);
  });
  function renderWaste() {
    if (A.view !== 'waste') return;
    const t = today();
    const next = D.pickupsBetween(st().waste, t, D.addDays(t, 20));
    const byDate = {};
    next.forEach((x) => (byDate[x.date] = byDate[x.date] || []).push(x.w));
    $('#wasteNext').innerHTML = st().waste.length
      ? `<div class="card"><h2>Nächste Abholungen</h2>${Object.entries(byDate).map(([d, ws]) => `<div class="w-day ${d === D.addDays(t, 1) ? 'soon' : ''}"><b>${dayLabel(d)}</b><span>${ws.map((w) => `<span class="w-tag">${wasteDot(w.type)}${wasteLabel(w.type)}</span>`).join('')}</span></div>`).join('') || '<p class="muted">In den nächsten drei Wochen nichts.</p>'}
        <button class="btn small" id="wasteIcs">In Handy-Kalender übernehmen</button></div>`
      : `<div class="empty"><div class="big-emoji"><i class="ic ic-trash"></i></div><p><b>Nie wieder die Tonne vergessen.</b></p><p class="muted">Trag einmal ein, wann welche Tonne abgeholt wird – die App sagt dir am Vorabend Bescheid.</p></div>`;
    $('#wasteList').innerHTML = st().waste.length ? `<div class="card list-card">${st().waste.map((w) => {
      const n = D.nextPickup(w, t);
      return `<button class="row-btn" data-waste="${esc(w.id)}">${wasteDot(w.type)}<span class="grow"><b>${wasteLabel(w.type)}</b><span class="muted small">${D.WASTE_RHYTHMS[w.every] || ''}${n ? ' · nächstes Mal ' + dayLabel(n) : ' · vorbei'}</span></span><span class="chev">›</span></button>`;
    }).join('')}</div>` : '';
  }
  $('#view-waste').addEventListener('click', (e) => {
    if (e.target.closest('#wasteIcs')) { downloadFile('muellabfuhr.ics', D.wasteICS(st().waste), 'text/calendar'); return; }
    const r = e.target.closest('[data-waste]');
    if (r) openWaste(st().waste.find((w) => w.id === r.dataset.waste));
  });
  function downloadFile(name, content, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // =====================================================================
  // Parken
  // =====================================================================
  let parkMinutes = null;
  function renderParking() {
    if (A.view !== 'parking') return;
    const p = st().parking;
    if (!p) {
      $('#parkView').innerHTML = `<div class="card park-new">
        <p class="muted">Speichere, wo dein Auto steht – und stell auf Wunsch die Parkuhr.</p>
        <label class="set-label">Notiz (optional)<input id="parkNote" placeholder="z. B. Parkhaus Ebene 2, Platz 114" autocomplete="off"></label>
        <p class="set-label">Parkuhr</p>
        <div class="segmented" id="parkTime">${[[null, 'ohne'], [30, '30 Min'], [60, '1 Std'], [120, '2 Std'], [180, '3 Std']].map(([m, l]) => `<button type="button" data-m="${m}" class="${m === parkMinutes ? 'active' : ''}">${l}</button>`).join('')}</div>
        <button class="btn primary big" id="parkHere"><i class="ic ic-parking"></i> Hier geparkt</button>
      </div>`;
      return;
    }
    const left = D.parkingLeft(p, Date.now());
    const since = Math.max(0, Math.round((Date.now() - p.at) / 60000));
    $('#parkView').innerHTML = `<div class="card park-card ${left != null && left < 0 ? 'over' : left != null && left <= 10 ? 'soon' : ''}">
        <div class="park-head"><span class="park-p">P</span><div><b>Geparkt um ${new Date(p.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</b><div class="muted small">vor ${D.durationText(since).replace('noch ', '')}${p.lat ? '' : ' · ohne Standort'}</div></div></div>
        ${p.note ? `<p class="park-note">${esc(p.note)}</p>` : ''}
        ${left != null ? `<div class="park-timer"><div class="park-left">${D.durationText(left)}</div><div class="muted small">Parkuhr bis ${new Date(p.until).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</div>
          <div class="row tight"><button class="btn small" data-ext="15">+15 Min</button><button class="btn small" data-ext="30">+30 Min</button><button class="btn small" data-ext="60">+1 Std</button></div></div>` : ''}
        ${p.lat ? `<div class="row"><a class="btn" href="${D.mapLink(p.lat, p.lon)}" target="_blank" rel="noopener">Auf Karte zeigen</a><a class="btn primary" href="${D.routeLink(p.lat, p.lon)}" target="_blank" rel="noopener">Hinlaufen</a></div>` : ''}
        <button class="btn wide" id="parkDone">Weggefahren</button>
      </div>`;
  }
  $('#parkView').addEventListener('click', (e) => {
    const t = e.target.closest('#parkTime [data-m]');
    if (t) { parkMinutes = t.dataset.m === 'null' ? null : Number(t.dataset.m); $$('#parkTime [data-m]').forEach((b) => b.classList.toggle('active', b === t)); return; }
    if (e.target.closest('#parkHere')) { parkHere(); return; }
    const x = e.target.closest('[data-ext]');
    if (x) {
      const p = st().parking;
      p.until = Math.max(p.until, Date.now()) + Number(x.dataset.ext) * 60000;
      p.warned = false;
      A.save(); A.render(); A.toast(`Parkuhr verlängert bis ${new Date(p.until).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`);
      return;
    }
    if (e.target.closest('#parkDone')) {
      const old = st().parking;
      st().parking = null; A.save(); A.render();
      A.toast('Gute Fahrt!', { label: 'Rückgängig', fn: () => { st().parking = old; A.save(); A.render(); } });
    }
  });
  function parkHere() {
    const save = (pos) => {
      st().parking = { at: Date.now(), note: ($('#parkNote') || {}).value?.trim() || '', until: parkMinutes ? Date.now() + parkMinutes * 60000 : null, warned: false,
        ...(pos ? { lat: Math.round(pos.coords.latitude * 100000) / 100000, lon: Math.round(pos.coords.longitude * 100000) / 100000 } : {}) };
      parkMinutes = null;
      A.save(); A.render();
      A.toast(pos ? 'Parkplatz gespeichert' : 'Gespeichert – Standort war nicht verfügbar');
    };
    if (!navigator.geolocation) { save(null); return; }
    A.toast('Standort wird bestimmt …');
    navigator.geolocation.getCurrentPosition(save, () => save(null), { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
  }
  async function checkParking() {
    const p = st().parking;
    if (!p) return;
    if (!p.until) { if (A.view === 'parking') renderParking(); return; }
    const left = D.parkingLeft(p, Date.now());
    if (left <= 10 && !p.warned) {
      p.warned = true; A.save();
      A.beep(3, 990);
      A.toast(left <= 0 ? 'Parkuhr abgelaufen!' : `Parkuhr läuft in ${left} Min ab`);
      await A.notify('Parkuhr', left <= 0 ? 'Die Parkzeit ist abgelaufen.' : `Noch ${left} Minuten Parkzeit.`, 'park' + p.at);
    }
    if (A.view === 'parking' || A.view === 'home') A.render();
    else renderHubDaily();
  }

  // =====================================================================
  // Pakete & Retouren
  // =====================================================================
  const pcDlg = $('#parcelDialog');
  let editingPc = null;
  function openParcel(p) {
    editingPc = p || null;
    $('#parcelDlgTitle').textContent = p ? 'Bestellung bearbeiten' : 'Neue Bestellung';
    $('#pcWhat').value = p ? p.what : '';
    $('#pcShop').value = p ? p.shop || '' : '';
    $('#pcExpected').value = p ? p.expected || '' : '';
    $('#pcTracking').value = p ? p.tracking || '' : '';
    $('#pcReceived').value = p ? p.received || '' : '';
    $('#pcReturnDays').value = p && p.returnDays != null ? p.returnDays : '';
    $('#pcPrice').value = p && p.price ? String(p.price).replace('.', ',') : '';
    $('#pcDelete').hidden = !p;
    pcDlg.showModal();
  }
  $('#parcelAdd').onclick = () => openParcel(null);
  $('#pcCancel').onclick = () => pcDlg.close();
  $('#pcDelete').onclick = () => { st().parcels = st().parcels.filter((p) => p.id !== editingPc.id); A.save(); pcDlg.close(); A.render(); };
  $('#parcelForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const rd = $('#pcReturnDays').value.trim();
    const data = { what: $('#pcWhat').value.trim(), shop: $('#pcShop').value.trim(), expected: $('#pcExpected').value || null, tracking: $('#pcTracking').value.trim(),
      received: $('#pcReceived').value || null, returnDays: rd === '' ? 14 : parseInt(rd, 10) || 0, price: num($('#pcPrice').value) };
    if (editingPc) Object.assign(st().parcels.find((p) => p.id === editingPc.id), data);
    else st().parcels.push({ id: A.uid(), ordered: today(), returned: null, ...data });
    A.save(); pcDlg.close();
    if (A.view !== 'parcels') A.showView('parcels'); else A.render();
    A.toast(data.expected ? `${data.what}: kommt ${dayLabel(data.expected).toLowerCase()}` : `${data.what} gespeichert`);
  });
  function parcelRow(p) {
    const s = D.parcelStatus(p, today());
    const link = D.trackingLink(p.tracking);
    let info, actions = '';
    if (s.state === 'returned') info = `zurückgeschickt am ${L.formatDate(p.returned)}`;
    else if (s.state === 'kept') info = `erhalten ${L.formatDate(p.received)} · behalten`;
    else if (s.state === 'return-open' || s.state === 'return-soon') {
      info = `erhalten ${L.formatDate(p.received)} · <b class="${s.state === 'return-soon' ? 'warn-text' : ''}">Rückgabe bis ${L.formatDate(s.until)} (${s.left === 0 ? 'heute' : s.left === 1 ? 'morgen' : 'noch ' + s.left + ' Tage'})</b>`;
      actions = `<button class="btn small" data-pc-ret="${esc(p.id)}">Zurückgeschickt</button><button class="btn small" data-pc-keep="${esc(p.id)}">Behalten</button>`;
    } else {
      info = p.expected ? `<b class="${s.state === 'late' ? 'warn-text' : ''}">${s.state === 'late' ? 'überfällig seit ' + L.formatDate(p.expected) : 'kommt ' + dayLabel(p.expected).toLowerCase()}</b>` : 'unterwegs';
      actions = `<button class="btn small primary" data-pc-got="${esc(p.id)}">Angekommen</button>`;
    }
    return `<div class="parcel ${s.state}">
      <button class="plain grow" data-pc="${esc(p.id)}"><b>${esc(p.what)}</b><span class="muted small">${p.shop ? esc(p.shop) + ' · ' : ''}${info}${p.price ? ' · ' + euro(p.price) : ''}</span></button>
      <div class="parcel-actions">${link && !p.received ? `<a class="btn small" href="${link}" target="_blank" rel="noopener">Verfolgen</a>` : ''}${actions}</div>
    </div>`;
  }
  function renderParcels() {
    if (A.view !== 'parcels') return;
    const t = today();
    const all = st().parcels.map((p) => ({ p, s: D.parcelStatus(p, t) }));
    const transit = all.filter((x) => ['transit', 'today', 'late'].includes(x.s.state)).sort((a, b) => (a.p.expected || '9').localeCompare(b.p.expected || '9'));
    const ret = all.filter((x) => ['return-open', 'return-soon'].includes(x.s.state)).sort((a, b) => a.s.until.localeCompare(b.s.until));
    const done = all.filter((x) => ['kept', 'returned'].includes(x.s.state)).sort((a, b) => (b.p.received || '').localeCompare(a.p.received || ''));
    const sec = (title, list) => (list.length ? `<h3 class="sec-title">${title}</h3><div class="card list-card">${list.map((x) => parcelRow(x.p)).join('')}</div>` : '');
    $('#parcelList').innerHTML = all.length
      ? sec(`Unterwegs (${transit.length})`, transit) + sec('Rückgabe möglich', ret) + (done.length ? `<details class="done-box"><summary class="muted">Erledigt (${done.length})</summary><div class="card list-card">${done.slice(0, 30).map((x) => parcelRow(x.p)).join('')}</div></details>` : '')
      : `<div class="empty"><div class="big-emoji"><i class="ic ic-package"></i></div><p><b>Bestellungen im Blick.</b></p><p class="muted">Wann kommt was – und bis wann kannst du es zurückschicken? Die App erinnert rechtzeitig an die Rückgabefrist.</p></div>`;
  }
  $('#view-parcels').addEventListener('click', (e) => {
    const find = (id) => st().parcels.find((p) => p.id === id);
    const got = e.target.closest('[data-pc-got]');
    if (got) {
      const p = find(got.dataset.pcGot);
      p.received = today(); A.save(); A.render();
      const s = D.parcelStatus(p, today());
      A.toast(s.until ? `Angekommen – Rückgabe möglich bis ${L.formatDate(s.until)}` : 'Angekommen', { label: 'Rückgängig', fn: () => { p.received = null; A.save(); A.render(); } });
      return;
    }
    const ret = e.target.closest('[data-pc-ret]');
    if (ret) { const p = find(ret.dataset.pcRet); p.returned = today(); A.save(); A.render(); A.toast('Als zurückgeschickt markiert – Erstattung im Blick behalten'); return; }
    const keep = e.target.closest('[data-pc-keep]');
    if (keep) { const p = find(keep.dataset.pcKeep); p.returnDays = 0; A.save(); A.render(); return; }
    const r = e.target.closest('[data-pc]');
    if (r) openParcel(find(r.dataset.pc));
  });

  // =====================================================================
  // Auto & Tanken
  // =====================================================================
  const fuDlg = $('#fuelDialog');
  let editingFu = null;
  function openFuel(f) {
    editingFu = f || null;
    const stats = D.fuelStats(st().fuel);
    $('#fuelDlgTitle').textContent = f ? 'Tankvorgang bearbeiten' : 'Getankt';
    $('#fuDate').value = f ? f.date : today();
    $('#fuKm').value = f ? f.km : '';
    $('#fuKm').placeholder = stats.odometer ? `zuletzt ${fmt(stats.odometer)}` : 'z. B. 45230';
    $('#fuLiters').value = f ? String(f.liters).replace('.', ',') : '';
    $('#fuPrice').value = f && f.price ? String(f.price).replace('.', ',') : '';
    $('#fuFull').checked = f ? f.full !== false : true;
    $('#fuExpense').checked = f ? !!f.expenseId : true;
    $('#fuExpense').closest('label').hidden = !!f;
    $('#fuDelete').hidden = !f;
    fuDlg.showModal();
  }
  $('#fuelAdd').onclick = () => openFuel(null);
  $('#fuCancel').onclick = () => fuDlg.close();
  $('#fuDelete').onclick = () => {
    st().fuel = st().fuel.filter((f) => f.id !== editingFu.id);
    if (editingFu.expenseId) st().expenses = st().expenses.filter((x) => x.id !== editingFu.expenseId);
    A.save(); fuDlg.close(); A.render();
  };
  $('#fuelForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = { date: $('#fuDate').value || today(), km: parseInt(String($('#fuKm').value).replace(/\D/g, ''), 10) || 0, liters: num($('#fuLiters').value) || 0, price: num($('#fuPrice').value), full: $('#fuFull').checked };
    if (!data.km || !data.liters) { A.toast('Bitte Kilometerstand und Liter eintragen'); return; }
    if (editingFu) {
      const f = st().fuel.find((x) => x.id === editingFu.id);
      Object.assign(f, data);
      const ex = f.expenseId && st().expenses.find((x) => x.id === f.expenseId);
      if (ex && data.price) { ex.amount = data.price; ex.date = data.date; }
    } else {
      const f = { id: A.uid(), ...data };
      if ($('#fuExpense').checked && data.price) {
        f.expenseId = A.uid();
        st().expenses.push({ id: f.expenseId, created: new Date().toISOString(), date: data.date, amount: data.price, category: 'mobilitaet', note: 'Tanken' });
      }
      st().fuel.push(f);
    }
    A.save(); fuDlg.close();
    if (A.view !== 'car') A.showView('car'); else A.render();
    const s = D.fuelStats(st().fuel);
    A.toast(s.last ? `Verbrauch zuletzt: ${fmt(s.last, 1)} l/100 km` : 'Gespeichert – ab der zweiten Volltankung siehst du den Verbrauch');
  });
  function renderCar() {
    if (A.view !== 'car') return;
    const s = D.fuelStats(st().fuel, today().slice(0, 4));
    const tile = (v, l) => `<div><b>${v}</b><span>${l}</span></div>`;
    $('#carStats').innerHTML = st().fuel.length
      ? `<div class="statgrid three">${tile(s.avg != null ? fmt(s.avg, 1) : '–', 'Ø l/100 km')}${tile(s.pricePerLiter != null ? fmt(s.pricePerLiter, 2) + ' €' : '–', 'Ø Preis/Liter')}${tile(euro(s.yearCost), 'Sprit ' + today().slice(0, 4))}</div>
        <div class="statgrid three car-sub">${tile(s.odometer != null ? fmt(s.odometer) : '–', 'km-Stand')}${tile(s.last != null ? fmt(s.last, 1) : '–', 'zuletzt l/100 km')}${tile(s.costPerKm != null ? fmt(s.costPerKm * 100, 0) + ' ct' : '–', 'Sprit pro km')}</div>
        ${s.consumption.length > 1 ? `<div class="mini-bars">${s.consumption.slice(-7).map((c) => `<div><i style="height:${Math.round((c.l100 / Math.max(...s.consumption.slice(-7).map((x) => x.l100))) * 100)}%"></i><span>${fmt(c.l100, 1)}</span></div>`).join('')}</div>` : ''}`
      : `<div class="empty"><div class="big-emoji"><i class="ic ic-car"></i></div><p><b>Dein Tankbuch.</b></p><p class="muted">Nach jedem Tanken Kilometerstand und Liter eintragen – du siehst Verbrauch, Spritkosten und Preis pro Liter. TÜV &amp; Inspektion gehören in „Fristen“.</p></div>`;
    const list = [...st().fuel].sort((a, b) => b.km - a.km);
    $('#fuelList').innerHTML = list.length ? `<div class="card list-card">${list.slice(0, 40).map((f) => `<button class="row-btn" data-fu="${esc(f.id)}"><span class="grow"><b>${L.formatDate(f.date)}</b><span class="muted small">${fmt(f.km)} km · ${fmt(f.liters, 2)} l${f.price ? ' · ' + euro(f.price) : ''}${f.full === false ? ' · Teil' : ''}</span></span>${f.price && f.liters ? `<span class="muted small">${fmt(f.price / f.liters, 3)} €/l</span>` : ''}</button>`).join('')}</div>` : '';
  }
  $('#fuelList').addEventListener('click', (e) => { const r = e.target.closest('[data-fu]'); if (r) openFuel(st().fuel.find((f) => f.id === r.dataset.fu)); });

  // =====================================================================
  // Wichtige Nummern
  // =====================================================================
  const ctDlg = $('#contactDialog');
  let editingCt = null;
  $('#ctRoles').innerHTML = D.CONTACT_ROLES.map((r) => `<button type="button" class="chip" data-r="${esc(r)}">${esc(r)}</button>`).join('');
  $('#ctRoles').addEventListener('click', (e) => {
    const b = e.target.closest('[data-r]');
    if (!b) return;
    $('#ctRole').value = b.dataset.r;
    $$('#ctRoles .chip').forEach((c) => c.classList.toggle('active', c === b));
  });
  function openContact(c) {
    editingCt = c || null;
    $('#contactDlgTitle').textContent = c ? 'Nummer bearbeiten' : 'Neue Nummer';
    $('#ctRole').value = c ? c.role || '' : '';
    $('#ctName').value = c ? c.name || '' : '';
    $('#ctPhone').value = c ? c.phone : '';
    $('#ctNote').value = c ? c.note || '' : '';
    $$('#ctRoles .chip').forEach((b) => b.classList.toggle('active', !!c && b.dataset.r === c.role));
    $('#ctDelete').hidden = !c;
    ctDlg.showModal();
  }
  $('#contactAdd').onclick = () => openContact(null);
  $('#ctCancel').onclick = () => ctDlg.close();
  $('#ctDelete').onclick = () => { st().contacts = st().contacts.filter((c) => c.id !== editingCt.id); A.save(); ctDlg.close(); A.render(); };
  $('#contactForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = { role: $('#ctRole').value.trim(), name: $('#ctName').value.trim(), phone: $('#ctPhone').value.trim(), note: $('#ctNote').value.trim() };
    if (!data.phone) return;
    if (editingCt) Object.assign(st().contacts.find((c) => c.id === editingCt.id), data);
    else st().contacts.push({ id: A.uid(), ...data });
    A.save(); ctDlg.close();
    if (A.view !== 'contacts') A.showView('contacts'); else A.render();
  });
  const callRow = (title, sub, phone, id) => `<div class="call-row">
      <a class="grow" href="${D.telHref(phone)}"><b>${esc(title)}</b><span class="muted small">${esc(sub)}</span></a>
      ${id ? `<button class="icon-sm" data-ct="${esc(id)}" aria-label="Bearbeiten">✎</button>` : ''}
      <a class="call-btn" href="${D.telHref(phone)}" aria-label="Anrufen"><i class="ic ic-phone"></i></a></div>`;
  function renderContacts() {
    if (A.view !== 'contacts') return;
    const list = [...st().contacts].sort((a, b) => (a.role || a.name).localeCompare(b.role || b.name, 'de'));
    $('#contactList').innerHTML = list.length
      ? `<div class="card list-card">${list.map((c) => callRow(c.role || c.name, [c.role ? c.name : '', c.phone, c.note].filter(Boolean).join(' · '), c.phone, c.id)).join('')}</div>`
      : `<div class="empty"><div class="big-emoji"><i class="ic ic-phone"></i></div><p><b>Alle wichtigen Nummern an einem Ort.</b></p><p class="muted">Hausarzt, Vermieter, Kita, Handwerker – mit einem Tipp anrufen.</p></div>`;
    $('#hotlineList').innerHTML = `<div class="card list-card">${D.HOTLINES.map((h) => callRow(h.name, h.phone.replace(/^(0800)(\d{3})(\d)(\d{3})$/, '$1 $2 $3 $4').replace(/^(116)(\d{3})$/, '$1 $2'), h.phone)).join('')}</div>`;
  }
  $('#contactList').addEventListener('click', (e) => { const b = e.target.closest('[data-ct]'); if (b) openContact(st().contacts.find((c) => c.id === b.dataset.ct)); });

  // =====================================================================
  // Startseite, Mehr, Kalender, Suche, Erinnerungen
  // =====================================================================
  if (A.homeCards) Object.assign(A.homeCards, { waste: 'Müllabfuhr', parking: 'Parken', parcels: 'Pakete' });
  if (A.homeOrder) Object.assign(A.homeOrder, { parking: [3, 'top'], waste: [10, 'today'], parcels: [19, 'today'] });
  if (A.homeIcons) Object.assign(A.homeIcons, { waste: 'trash', parking: 'parking', parcels: 'package' });
  const home = document.createElement('div');
  home.id = 'homeDaily';
  $('#homeFlow').appendChild(home);
  function renderHomeDaily() {
    if (A.view !== 'home') return;
    const t = today();
    const parts = [];
    const p = st().parking;
    if (p) {
      const left = D.parkingLeft(p, Date.now());
      parts.push(`<button class="card home-card ${left != null && left <= 10 ? 'park-alert' : ''}" data-card="parking" data-goto="parking"><div class="home-title">Geparkt</div>
        <div class="home-line">seit ${new Date(p.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr${p.note ? ' · ' + esc(p.note) : ''}${left != null ? ` · <b class="${left <= 10 ? 'warn-text' : ''}">Parkuhr ${D.durationText(left)}</b>` : ''}</div></button>`);
    }
    const h = new Date().getHours();
    const tomorrow = D.wasteTomorrow(st().waste, t);
    const todayW = h < 12 ? D.pickupsBetween(st().waste, t, t).map((x) => x.w) : [];
    if (tomorrow.length || todayW.length) {
      parts.push(`<button class="card home-card" data-card="waste" data-goto="waste"><div class="home-title">Müllabfuhr</div>
        ${todayW.length ? `<div class="home-line"><b>Heute:</b> ${todayW.map((w) => `<span class="w-tag">${wasteDot(w.type)}${wasteLabel(w.type)}</span>`).join(' ')}</div>` : ''}
        ${tomorrow.length ? `<div class="home-line"><b>${h >= 12 ? 'Heute Abend rausstellen' : 'Morgen'}:</b> ${tomorrow.map((w) => `<span class="w-tag">${wasteDot(w.type)}${wasteLabel(w.type)}</span>`).join(' ')}</div>` : ''}</button>`);
    }
    const pcs = st().parcels.map((x) => ({ x, s: D.parcelStatus(x, t) })).filter((y) => ['today', 'late', 'return-soon'].includes(y.s.state));
    if (pcs.length) {
      parts.push(`<button class="card home-card" data-card="parcels" data-goto="parcels"><div class="home-title">Pakete</div>
        ${pcs.slice(0, 3).map(({ x, s }) => `<div class="home-line ${s.state !== 'today' ? 'warn-text' : ''}"><b>${esc(x.what)}</b> – ${s.state === 'today' ? 'kommt heute' : s.state === 'late' ? 'überfällig' : `Rückgabe bis ${L.formatDate(s.until)}`}</div>`).join('')}</button>`);
    }
    home.innerHTML = parts.join('');
  }
  // Tagesüberblick: Tonne für morgen, Paket heute, Parkuhr
  A.glanceSources = A.glanceSources || [];
  A.glanceSources.push(() => {
    const t = today(), out = [];
    const tomorrow = D.wasteTomorrow(st().waste, t);
    if (tomorrow.length) out.push(['waste', 'trash', `${tomorrow.map((w) => wasteLabel(w.type)).join(' + ')} ${new Date().getHours() >= 12 ? 'heute Abend' : 'morgen'}`, '']);
    const pc = st().parcels.filter((p) => D.parcelStatus(p, t).state === 'today').length;
    if (pc) out.push(['parcels', 'package', `${pc} Paket${pc > 1 ? 'e' : ''} heute`, '']);
    const p = st().parking;
    const left = p ? D.parkingLeft(p, Date.now()) : null;
    if (left != null) out.push(['parking', 'parking', D.durationText(left).replace('noch ', 'Parkuhr '), left <= 10 ? 'warn' : '']);
    return out;
  });

  function renderHubDaily() {
    const t = today();
    const nx = D.pickupsBetween(st().waste, t, D.addDays(t, 30))[0];
    $('#hubWaste').textContent = nx ? `${dayLabel(nx.date)}: ${wasteLabel(nx.w.type)}` : 'Abfuhrkalender';
    const p = st().parking;
    const left = p ? D.parkingLeft(p, Date.now()) : null;
    $('#hubParking').textContent = p ? (left != null ? D.durationText(left) : 'Auto geparkt') : 'Parkplatz merken';
    const open = st().parcels.filter((x) => !['kept', 'returned'].includes(D.parcelStatus(x, t).state)).length;
    $('#hubParcels').textContent = open ? `${open} offen` : 'Lieferung & Rückgabe';
    const s = D.fuelStats(st().fuel);
    $('#hubCar').textContent = s.avg != null ? `Ø ${fmt(s.avg, 1)} l/100 km` : 'Tankbuch';
    $('#hubContacts').textContent = st().contacts.length ? `${st().contacts.length} Nummern` : 'Arzt, Vermieter …';
  }

  A.calendarSources.push((from, to) => [
    ...D.pickupsBetween(st().waste, from, to).map((x) => ({ date: x.date, kind: 'task', text: wasteLabel(x.w.type), emoji: '🗑️', go: 'waste' })),
    ...st().parcels.flatMap((p) => {
      const s = D.parcelStatus(p, from);
      const out = [];
      if (!p.received && p.expected && p.expected >= from && p.expected <= to) out.push({ date: p.expected, kind: 'task', text: `Paket: ${p.what}`, emoji: '📦', go: 'parcels' });
      if (s.until && s.until >= from && s.until <= to && !p.returned) out.push({ date: s.until, kind: 'task', text: `Rückgabe: ${p.what}`, emoji: '📦', go: 'parcels' });
      return out;
    }),
  ]);
  if (A.searchSources) A.searchSources.push((has) => [
    ...st().contacts.filter((c) => has(c.role, c.name, c.phone, c.note)).map((c) => ({ kind: 'go', view: 'contacts', icon: '📞', text: c.role || c.name, sub: [c.name, c.phone].filter(Boolean).join(' · ') })),
    ...st().parcels.filter((p) => has(p.what, p.shop, p.tracking)).map((p) => ({ kind: 'go', view: 'parcels', icon: '📦', text: p.what, sub: p.shop || 'Bestellung' })),
  ]);

  async function checkDailyReminders() {
    const t = today();
    let changed = false;
    const h = new Date().getHours();
    const tomorrow = D.wasteTomorrow(st().waste, t);
    const wk = `waste@${D.addDays(t, 1)}`;
    if (tomorrow.length && h >= 17 && !st().notified.includes(wk)) {
      st().notified.push(wk); changed = true;
      await A.notify('Müllabfuhr', `Heute Abend rausstellen: ${tomorrow.map((w) => wasteLabel(w.type)).join(', ')}`, wk);
    }
    for (const p of st().parcels) {
      const s = D.parcelStatus(p, t);
      if (s.state !== 'return-soon') continue;
      const k = `ret:${p.id}@${s.until}`;
      if (st().notified.includes(k)) continue;
      st().notified.push(k); changed = true;
      await A.notify('Rückgabefrist', `${p.what}: zurückschicken bis ${L.formatDate(s.until)}`, k);
    }
    if (changed) A.save();
  }

  A.actions.park = () => A.showView('parking');
  A.actions.parcel = () => { A.showView('parcels'); openParcel(null); };
  A.actions.fuel = () => { A.showView('car'); openFuel(null); };

  A.onRender(renderHomeDaily);
  A.onRender(renderWaste);
  A.onRender(renderParking);
  A.onRender(renderParcels);
  A.onRender(renderCar);
  A.onRender(renderContacts);
  A.onRender(renderHubDaily);
  A.onRender(applyQuick);
  if (A.applyHomeHidden) A.onRender(A.applyHomeHidden);
  setInterval(() => { checkParking(); checkDailyReminders(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkParking(); checkDailyReminders(); } });
  A.render();
  checkDailyReminders();
})();
