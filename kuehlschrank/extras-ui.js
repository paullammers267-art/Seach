/* Medikamente, Fristen, Zählerstände, Werkzeuge, Atemübung, Erfolge & Wochenrückblick, Sparziele,
   Notiz-Vorlagen, Startseite anpassen, Sicherungs-Erinnerung. Baut auf window.App und window.FridgeExtras auf. */
(() => {
  'use strict';
  const A = window.App;
  const L = A.L;
  const X = window.FridgeExtras;
  const S = window.FridgeSport;
  const P = window.FridgePlanner;
  const F = window.FridgeLife;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const esc = A.esc;
  const st = () => A.state;
  const today = () => A.today();
  const euro = (v) => L.formatEuro(v);
  const num = (v) => (v === '' || v == null ? null : L.parsePrice(String(v)));
  const fmt = (v, d = 0) => (v == null ? '–' : Number(v).toLocaleString('de-DE', { maximumFractionDigits: d }));
  const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  for (const k of ['meds', 'deadlines', 'meters', 'savings']) if (!Array.isArray(st()[k])) st()[k] = [];
  if (!st().medLog) st().medLog = {};
  if (!Array.isArray(st().settings.homeHidden)) st().settings.homeHidden = [];

  function leftText(days) {
    if (days < -1) return `seit ${-days} Tagen abgelaufen`;
    if (days === -1) return 'seit gestern abgelaufen';
    if (days === 0) return 'heute';
    if (days === 1) return 'morgen';
    if (days < 60) return `in ${days} Tagen`;
    if (days < 730) return `in ${Math.round(days / 30)} Monaten`;
    return `in ${Math.round(days / 365)} Jahren`;
  }

  // =====================================================================
  // 💊 Medikamente
  // =====================================================================
  const medDlg = $('#medDialog');
  let editingMed = null;
  let mdTimes = [];
  let mdDays = [];
  $('#mdDays').innerHTML = [1, 2, 3, 4, 5, 6, 0].map((d) => `<button type="button" class="chip" data-d="${d}">${WD[d]}</button>`).join('');

  function renderMdForm() {
    $('#mdTimes').innerHTML = mdTimes.length ? mdTimes.map((t) => `<button type="button" class="chip active" data-t="${t}">${t} ✕</button>`).join('') : '<span class="muted small">noch keine Uhrzeit</span>';
    $$('#mdDays .chip').forEach((c) => c.classList.toggle('active', mdDays.includes(Number(c.dataset.d))));
  }
  $('#mdTimes').addEventListener('click', (e) => { const c = e.target.closest('[data-t]'); if (c) { mdTimes = mdTimes.filter((t) => t !== c.dataset.t); renderMdForm(); } });
  $('#mdDays').addEventListener('click', (e) => {
    const c = e.target.closest('[data-d]');
    if (!c) return;
    const d = Number(c.dataset.d);
    mdDays = mdDays.includes(d) ? mdDays.filter((x) => x !== d) : mdDays.concat(d);
    renderMdForm();
  });
  $('#mdTimeBtn').onclick = () => {
    const t = $('#mdTimeAdd').value;
    if (!t) return;
    if (!mdTimes.includes(t)) mdTimes = mdTimes.concat(t).sort();
    $('#mdTimeAdd').value = '';
    renderMdForm();
  };
  function openMed(m) {
    editingMed = m || null;
    $('#medDlgTitle').textContent = m ? 'Medikament bearbeiten' : 'Neues Medikament';
    $('#mdName').value = m ? m.name : '';
    $('#mdAmount').value = m ? fmt(m.amount, 2) : '1';
    $('#mdStock').value = m && m.stock != null ? m.stock : '';
    $('#mdNote').value = m ? m.note || '' : '';
    mdTimes = m ? [...m.times] : ['08:00'];
    mdDays = m && m.days ? [...m.days] : [];
    $('#mdDelete').hidden = !m;
    renderMdForm();
    medDlg.showModal();
  }
  $('#btnMedNew').onclick = () => openMed(null);
  $('#mdCancel').onclick = () => medDlg.close();
  $('#mdDelete').onclick = () => {
    if (!confirm(`„${editingMed.name}“ löschen?`)) return;
    st().meds = st().meds.filter((m) => m.id !== editingMed.id);
    A.save(); medDlg.close(); A.render();
  };
  $('#medForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!mdTimes.length) { A.toast('Bitte mindestens eine Uhrzeit hinzufügen'); return; }
    const data = { name: $('#mdName').value.trim() || 'Medikament', amount: num($('#mdAmount').value) || 1, times: mdTimes, days: mdDays.length && mdDays.length < 7 ? mdDays : null, stock: $('#mdStock').value === '' ? null : num($('#mdStock').value), note: $('#mdNote').value.trim() };
    if (editingMed) Object.assign(st().meds.find((m) => m.id === editingMed.id), data);
    else st().meds.push({ id: A.uid(), ...data });
    A.save(); medDlg.close();
    if (A.view !== 'meds') A.showView('meds'); else A.render();
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  });

  function toggleDose(key) {
    const [id] = key.split('@');
    const m = st().meds.find((x) => x.id === id);
    const was = !!st().medLog[key];
    if (was) delete st().medLog[key]; else st().medLog[key] = new Date().toISOString();
    if (m && m.stock != null) m.stock = Math.max(0, Math.round((m.stock + (was ? 1 : -1) * (m.amount || 1)) * 100) / 100);
    A.save(); A.render();
    if (!was && m) {
      const d = X.stockDays(m);
      if (d != null && d <= 7) A.toast(`💊 ${m.name}: Vorrat reicht nur noch ${d} Tag${d === 1 ? '' : 'e'}`, { label: 'Auf Einkaufsliste', fn: () => { A.addToShopping(m.name + ' (Apotheke)', null, 'Medikament'); A.toast('🛒 Notiert'); } });
    }
  }
  document.addEventListener('click', (e) => {
    const d = e.target.closest('[data-dose]');
    if (d) toggleDose(d.dataset.dose);
  });

  function doseRow(d) {
    const now = new Date();
    const due = !d.taken && d.time <= `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return `<button class="dose ${d.taken ? 'taken' : due ? 'due' : ''}" data-dose="${esc(d.key)}">
      <span class="tcheck">${d.taken ? '✔' : ''}</span><b>${d.time}</b> <span class="grow">${esc(d.med.name)}${d.med.amount !== 1 ? ` · ${fmt(d.med.amount, 2)}×` : ''}${d.med.note ? ` <span class="muted small">· ${esc(d.med.note)}</span>` : ''}</span>
      ${due ? '<span class="warn-text small">fällig</span>' : ''}</button>`;
  }

  function renderMeds() {
    if (A.view !== 'meds') return;
    const doses = X.dosesOn(st().meds, today(), st().medLog);
    $('#medToday').innerHTML = st().meds.length
      ? `<h2>Heute ${doses.length ? `<span class="muted small">${doses.filter((d) => d.taken).length} von ${doses.length} genommen</span>` : ''}</h2>${doses.map(doseRow).join('') || '<p class="muted small">Heute steht nichts an.</p>'}`
      : `<div class="empty"><div class="big-emoji">💊</div><p><b>Nie wieder Tabletten vergessen.</b></p><p class="muted">Lege deine Medikamente mit Uhrzeiten an – die App erinnert dich, zählt den Vorrat und warnt rechtzeitig vor dem Nachkaufen.</p></div>`;
    $('#medList').innerHTML = st().meds.map((m) => {
      const days = X.stockDays(m);
      return `<button class="card med-card" data-med="${esc(m.id)}">
        <b>💊 ${esc(m.name)}</b>
        <div class="muted small">${m.times.join(', ')} Uhr · ${m.days ? m.days.map((d) => WD[d]).join(', ') : 'täglich'}${m.amount !== 1 ? ` · je ${fmt(m.amount, 2)}` : ''}</div>
        ${m.stock != null ? `<div class="small ${days <= 7 ? 'warn-text' : ''}">Vorrat: ${fmt(m.stock, 1)} Stück · reicht ${days === 0 ? 'nicht mehr' : 'noch ca. ' + days + ' Tag' + (days === 1 ? '' : 'e')}${days <= 7 ? ' – bald nachkaufen!' : ''}</div>` : ''}
      </button>`;
    }).join('');
  }
  $('#medList').addEventListener('click', (e) => { const c = e.target.closest('[data-med]'); if (c) openMed(st().meds.find((m) => m.id === c.dataset.med)); });

  async function checkMedReminders() {
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    let changed = false;
    for (const d of X.dosesOn(st().meds, today(), st().medLog)) {
      if (d.taken || d.time > hhmm) continue;
      const [h, m] = d.time.split(':').map(Number);
      if (now.getHours() * 60 + now.getMinutes() - (h * 60 + m) > 120) continue; // länger als 2 Std. her: nicht mehr melden
      const nk = 'med:' + d.key;
      if (st().notified.includes(nk)) continue;
      st().notified.push(nk);
      changed = true;
      const shown = await A.notify('💊 Medikament', `${d.med.name} (${d.time} Uhr)`, nk);
      if (!shown || !document.hidden) A.toast(`💊 ${d.med.name} – ${d.time} Uhr`, { label: 'Genommen', fn: () => toggleDose(d.key) });
    }
    if (changed) A.save();
  }

  // =====================================================================
  // 📄 Fristen & Dokumente
  // =====================================================================
  const dlDlg = $('#dlDialog');
  let editingDl = null;
  let dlType = 'ausweis';
  $('#dlType').innerHTML = Object.entries(X.DEADLINE_TYPES).map(([k, t]) => `<button type="button" class="chip" data-v="${k}">${t.emoji} ${t.label}</button>`).join('');
  $('#dlQuick').innerHTML = Object.entries(X.DEADLINE_TYPES).map(([k, t]) => `<button class="chip" data-newdl="${k}">＋ ${t.emoji} ${t.label}</button>`).join('');
  function setDlType(k, fresh) {
    dlType = k;
    $$('#dlType .chip').forEach((c) => c.classList.toggle('active', c.dataset.v === k));
    if (fresh) { $('#dlRemind').value = X.DEADLINE_TYPES[k].remind; $('#dlYears').value = X.DEADLINE_TYPES[k].years; }
  }
  $('#dlType').addEventListener('click', (e) => { const c = e.target.closest('[data-v]'); if (c) setDlType(c.dataset.v, !editingDl); });
  function openDl(dl, type) {
    editingDl = dl || null;
    $('#dlDlgTitle').textContent = dl ? 'Frist bearbeiten' : 'Neue Frist';
    $('#dlTitle').value = dl ? dl.title : '';
    $('#dlDate').value = dl ? dl.date : '';
    $('#dlStart').value = '';
    $('#dlNote').value = dl ? dl.note || '' : '';
    setDlType(dl ? dl.type : (type || 'ausweis'), !dl);
    if (dl) { $('#dlRemind').value = dl.remind ?? X.DEADLINE_TYPES[dl.type].remind; $('#dlYears').value = X.DEADLINE_TYPES[dl.type].years; }
    $('#dlDelete').hidden = !dl;
    dlDlg.showModal();
  }
  function calcFromStart() {
    const s = $('#dlStart').value, y = num($('#dlYears').value);
    if (s && y) $('#dlDate').value = X.expiryFrom(s, y);
  }
  $('#dlStart').addEventListener('change', calcFromStart);
  $('#dlYears').addEventListener('input', calcFromStart);
  $('#dlQuick').addEventListener('click', (e) => { const c = e.target.closest('[data-newdl]'); if (c) openDl(null, c.dataset.newdl); });
  $('#dlCancel').onclick = () => dlDlg.close();
  $('#dlDelete').onclick = () => {
    st().deadlines = st().deadlines.filter((d) => d.id !== editingDl.id);
    A.save(); dlDlg.close(); A.render();
  };
  $('#dlForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!$('#dlDate').value) { A.toast('Bitte Datum eintragen (oder Ausstellungsdatum + Laufzeit)'); return; }
    const data = { type: dlType, title: $('#dlTitle').value.trim() || X.DEADLINE_TYPES[dlType].label, date: $('#dlDate').value, remind: parseInt($('#dlRemind').value, 10) || X.DEADLINE_TYPES[dlType].remind, note: $('#dlNote').value.trim() };
    if (editingDl) Object.assign(st().deadlines.find((d) => d.id === editingDl.id), data);
    else st().deadlines.push({ id: A.uid(), ...data });
    A.save(); dlDlg.close();
    if (A.view !== 'deadlines') A.showView('deadlines'); else A.render();
    const s = X.deadlineStatus(data);
    A.toast(`📄 ${data.title}: ${leftText(s.left)} – Vorwarnung ab ${L.formatDate(s.remindDate)}`);
  });

  function dlRow(d) {
    const s = X.deadlineStatus(d);
    const t = X.DEADLINE_TYPES[d.type] || X.DEADLINE_TYPES.sonstiges;
    return `<button class="ev-row dl ${s.state}" data-dl="${esc(d.id)}"><span class="ev-time">${t.emoji}</span>
      <span class="grow">${esc(d.title)}<span class="muted small">${L.formatDate(d.date)} · <b class="${s.state === 'ok' ? '' : 'warn-text'}">${leftText(s.left)}</b>${d.note ? ' · ' + esc(d.note) : ''}</span></span></button>`;
  }
  function renderDeadlines() {
    if (A.view !== 'deadlines') return;
    const list = [...st().deadlines].sort((a, b) => a.date.localeCompare(b.date));
    $('#dlList').innerHTML = list.length ? list.map(dlRow).join('') + '<p class="muted small">Neue Frist hinzufügen:</p>'
      : `<div class="empty"><div class="big-emoji">📄</div><p><b>Nie wieder abgelaufene Ausweise.</b></p><p class="muted">Ausweis, Reisepass, TÜV, Garantien oder Kündigungsfristen – die App warnt rechtzeitig vorher und trägt alles in den Kalender ein.</p></div>`;
  }
  $('#dlList').addEventListener('click', (e) => { const c = e.target.closest('[data-dl]'); if (c) openDl(st().deadlines.find((d) => d.id === c.dataset.dl)); });
  A.calendarSources.push((from, to) => st().deadlines.filter((d) => d.date >= from && d.date <= to)
    .map((d) => ({ date: d.date, kind: 'task', text: `${d.title} läuft ab`, emoji: (X.DEADLINE_TYPES[d.type] || {}).emoji || '📄', go: 'deadlines' })));
  async function checkDeadlineReminders() {
    let changed = false;
    for (const d of st().deadlines) {
      const s = X.deadlineStatus(d);
      if (s.state === 'ok') continue;
      const key = `dl:${d.id}@${d.date}`;
      if (st().notified.includes(key)) continue;
      st().notified.push(key);
      changed = true;
      await A.notify('📄 Frist', `${d.title}: ${leftText(s.left)}`, key);
    }
    if (changed) A.save();
  }

  // =====================================================================
  // 🔢 Zählerstände
  // =====================================================================
  $('#meterAdd').innerHTML = Object.entries(X.METER_TYPES).map(([k, t]) => `<button class="chip" data-newmeter="${k}">＋ ${t.emoji} ${t.label}</button>`).join('');
  $('#meterAdd').addEventListener('click', (e) => {
    const c = e.target.closest('[data-newmeter]');
    if (!c) return;
    const t = X.METER_TYPES[c.dataset.newmeter];
    st().meters.push({ id: A.uid(), type: c.dataset.newmeter, name: t.label, unit: t.unit, price: t.price, baseFee: 0, readings: [] });
    A.save(); A.render();
  });
  function renderMeters() {
    if (A.view !== 'meters') return;
    $('#meterList').innerHTML = st().meters.length ? st().meters.map((m) => {
      const t = X.METER_TYPES[m.type] || X.METER_TYPES.strom;
      const s = X.meterStats(m.readings, m.price || 0, m.baseFee || 0);
      const r = [...m.readings].sort((a, b) => b.date.localeCompare(a.date));
      const series = s ? s.series.map((x) => x.perDay) : [];
      return `<div class="card meter-card" data-meter="${esc(m.id)}">
        <h2>${t.emoji} ${esc(m.name)}</h2>
        <form class="addrow meter-form" autocomplete="off">
          <input class="mv" inputmode="decimal" placeholder="Stand in ${esc(m.unit)}${r[0] ? ' (zuletzt ' + fmt(r[0].value, 1) + ')' : ''}">
          <input class="md" type="date" value="${today()}" style="max-width:150px">
          <button class="btn primary" type="submit">＋</button>
        </form>
        ${s ? `<div class="statgrid">
            <div><b>${fmt(s.perDay, 2)}</b><span>${esc(m.unit)}/Tag Ø</span></div>
            <div><b>${s.lastPerDay != null ? fmt(s.lastPerDay, 2) : '–'}</b><span>zuletzt ${s.trend ? `<i class="${s.trend > 0 ? 'warn-text' : 'ok-text'}">${s.trend > 0 ? '+' : ''}${s.trend} %</i>` : ''}</span></div>
            <div><b>${fmt(s.year)}</b><span>${esc(m.unit)}/Jahr (hochgerechnet)</span></div>
            <div><b>${euro(s.costMonth)}</b><span>pro Monat · ${euro(s.costYear)}/Jahr</span></div>
          </div>
          ${series.length > 1 ? `<svg class="spark" viewBox="0 0 300 60" preserveAspectRatio="none"><path d="${F.sparkPath(series, 300, 60)}"/></svg>` : ''}`
          : `<p class="muted small">${r.length ? 'Noch einen Stand eintragen – dann rechne ich Verbrauch und Kosten aus.' : 'Trage den aktuellen Zählerstand ein (am besten immer am Monatsanfang).'}</p>`}
        <div class="w-list">${r.slice(0, 4).map((x) => `<div class="small">${L.formatDate(x.date)} · <b>${fmt(x.value, 1)} ${esc(m.unit)}</b> <button class="icon-sm" data-mdel="${x.date}" aria-label="löschen">✕</button></div>`).join('')}</div>
        <details class="tarif"><summary class="small">Tarif & Einstellungen</summary>
          <div class="row tight">
            <label>Preis je ${esc(m.unit)} (€)<input class="mp" inputmode="decimal" value="${fmt(m.price, 4)}"></label>
            <label>Grundgebühr/Jahr (€)<input class="mb" inputmode="decimal" value="${fmt(m.baseFee || 0, 2)}"></label>
          </div>
          <button class="btn small danger" data-mremove>Zähler löschen</button>
        </details>
      </div>`;
    }).join('') + '<p class="muted small">Weiteren Zähler hinzufügen:</p>'
      : `<div class="empty"><div class="big-emoji">🔢</div><p><b>Verbrauch im Blick.</b></p><p class="muted">Trage regelmäßig deine Zählerstände ein – die App rechnet Verbrauch, Jahreshochrechnung und Kosten aus. So gibt es bei der Nebenkostenabrechnung keine Überraschung.</p></div>`;
  }
  const meterOf = (el) => st().meters.find((m) => m.id === el.closest('[data-meter]').dataset.meter);
  $('#meterList').addEventListener('submit', (e) => {
    e.preventDefault();
    const m = meterOf(e.target);
    const v = num(e.target.querySelector('.mv').value);
    const d = e.target.querySelector('.md').value || today();
    if (v == null) { A.toast('Bitte den Zählerstand eintragen'); return; }
    const last = [...m.readings].filter((x) => x.date < d).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (last && v < last.value && !confirm('Der Stand ist kleiner als der letzte. Trotzdem speichern (z. B. neuer Zähler)?')) return;
    m.readings = m.readings.filter((x) => x.date !== d).concat({ date: d, value: v });
    A.save(); A.render();
    A.toast(`${(X.METER_TYPES[m.type] || {}).emoji || '🔢'} ${fmt(v, 1)} ${m.unit} gespeichert`);
  });
  $('#meterList').addEventListener('click', (e) => {
    const del = e.target.closest('[data-mdel]');
    if (del) { const m = meterOf(del); m.readings = m.readings.filter((x) => x.date !== del.dataset.mdel); A.save(); A.render(); return; }
    const rm = e.target.closest('[data-mremove]');
    if (rm) { const m = meterOf(rm); if (confirm(`Zähler „${m.name}“ mit allen Ständen löschen?`)) { st().meters = st().meters.filter((x) => x !== m); A.save(); A.render(); } }
  });
  $('#meterList').addEventListener('change', (e) => {
    if (!e.target.matches('.mp, .mb')) return;
    const m = meterOf(e.target);
    if (e.target.matches('.mp')) m.price = num(e.target.value) || 0;
    else m.baseFee = num(e.target.value) || 0;
    A.save(); A.render();
  });

  // =====================================================================
  // 🧰 Werkzeuge
  // =====================================================================
  const timers = []; // { id, name, end, paused, left, rang }
  let tick = null;
  function startTimer(name, minutes) {
    timers.push({ id: A.uid(), name: name || `${fmt(minutes, 1)} Min`, end: Date.now() + minutes * 60000, total: minutes * 60 });
    if (!tick) tick = setInterval(tickTimers, 500);
    renderTimers();
    A.toast(`⏲️ Timer ${name ? '„' + name + '“ ' : ''}läuft (${fmt(minutes, 1)} Min)`);
  }
  function tickTimers() {
    for (const t of timers) {
      if (!t.paused && !t.rang && t.end <= Date.now()) {
        t.rang = true;
        if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 800]);
        A.beep(4, 880, 0.3);
        A.notify('⏲️ Timer abgelaufen', t.name, 'timer-' + t.id);
        A.toast(`⏲️ ${t.name} – fertig!`);
      }
    }
    if (!timers.length) { clearInterval(tick); tick = null; }
    renderTimers();
  }
  function renderTimers() {
    const el = $('#tmList');
    if (!el) return;
    el.innerHTML = timers.map((t) => {
      const left = t.paused ? t.left : Math.max(0, (t.end - Date.now()) / 1000);
      return `<div class="timer ${t.rang ? 'done' : ''}" data-tm="${t.id}">⏲️ <b>${t.rang ? 'Fertig!' : L.formatTimer(left)}</b>
        <span class="muted small">${esc(t.name)}</span>
        ${t.rang ? '' : `<button class="icon-sm" data-tmp>${t.paused ? '▶' : '⏸'}</button><button class="icon-sm" data-tmplus>+1</button>`}
        <button class="icon-sm" data-tmx aria-label="Timer löschen">✕</button></div>`;
    }).join('');
  }
  $('#tmQuick').addEventListener('click', (e) => { const c = e.target.closest('[data-min]'); if (c) startTimer($('#tmName').value.trim(), Number(c.dataset.min)); });
  $('#tmForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const m = num($('#tmMin').value);
    if (!m) { A.toast('Bitte Minuten eingeben'); return; }
    startTimer($('#tmName').value.trim(), m);
    $('#tmName').value = ''; $('#tmMin').value = '';
  });
  $('#tmList').addEventListener('click', (e) => {
    const row = e.target.closest('[data-tm]');
    if (!row) return;
    const t = timers.find((x) => x.id === row.dataset.tm);
    if (e.target.closest('[data-tmx]')) timers.splice(timers.indexOf(t), 1);
    else if (e.target.closest('[data-tmp]')) {
      if (t.paused) { t.end = Date.now() + t.left * 1000; t.paused = false; } else { t.left = Math.max(0, (t.end - Date.now()) / 1000); t.paused = true; }
    } else if (e.target.closest('[data-tmplus]')) { if (t.paused) t.left += 60; else t.end += 60000; }
    renderTimers();
  });

  // Stoppuhr
  let sw = { start: null, acc: 0, laps: [] };
  let swTick = null;
  const swNow = () => sw.acc + (sw.start ? Date.now() - sw.start : 0);
  const swFmt = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')},${Math.floor((ms % 1000) / 100)}`;
  function renderSw() {
    $('#swTime').textContent = swFmt(swNow());
    $('#swStart').textContent = sw.start ? 'Stopp' : sw.acc ? 'Weiter' : 'Start';
    $('#swLaps').innerHTML = sw.laps.map((l, i) => `Runde ${i + 1}: ${swFmt(l)}`).reverse().join('<br>');
  }
  $('#swStart').onclick = () => {
    if (sw.start) { sw.acc += Date.now() - sw.start; sw.start = null; clearInterval(swTick); }
    else { sw.start = Date.now(); swTick = setInterval(renderSw, 100); }
    renderSw();
  };
  $('#swLap').onclick = () => { if (sw.start || sw.acc) { sw.laps.push(swNow()); renderSw(); } };
  $('#swReset').onclick = () => { clearInterval(swTick); sw = { start: null, acc: 0, laps: [] }; renderSw(); };

  // Umrechner
  const units = [['g', 'Gramm'], ...Object.entries(X.VOLUME_LABEL)];
  $('#cvFrom').innerHTML = units.map(([k, l]) => `<option value="${k}">${l}</option>`).join('');
  $('#cvTo').innerHTML = units.map(([k, l]) => `<option value="${k}">${l}</option>`).join('');
  $('#cvFrom').value = 'tasse'; $('#cvTo').value = 'g';
  $('#cvIng').innerHTML = Object.entries(X.DENSITY_LABEL).map(([k, l]) => `<option value="${k}">${l}</option>`).join('');
  $('#cvIng').value = 'mehl';
  function renderConvert() {
    const v = num($('#cvVal').value);
    const r = X.convertKitchen(v, $('#cvFrom').value, $('#cvTo').value, $('#cvIng').value);
    const lab = (k) => (units.find((u) => u[0] === k) || [k, k])[1];
    $('#cvResult').innerHTML = r == null ? '' : `${fmt(v, 2)} ${lab($('#cvFrom').value)} ${X.DENSITY_LABEL[$('#cvIng').value]} = <b>${fmt(r, 2)} ${lab($('#cvTo').value)}</b>`;
  }
  ['#cvVal', '#cvFrom', '#cvTo', '#cvIng'].forEach((s) => $(s).addEventListener('input', renderConvert));
  $('#ovC').addEventListener('input', () => { const c = num($('#ovC').value); $('#ovF').value = c != null ? X.cToF(c) : ''; renderOven(c); });
  $('#ovF').addEventListener('input', () => { const f = num($('#ovF').value); const c = f != null ? X.fToC(f) : null; $('#ovC').value = c ?? ''; renderOven(c); });
  function renderOven(c) { $('#ovResult').innerHTML = c != null ? `Ober-/Unterhitze <b>${c} °C</b> = Umluft ca. <b>${X.toUmluft(c)} °C</b> = <b>${X.cToF(c)} °F</b>` : ''; }

  // Rechnung teilen
  let tip = 0;
  $('#spTip').addEventListener('click', (e) => { const c = e.target.closest('[data-tip]'); if (!c) return; tip = Number(c.dataset.tip); $$('#spTip .chip').forEach((x) => x.classList.toggle('active', x === c)); renderSplit(); });
  function renderSplit() {
    const total = num($('#spTotal').value), p = parseInt($('#spPeople').value, 10);
    if (!total || !p) { $('#spResult').innerHTML = ''; return; }
    const r = X.splitBill(total, p, tip);
    $('#spResult').innerHTML = `Gesamt ${euro(r.total)}${r.tip ? ` (inkl. ${euro(r.tip)} Trinkgeld)` : ''}<br>Pro Person: <b>${euro(r.each)}</b>${r.first !== r.each ? ` · eine Person zahlt ${euro(r.first)} (Rundung)` : ''}`;
  }
  $('#spTotal').addEventListener('input', renderSplit);
  $('#spPeople').addEventListener('input', renderSplit);

  // Zufall
  const showRandom = (html) => { $('#rdResult').innerHTML = html; $('#rdResult').classList.remove('pop'); void $('#rdResult').offsetWidth; $('#rdResult').classList.add('pop'); };
  $('#rdCoin').onclick = () => showRandom(Math.random() < 0.5 ? '🪙 <b>Kopf</b>' : '🪙 <b>Zahl</b>');
  $('#rdDice').onclick = () => showRandom(`🎲 <b>${1 + Math.floor(Math.random() * 6)}</b>`);
  $('#rdCook').onclick = () => {
    const ranked = L.suggestRecipes(window.FridgeRecipes.concat(st().customRecipes), st().items, new Date(), { minCoverage: 0.5 }).slice(0, 10).map((r) => r.recipe);
    const pool = ranked.length ? ranked : window.FridgeRecipes;
    const r = pool[Math.floor(Math.random() * pool.length)];
    showRandom(`${r.emoji} <b>${esc(r.name)}</b> <button class="link-btn" data-goto="recipes">ansehen</button>`);
  };
  $('#rdPick').onclick = () => {
    const p = X.pick($('#rdList').value.split(','));
    showRandom(p ? `🎯 <b>${esc(p)}</b>` : 'Bitte Namen mit Komma getrennt eintragen');
  };

  // =====================================================================
  // 🧘 Atemübung
  // =====================================================================
  let brPattern = 'box';
  $('#brPattern').innerHTML = Object.entries(X.BREATHING).map(([k, b]) => `<button class="chip ${k === brPattern ? 'active' : ''}" data-bp="${k}">${b.label}</button>`).join('');
  $('#brPattern').addEventListener('click', (e) => { const c = e.target.closest('[data-bp]'); if (!c) return; brPattern = c.dataset.bp; $$('#brPattern .chip').forEach((x) => x.classList.toggle('active', x === c)); });
  const brDlg = $('#breathDialog');
  let br = null;
  let brWake = null;
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-br]'); if (b) startBreathing(Number(b.dataset.br)); });
  async function startBreathing(min) {
    br = { start: Date.now(), total: min * 60, last: -1, tick: setInterval(brTick, 100) };
    $('#brTitle').textContent = X.BREATHING[brPattern].label;
    brDlg.showModal();
    brTick();
    try { if (navigator.wakeLock) brWake = await navigator.wakeLock.request('screen'); } catch (e) { /* egal */ }
  }
  function brTick() {
    if (!br) return;
    const t = (Date.now() - br.start) / 1000;
    if (t >= br.total) { stopBreathing(true); return; }
    const p = X.breathingPhase(brPattern, t);
    $('#brPhase').textContent = p.name;
    $('#brCount').textContent = Math.ceil(p.left);
    $('#brLeft').textContent = `noch ${L.formatTimer(br.total - t)}`;
    const key = p.cycle + ':' + p.index;
    if (key !== br.last) {
      br.last = key;
      const c = $('#brCircle');
      c.style.transitionDuration = p.dur + 's';
      c.className = 'br-circle ' + (p.name === 'Einatmen' ? 'in' : p.name === 'Ausatmen' ? 'out' : c.classList.contains('in') ? 'in hold' : 'out hold');
      if (navigator.vibrate) navigator.vibrate(30);
    }
  }
  function stopBreathing(done) {
    clearInterval(br && br.tick);
    br = null;
    if (brWake) { brWake.release().catch(() => {}); brWake = null; }
    if (brDlg.open) brDlg.close();
    if (done) {
      A.beep(2, 528, 0.3);
      const med = st().habits.find((h) => /meditation|atem/i.test(h.name));
      if (med) {
        const d = today();
        st().habitLog[d] = st().habitLog[d] || {};
        st().habitLog[d][med.id] = (st().habitLog[d][med.id] || 0) + 1;
        A.save(); A.render();
      }
      A.toast(`🧘 Gut gemacht!${med ? ` „${med.name}“ abgehakt.` : ''}`);
    }
  }
  $('#brClose').onclick = () => stopBreathing(false);
  brDlg.addEventListener('cancel', (e) => { e.preventDefault(); stopBreathing(false); });

  // =====================================================================
  // 🏆 Erfolge & Wochenrückblick
  // =====================================================================
  function weekStats(offsetWeeks = 0) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const monday = new Date(d.getTime() - ((d.getDay() + 6) % 7) * 86400000 - offsetWeeks * 7 * 86400000);
    const from = L.toISODate(monday);
    const to = L.toISODate(new Date(monday.getTime() + 6 * 86400000));
    const inW = (x) => x >= from && x <= to;
    const s = st();
    const wo = s.workouts.filter((w) => inW(w.date));
    const foodDays = [...new Set((s.food || []).filter((f) => inW(f.date)).map((f) => f.date))];
    const kcalAvg = foodDays.length ? Math.round((s.food || []).filter((f) => inW(f.date)).reduce((a, f) => a + f.kcal, 0) / foodDays.length) : null;
    const spent = s.expenses.filter((e) => inW(e.date) && !P.isIncome(e) && e.repeat !== 'monthly').reduce((a, e) => a + e.amount, 0);
    const tasksDone = s.tasks.filter((t) => (t.doneAt && inW(t.doneAt)) || (t.lastDone && inW(t.lastDone))).length;
    let habitMet = 0, habitAll = 0;
    for (let i = 0; i < 7; i++) {
      const day = L.toISODate(new Date(monday.getTime() + i * 86400000));
      if (day > today()) break;
      for (const h of s.habits) { habitAll++; if (((s.habitLog[day] || {})[h.id] || 0) >= h.target) habitMet++; }
    }
    const hist = s.history.filter((h) => inW(h.date));
    const moods = Object.entries(s.moods).filter(([dd]) => inW(dd)).map(([, m]) => m.mood);
    return {
      from, to, workouts: wo.length, minutes: Math.round(wo.reduce((a, w) => a + w.seconds, 0) / 60), kcalAvg, spent: Math.round(spent * 100) / 100, tasksDone,
      habitPct: habitAll ? Math.round((habitMet / habitAll) * 100) : null, consumed: hist.filter((h) => h.kind === 'consumed').length, wasted: hist.filter((h) => h.kind === 'wasted').length,
      mood: moods.length ? Math.round((moods.reduce((a, b) => a + b, 0) / moods.length) * 10) / 10 : null,
    };
  }
  function reviewHtml(w, prev) {
    const cmp = (a, b, goodUp = true) => (b == null || a == null || a === b ? '' : `<span class="${(a > b) === goodUp ? 'ok-text' : 'warn-text'}">${a > b ? '▲' : '▼'}</span>`);
    const item = (emoji, val, label, c = '') => `<div><b>${emoji} ${val}${c}</b><span>${label}</span></div>`;
    return `<div class="statgrid review">
      ${item('🏋️', w.workouts, `Training${w.workouts === 1 ? '' : 's'} · ${w.minutes} Min`, cmp(w.workouts, prev.workouts))}
      ${item('✅', w.tasksDone, 'Aufgaben erledigt', cmp(w.tasksDone, prev.tasksDone))}
      ${item('💧', w.habitPct == null ? '–' : w.habitPct + ' %', 'Gewohnheiten erfüllt', cmp(w.habitPct, prev.habitPct))}
      ${item('💶', euro(w.spent), 'ausgegeben (ohne Fixkosten)', cmp(w.spent, prev.spent, false))}
      ${item('🧊', `${w.consumed}/${w.wasted}`, 'verbraucht / weggeworfen', cmp(w.wasted, prev.wasted, false))}
      ${item('🍽️', w.kcalAvg == null ? '–' : fmt(w.kcalAvg), 'kcal Ø pro Tag')}
    </div>${w.mood != null ? `<p class="small muted">Stimmung im Schnitt: ${F.MOODS[Math.round(w.mood) - 1].emoji} ${String(w.mood).replace('.', ',')}</p>` : ''}`;
  }
  function renderAchievements() {
    if (A.view !== 'achievements') return;
    const w = weekStats(0), prev = weekStats(1);
    $('#weekReview').innerHTML = `<h2>📊 Diese Woche <span class="muted small">${L.formatDate(w.from).slice(0, 6)} – ${L.formatDate(w.to).slice(0, 6)}</span></h2>${reviewHtml(w, prev)}<p class="muted small">▲▼ im Vergleich zur Vorwoche</p>`;
    const list = X.achievements(st(), today());
    $('#achList').innerHTML = list.map((a) => `<div class="ach ${a.done ? 'done' : ''}"><span class="ach-emoji">${a.done ? a.emoji : '🔒'}</span><b>${esc(a.title)}</b><span class="small muted">${esc(a.desc)}</span>
      ${!a.done && a.progress ? `<div class="meter"><i style="width:${Math.round(a.progress * 100)}%"></i></div>` : ''}</div>`).join('');
  }
  function checkNewAchievements() {
    const seen = st().settings.achSeen || (st().settings.achSeen = []);
    const fresh = X.achievements(st(), today()).filter((a) => a.done && !seen.includes(a.id));
    if (!fresh.length) return;
    fresh.forEach((a) => seen.push(a.id));
    A.save();
    // Beim allerersten Start nicht mit vielen Meldungen überfluten
    if (fresh.length <= 2) A.toast(`🏆 Erfolg freigeschaltet: ${fresh.map((a) => a.emoji + ' ' + a.title).join(', ')}`, { label: 'Ansehen', fn: () => A.showView('achievements') });
  }

  // =====================================================================
  // 🐷 Sparziele (in Ausgaben)
  // =====================================================================
  function renderSavings() {
    if (A.view !== 'expenses') return;
    $('#savingsList').innerHTML = st().savings.map((g) => {
      const p = X.savingsPlan(g);
      return `<div class="saving" data-sv="${esc(g.id)}">
        <div class="saving-head"><b>${esc(g.emoji || '🐷')} ${esc(g.name)}</b><span class="small">${euro(g.saved)} / ${euro(g.target)}</span></div>
        <div class="meter"><i style="width:${p.pct}%"></i></div>
        <div class="small muted">${p.done ? '🎉 Ziel erreicht!' : `noch ${euro(p.left)}${p.perMonth ? ` · ${euro(p.perMonth)} pro Monat bis ${L.formatDate(g.until).slice(3)}` : ''}`}
          <button class="link-btn" data-svadd>＋ Einzahlen</button> <button class="link-btn" data-svdel>Löschen</button></div>
      </div>`;
    }).join('') || '<p class="muted small">Spare gezielt – z. B. für Urlaub, ein neues Fahrrad oder einen Notgroschen.</p>';
  }
  $('#btnSavingNew').onclick = () => {
    const name = prompt('Wofür sparst du?', 'Urlaub');
    if (!name) return;
    const target = num(prompt('Zielbetrag in €:', '1000'));
    if (!target) return;
    const until = prompt('Bis wann? (MM.JJJJ, leer = offen)', '');
    let untilIso = null;
    const m = (until || '').match(/^(\d{1,2})\.(\d{4})$/);
    if (m) untilIso = `${m[2]}-${String(m[1]).padStart(2, '0')}-01`;
    st().savings.push({ id: A.uid(), name: name.trim(), target, saved: 0, until: untilIso, emoji: /urlaub|reise/i.test(name) ? '🏖️' : /auto|fahrrad|rad/i.test(name) ? '🚲' : /notgroschen|reserve/i.test(name) ? '🛟' : '🐷' });
    A.save(); A.render();
  };
  $('#savingsList').addEventListener('click', (e) => {
    const row = e.target.closest('[data-sv]');
    if (!row) return;
    const g = st().savings.find((x) => x.id === row.dataset.sv);
    if (e.target.closest('[data-svadd]')) {
      const v = num(prompt(`Wie viel legst du für „${g.name}“ zurück? (€, minus zum Entnehmen)`, '50'));
      if (!v) return;
      g.saved = Math.max(0, Math.round((g.saved + v) * 100) / 100);
      A.save(); A.render();
      if (g.saved >= g.target) A.toast(`🎉 Sparziel „${g.name}“ erreicht!`);
    } else if (e.target.closest('[data-svdel]')) {
      if (confirm(`Sparziel „${g.name}“ löschen?`)) { st().savings = st().savings.filter((x) => x !== g); A.save(); A.render(); }
    }
  });
  $('#btnIncomeNew').onclick = () => A.openExpense({ category: 'einnahme', title: 'Neue Einnahme' });

  // =====================================================================
  // 📋 Notiz-Vorlagen
  // =====================================================================
  $('#btnNoteTpl').onclick = () => A.openPicker('Vorlage wählen', X.NOTE_TEMPLATES.map((t, i) => ({ id: String(i), label: t.title, sub: t.text.split('\n').slice(0, 3).join(' · ').replace(/\[ \] /g, '') })), (i) => {
    const t = X.NOTE_TEMPLATES[Number(i)];
    st().notes.push({ id: A.uid(), title: t.title, text: t.text, pinned: false, color: '', created: new Date().toISOString(), updated: new Date().toISOString() });
    A.save(); A.render();
    A.toast(`📋 „${t.title}“ angelegt – einfach abhaken oder ergänzen`);
  }, false);

  // =====================================================================
  // 🏠 Startseite: zusätzliche Karten + anpassen
  // =====================================================================
  const HOME_CARDS = {
    weather: '🌤️ Wetter', tasks: '✅ Aufgaben', habits: '💧 Gewohnheiten', food: '🍽️ Kalorien', meds: '💊 Medikamente', deadlines: '📄 Fristen',
    events: '📅 Termine', kitchen: '🧊 Küche', sport: '🏋️ Sport', expenses: '💶 Ausgaben', shopping: '🛒 Einkauf', review: '📊 Wochenrückblick', backup: '💾 Sicherung',
  };
  // Reihenfolge und Bereich der Karten auf der Startseite
  const HOME_ORDER = {
    weather: [1, 'top'], events: [11, 'today'], tasks: [12, 'today'], meds: [13, 'today'], habits: [14, 'today'], deadlines: [15, 'today'],
    kitchen: [21, 'kitchen'], food: [22, 'kitchen'], shopping: [23, 'kitchen'],
    sport: [31, 'fit'], expenses: [32, 'fit'], backup: [41, 'review'], review: [42, 'review'],
  };
  const SEC_ORDER = { today: 10, kitchen: 20, fit: 30, review: 40 };
  const GOTO_KEY = { calendar: 'events', stock: 'kitchen', sport: 'sport', expenses: 'expenses', shopping: 'shopping', tasks: 'tasks', habits: 'habits', food: 'food', meds: 'meds', deadlines: 'deadlines', achievements: 'review' };
  function renderHomeExtras() {
    if (A.view !== 'home') return;
    const parts = [];
    // Medikamente
    const doses = X.dosesOn(st().meds, today(), st().medLog);
    if (doses.length) {
      const open = doses.filter((d) => !d.taken);
      parts.push(`<div class="card home-card" data-card="meds"><button class="plain" data-goto="meds"><div class="home-title">💊 Medikamente <span class="muted small">${doses.length - open.length}/${doses.length}</span></div></button>
        ${open.length ? open.slice(0, 4).map(doseRow).join('') : '<div class="home-line">Alles für heute genommen ✅</div>'}</div>`);
    }
    // Fristen
    const due = st().deadlines.map((d) => ({ d, s: X.deadlineStatus(d) })).filter((x) => x.s.state !== 'ok').sort((a, b) => a.s.left - b.s.left);
    if (due.length) {
      parts.push(`<button class="card home-card" data-card="deadlines" data-goto="deadlines"><div class="home-title">📄 Fristen</div>
        ${due.slice(0, 3).map(({ d, s }) => `<div class="home-line ${s.state === 'overdue' ? 'warn-text' : ''}">${(X.DEADLINE_TYPES[d.type] || {}).emoji || '📄'} <b>${esc(d.title)}</b> – ${leftText(s.left)}</div>`).join('')}</button>`);
    }
    // Wochenrückblick (So & Mo)
    const wd = new Date().getDay();
    if ((wd === 0 || wd === 1) && (st().workouts.length || st().tasks.length || st().history.length || st().expenses.length)) {
      const w = weekStats(wd === 1 ? 1 : 0), prev = weekStats(wd === 1 ? 2 : 1);
      parts.push(`<div class="card home-card" data-card="review"><button class="plain" data-goto="achievements"><div class="home-title">📊 ${wd === 1 ? 'Deine letzte Woche' : 'Deine Woche'}</div></button>${reviewHtml(w, prev)}</div>`);
    }
    // Sicherung
    const amount = st().items.length + st().tasks.length + st().events.length + st().expenses.length + st().notes.length + (st().food || []).length;
    const last = st().settings.lastBackup;
    if (amount >= 15 && (!last || L.daysUntil(last) < -30)) {
      parts.push(`<div class="card home-card backup" data-card="backup"><div class="home-title">💾 Sicherung empfohlen</div>
        <div class="home-line muted">${last ? `Letzte Sicherung vor ${-L.daysUntil(last)} Tagen.` : 'Du hast noch keine Sicherung gemacht.'} Deine Daten liegen nur auf diesem Handy.</div>
        <button class="btn small primary" data-backup>⬇️ Jetzt sichern</button></div>`);
    }
    $('#homeExtras').innerHTML = parts.join('');
  }
  document.addEventListener('click', (e) => { if (e.target.closest('[data-backup]')) $('#btnExport').click(); });

  /** Ausgeblendete Karten verstecken (läuft als letzter Render-Schritt). */
  function applyHomeHidden() {
    if (A.view !== 'home') return;
    const hidden = st().settings.homeHidden;
    $$('#view-home .home-card').forEach((c) => {
      let key = c.dataset.card;
      if (!key) {
        if (c.classList.contains('weather')) key = 'weather';
        else { const g = c.dataset.goto || (c.querySelector('[data-goto]') || {}).dataset?.goto; key = GOTO_KEY[g] || g; }
        if (key) c.dataset.card = key;
      }
      c.hidden = hidden.includes(key);
      const o = HOME_ORDER[key] || [90, 'review'];
      c.style.order = o[0];
      c.dataset.sec = o[1];
    });
    // Überschriften nur zeigen, wenn im Bereich auch etwas steht
    $$('#homeFlow .sec-title').forEach((h) => {
      h.style.order = SEC_ORDER[h.dataset.sec];
      h.hidden = !$$(`#homeFlow .home-card[data-sec="${h.dataset.sec}"]`).some((c) => !c.hidden);
    });
    renderGlance();
  }
  A.applyHomeHidden = applyHomeHidden;

  /** Kurzüberblick unter der Begrüßung: was heute ansteht. */
  function renderGlance() {
    const t = today();
    const chips = [];
    const b = F.taskBuckets(st().tasks);
    const tasks = b.overdue.length + b.today.length;
    if (tasks) chips.push(['tasks', '✅', `${tasks} Aufgabe${tasks > 1 ? 'n' : ''}`, b.overdue.length ? 'warn' : '']);
    const ev = P.occurrences(st().events, t, t).length;
    if (ev) chips.push(['calendar', '📅', `${ev} Termin${ev > 1 ? 'e' : ''}`, '']);
    const meds = X.dosesOn(st().meds, t, st().medLog).filter((d) => !d.taken).length;
    if (meds) chips.push(['meds', '💊', `${meds} Einnahme${meds > 1 ? 'n' : ''}`, '']);
    const exp = st().items.filter((i) => i.expiry && L.daysUntil(i.expiry) <= 1).length;
    if (exp) chips.push(['stock', '⏰', `${exp} läuft ab`, 'warn']);
    const shop = st().shopping.filter((i) => !i.done).length;
    if (shop) chips.push(['shopping', '🛒', `${shop} einkaufen`, '']);
    $('#homeGlance').innerHTML = chips.length
      ? chips.map(([g, e, txt, cls]) => `<button class="glance-chip ${cls}" data-goto="${g}">${e} ${txt}</button>`).join('')
      : '<span class="glance-chip calm">✨ Heute steht nichts Dringendes an</span>';
  }
  function renderHomeToggles() {
    const hidden = st().settings.homeHidden;
    $('#homeCardToggles').innerHTML = Object.entries(HOME_CARDS).map(([k, l]) => `<button class="chip ${hidden.includes(k) ? '' : 'active'}" data-hc="${k}">${l}</button>`).join('');
    const last = st().settings.lastBackup;
    $('#backupInfo').textContent = last ? `Letzte Sicherung: ${L.formatDate(last)}` : 'Noch keine Sicherung gespeichert.';
  }
  $('#homeCardToggles').addEventListener('click', (e) => {
    const c = e.target.closest('[data-hc]');
    if (!c) return;
    const k = c.dataset.hc;
    const h = st().settings.homeHidden;
    st().settings.homeHidden = h.includes(k) ? h.filter((x) => x !== k) : h.concat(k);
    A.save(); A.render();
  });

  function renderHub() {
    const doses = X.dosesOn(st().meds, today(), st().medLog);
    $('#hubMeds').textContent = doses.length ? `${doses.filter((d) => d.taken).length}/${doses.length} heute` : st().meds.length ? 'heute nichts' : 'Einnahmeplan';
    const due = st().deadlines.filter((d) => X.deadlineStatus(d).state !== 'ok').length;
    $('#hubDeadlines').textContent = due ? `${due} bald fällig` : `${st().deadlines.length} Fristen`;
    $('#hubMeters').textContent = st().meters.length ? `${st().meters.length} Zähler` : 'Strom, Wasser, Gas';
    const ach = X.achievements(st(), today());
    $('#hubAch').textContent = `${ach.filter((a) => a.done).length}/${ach.length} Erfolge`;
  }

  // Schnellmenü & Start
  A.actions.timer = () => { A.showView('tools'); setTimeout(() => $('#tmName').focus(), 50); };
  A.actions.medtaken = () => A.showView('meds');
  A.actions.deadline = () => { A.showView('deadlines'); openDl(null, 'ausweis'); };
  A.onRender(renderMeds);
  A.onRender(renderDeadlines);
  A.onRender(renderMeters);
  A.onRender(renderAchievements);
  A.onRender(renderSavings);
  A.onRender(renderHomeExtras);
  A.onRender(renderHub);
  A.onRender(renderHomeToggles);
  A.onRender(renderTimers);
  A.onRender(applyHomeHidden);
  A.onRender(checkNewAchievements);
  renderConvert();
  renderSw();
  setInterval(() => { checkMedReminders(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkMedReminders(); checkDeadlineReminders(); } });
  // Daten dauerhaft speichern lassen (Browser räumt sie dann nicht von selbst auf)
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persisted().then((p) => { if (!p) navigator.storage.persist(); }); } catch (e) { /* egal */ }
  A.render();
  checkMedReminders();
  checkDeadlineReminders();
  const view = new URLSearchParams(location.search).get('view');
  if (view) A.showView(view);
})();
