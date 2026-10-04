/* Oberfläche für Verträge & Abos, Checklisten & Routinen, Stundenplan, Prozent- und Schlafrechner
   sowie die Kopfzeile. Baut auf window.App und window.FridgeOrganize auf. */
(() => {
  'use strict';
  const A = window.App;
  const L = A.L;
  const O = window.FridgeOrganize;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const esc = A.esc;
  const st = () => A.state;
  const today = () => A.today();
  const euro = (v) => L.formatEuro(v);
  const num = (v) => (v === '' || v == null ? null : L.parsePrice(String(v)));
  const fmt = (v, d = 2) => (v == null ? '–' : Number(v).toLocaleString('de-DE', { maximumFractionDigits: d }));
  for (const k of ['contracts', 'checklists', 'timetables']) if (!Array.isArray(st()[k])) st()[k] = [];
  const leftText = (n) => (n < 0 ? `vor ${-n} Tagen` : n === 0 ? 'heute' : n === 1 ? 'morgen' : `in ${n} Tagen`);

  // =====================================================================
  // Kopfzeile: Untertitel, Suche, Profil, Schatten beim Scrollen
  // =====================================================================
  const TAB_TITLES = { home: null, stock: 'Vorrat', shopping: 'Einkaufsliste', settings: 'Mehr', prefs: 'Einstellungen' };
  function renderHeader() {
    const v = A.view;
    let sub;
    if (v === 'home') sub = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
    else sub = TAB_TITLES[v] || ($(`#view-${v} .viewhead h2`) || {}).textContent || 'dein Alltagshelfer';
    $('#brandSub').textContent = sub;
    const name = (st().settings.name || '').trim();
    const av = $('#topAvatar');
    av.classList.toggle('named', !!name);
    av.innerHTML = name ? esc(name[0].toUpperCase()) : '<i class="ic ic-user"></i>';
    av.setAttribute('aria-label', name ? `${name} – Einstellungen` : 'Einstellungen');
  }
  $('#topSearch').addEventListener('click', () => {
    if (A.view !== 'home') A.showView('home');
    setTimeout(() => { const s = $('#globalSearch'); s.scrollIntoView({ block: 'center' }); s.focus(); }, 30);
  });
  /** Einstellungen öffnen und einen Abschnitt aufklappen (z. B. „prefWeather“) */
  A.openPref = (id) => {
    A.showView('prefs');
    const d = id && document.getElementById(id);
    if (d) { d.open = true; setTimeout(() => d.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60); }
  };
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-pref]'); if (b) A.openPref(b.dataset.pref); });
  const onScroll = () => $('.topbar').classList.toggle('scrolled', window.scrollY > 4);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // =====================================================================
  // Verträge & Abos
  // =====================================================================
  const ctrDlg = $('#contractDialog');
  let editingCtr = null, ctrType = 'handy';
  $('#ctrType').innerHTML = Object.entries(O.CONTRACT_TYPES).map(([k, t]) => `<button type="button" class="chip" data-v="${k}">${t.label}</button>`).join('');
  $('#ctrAdd').innerHTML = Object.entries(O.CONTRACT_TYPES).map(([k, t]) => `<button class="chip" data-newctr="${k}">＋ ${t.label}</button>`).join('');
  function setCtrType(k, fill) {
    ctrType = k;
    $$('#ctrType [data-v]').forEach((b) => b.classList.toggle('active', b.dataset.v === k));
    if (fill) {
      const t = O.CONTRACT_TYPES[k];
      $('#ctrMin').value = t.min; $('#ctrRenew').value = t.renew; $('#ctrNotice').value = t.notice; $('#ctrUnit').value = t.unit;
      $('#ctrInterval').value = k === 'versicherung' ? 'jahr' : 'monat';
    }
  }
  $('#ctrType').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) setCtrType(b.dataset.v, !editingCtr); });
  function openContract(c, type) {
    editingCtr = c || null;
    $('#ctrDlgTitle').textContent = c ? 'Vertrag bearbeiten' : 'Neuer Vertrag';
    setCtrType(c ? c.type : type || 'handy', !c);
    $('#ctrName').value = c ? c.name : '';
    $('#ctrCost').value = c && c.cost ? String(c.cost).replace('.', ',') : '';
    $('#ctrStart').value = c ? c.start : '';
    $('#ctrNote').value = c ? c.note || '' : '';
    if (c) { $('#ctrMin').value = c.min; $('#ctrRenew').value = c.renew; $('#ctrNotice').value = c.notice; $('#ctrUnit').value = c.unit || 'm'; $('#ctrInterval').value = c.interval || 'monat'; }
    $('#ctrDelete').hidden = !c;
    ctrDlg.showModal();
  }
  $('#ctrAdd').addEventListener('click', (e) => { const c = e.target.closest('[data-newctr]'); if (c) openContract(null, c.dataset.newctr); });
  $('#ctrCancel').onclick = () => ctrDlg.close();
  $('#ctrDelete').onclick = () => {
    if (!confirm(`„${editingCtr.name}“ löschen?`)) return;
    st().contracts = st().contracts.filter((c) => c.id !== editingCtr.id);
    A.save(); ctrDlg.close(); A.render();
  };
  $('#contractForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const int = (id, d) => { const v = parseInt($(id).value, 10); return Number.isFinite(v) ? v : d; };
    const data = { type: ctrType, name: $('#ctrName').value.trim(), cost: num($('#ctrCost').value) || 0, interval: $('#ctrInterval').value, start: $('#ctrStart').value,
      min: int('#ctrMin', 12), renew: Math.max(1, int('#ctrRenew', 1)), notice: int('#ctrNotice', 1), unit: $('#ctrUnit').value, note: $('#ctrNote').value.trim() };
    if (!data.start) return;
    if (editingCtr) Object.assign(st().contracts.find((c) => c.id === editingCtr.id), data);
    else st().contracts.push({ id: A.uid(), cancelled: null, ...data });
    A.save(); ctrDlg.close();
    if (A.view !== 'contracts') A.showView('contracts'); else A.render();
    const i = O.contractInfo(data, today());
    A.toast(`${data.name}: kündbar bis ${L.formatDate(i.cancelBy)} zum ${L.formatDate(i.end)}`);
  });
  function contractRow(c) {
    const i = O.contractInfo(c, today());
    const t = O.CONTRACT_TYPES[c.type] || O.CONTRACT_TYPES.sonstiges;
    const info = c.cancelled ? `gekündigt · endet ${L.formatDate(i.end)}`
      : `kündbar bis <b class="${i.state === 'soon' ? 'warn-text' : ''}">${L.formatDate(i.cancelBy)}</b> (${leftText(i.left)}) zum ${L.formatDate(i.end)}`;
    return `<div class="contract ${i.state}">
      <button class="plain grow" data-ctr="${esc(c.id)}"><span class="ctr-top"><b>${esc(c.name)}</b><span class="ctr-cost">${euro(c.cost)}<small> ${(O.INTERVALS[c.interval] || O.INTERVALS.monat).label.replace('pro ', '/ ')}</small></span></span>
        <span class="muted small">${t.label} · ${info}</span></button>
      ${c.cancelled ? '' : `<div class="parcel-actions"><button class="btn small" data-ctr-letter="${esc(c.id)}">Kündigung schreiben</button><button class="btn small" data-ctr-cancel="${esc(c.id)}">Gekündigt</button></div>`}
    </div>`;
  }
  function renderContracts() {
    if (A.view !== 'contracts') return;
    const tot = O.contractTotals(st().contracts);
    $('#ctrTotals').innerHTML = st().contracts.length
      ? `<div class="statgrid three"><div><b>${euro(tot.month)}</b><span>pro Monat</span></div><div><b>${euro(tot.year)}</b><span>pro Jahr</span></div><div><b>${tot.count}</b><span>laufende Verträge</span></div></div>`
      : `<div class="empty"><div class="big-emoji"><i class="ic ic-contract"></i></div><p><b>Nie wieder eine Kündigungsfrist verpassen.</b></p><p class="muted">Handy, Internet, Strom, Versicherung, Streaming – du siehst, was alles zusammen kostet und bis wann du kündigen kannst.</p></div>`;
    $('#ctrTotals').classList.toggle('bare', !st().contracts.length);
    const list = [...st().contracts].sort((a, b) => (a.cancelled ? 1 : 0) - (b.cancelled ? 1 : 0) || (O.contractInfo(a, today()).cancelBy || '').localeCompare(O.contractInfo(b, today()).cancelBy || ''));
    $('#ctrList').innerHTML = list.length ? `<div class="card list-card">${list.map(contractRow).join('')}</div>` : '';
  }
  function cancellationLetter(c) {
    const i = O.contractInfo(c, today());
    const name = (st().settings.emergency && st().settings.emergency.name) || st().settings.name || '[Dein Name]';
    return `Kündigung ${c.name}${c.note ? ` – ${c.note}` : ''}\n\nSehr geehrte Damen und Herren,\n\nhiermit kündige ich meinen Vertrag „${c.name}“${c.note ? ` (${c.note})` : ''} fristgerecht zum nächstmöglichen Zeitpunkt. Nach meiner Berechnung ist das der ${L.formatDate(i.end)}.\n\nBitte bestätigen Sie mir die Kündigung und das Vertragsende schriftlich.\n\nMit freundlichen Grüßen\n${name}\n${L.formatDate(today())}`;
  }
  $('#ctrList').addEventListener('click', async (e) => {
    const find = (id) => st().contracts.find((c) => c.id === id);
    const lt = e.target.closest('[data-ctr-letter]');
    if (lt) {
      const c = find(lt.dataset.ctrLetter);
      const text = cancellationLetter(c);
      st().notes.push({ id: A.uid(), title: `Kündigung ${c.name}`, text, pinned: false, color: '', created: new Date().toISOString(), updated: new Date().toISOString() });
      A.save();
      try { await navigator.clipboard.writeText(text); } catch (err) { /* nicht erlaubt */ }
      A.toast('Kündigungsschreiben als Notiz gespeichert (und kopiert)', { label: 'Ansehen', fn: () => A.showView('notes') });
      return;
    }
    const cn = e.target.closest('[data-ctr-cancel]');
    if (cn) {
      const c = find(cn.dataset.ctrCancel);
      const i = O.contractInfo(c, today());
      c.cancelled = today(); c.endDate = i.end;
      A.save(); A.render();
      A.toast(`Gekündigt – endet am ${L.formatDate(i.end)}`, { label: 'Rückgängig', fn: () => { c.cancelled = null; c.endDate = null; A.save(); A.render(); } });
      return;
    }
    const r = e.target.closest('[data-ctr]');
    if (r) openContract(find(r.dataset.ctr));
  });

  // =====================================================================
  // Checklisten & Routinen
  // =====================================================================
  const clDlg = $('#checklistDialog');
  let editingCl = null;
  $('#clAdd').innerHTML = O.CHECKLIST_TEMPLATES.map((t, i) => `<button class="chip" data-cltpl="${i}">＋ ${esc(t.title)}</button>`).join('') + '<button class="chip" data-cltpl="-1">＋ Eigene Liste</button>';
  function openChecklist(l, tpl) {
    editingCl = l || null;
    const src = l || tpl || { title: '', items: [], daily: false };
    $('#clDlgTitle').textContent = l ? 'Liste bearbeiten' : 'Neue Liste';
    $('#clTitle').value = src.title;
    $('#clItems').value = (src.items || []).map((i) => (typeof i === 'string' ? i : i.text)).join('\n');
    $('#clDaily').checked = !!src.daily;
    $('#clPinned').checked = l ? !!l.pinned : !!(tpl && tpl.daily);
    $('#clDelete').hidden = !l;
    clDlg.showModal();
  }
  $('#clAdd').addEventListener('click', (e) => { const c = e.target.closest('[data-cltpl]'); if (c) openChecklist(null, O.CHECKLIST_TEMPLATES[c.dataset.cltpl]); });
  $('#clCancel').onclick = () => clDlg.close();
  $('#clDelete').onclick = () => { st().checklists = st().checklists.filter((l) => l.id !== editingCl.id); A.save(); clDlg.close(); A.render(); };
  $('#checklistForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const lines = $('#clItems').value.split('\n').map((x) => x.trim()).filter(Boolean);
    const old = editingCl ? editingCl.items : [];
    const items = lines.map((text) => { const o = old.find((i) => i.text === text); return { id: o ? o.id : A.uid(), text, done: o ? o.done : false }; });
    const data = { title: $('#clTitle').value.trim(), items, daily: $('#clDaily').checked, pinned: $('#clPinned').checked, lastReset: today() };
    if (editingCl) Object.assign(st().checklists.find((l) => l.id === editingCl.id), data);
    else st().checklists.push({ id: A.uid(), ...data });
    A.save(); clDlg.close();
    if (A.view !== 'checklists') A.showView('checklists'); else A.render();
  });
  function toggleItem(lid, iid) {
    const l = st().checklists.find((x) => x.id === lid);
    const it = l && l.items.find((i) => i.id === iid);
    if (!it) return;
    it.done = !it.done;
    A.save(); A.render();
    const p = O.checklistProgress(l);
    if (it.done && p.done === p.total) A.toast(`„${l.title}“ komplett erledigt`);
  }
  function checklistCard(l, compact) {
    const p = O.checklistProgress(l);
    const items = compact ? [...l.items].sort((a, b) => a.done - b.done) : l.items;
    return `<div class="${compact ? '' : 'card '}checklist ${p.done === p.total && p.total ? 'complete' : ''}">
      <div class="cl-head"><button class="plain grow" data-cl-edit="${esc(l.id)}"><b>${esc(l.title)}</b><span class="muted small">${p.done}/${p.total}${l.daily ? ' · täglich' : ''}</span></button>
        ${!compact && p.done ? `<button class="link-btn" data-cl-reset="${esc(l.id)}">Zurücksetzen</button>` : ''}</div>
      <div class="meter"><i style="width:${p.total ? Math.round((p.done / p.total) * 100) : 0}%"></i></div>
      <div class="cl-items">${items.map((i) => `<button class="cl-item ${i.done ? 'done' : ''}" data-cl="${esc(l.id)}" data-item="${esc(i.id)}"><span class="cl-box"></span>${esc(i.text)}</button>`).join('')}</div>
    </div>`;
  }
  function renderChecklists() {
    if (A.view !== 'checklists') return;
    $('#clList').innerHTML = st().checklists.length ? st().checklists.map((l) => checklistCard(l)).join('')
      : `<div class="empty"><div class="big-emoji"><i class="ic ic-list"></i></div><p><b>Nichts mehr vergessen.</b></p><p class="muted">„Herd aus? Fenster zu?“ – Routinen setzen sich jeden Morgen zurück, Listen wie „Urlaub“ bleiben, bis du sie zurücksetzt.</p></div>`;
  }
  function onChecklistClick(e) {
    const it = e.target.closest('[data-item]');
    if (it) { toggleItem(it.dataset.cl, it.dataset.item); return true; }
    const r = e.target.closest('[data-cl-reset]');
    if (r) { const l = st().checklists.find((x) => x.id === r.dataset.clReset); l.items.forEach((i) => { i.done = false; }); A.save(); A.render(); return true; }
    const ed = e.target.closest('[data-cl-edit]');
    if (ed) { if (A.view !== 'checklists') A.showView('checklists'); openChecklist(st().checklists.find((x) => x.id === ed.dataset.clEdit)); return true; }
    return false;
  }
  $('#clList').addEventListener('click', onChecklistClick);

  // =====================================================================
  // Stundenplan
  // =====================================================================
  const ttDlg = $('#ttDialog');
  let ttPlanId = null, editingTt = null, ttDay = 1;
  const plan = () => st().timetables.find((p) => p.id === ttPlanId) || st().timetables[0] || null;
  $('#ttDay').innerHTML = [1, 2, 3, 4, 5, 6].map((d) => `<button type="button" data-d="${d}">${O.WEEKDAYS[d]}</button>`).join('');
  const setTtDay = (d) => { ttDay = Number(d); $$('#ttDay [data-d]').forEach((b) => b.classList.toggle('active', Number(b.dataset.d) === ttDay)); };
  $('#ttDay').addEventListener('click', (e) => { const b = e.target.closest('[data-d]'); if (b) setTtDay(b.dataset.d); });
  function openTt(entry, day) {
    editingTt = entry || null;
    const p = plan();
    $('#ttDlgTitle').textContent = entry ? 'Stunde bearbeiten' : `Neue Stunde – ${p.name}`;
    setTtDay(entry ? entry.day : day || 1);
    $('#ttTitle').value = entry ? entry.title : '';
    $('#ttRoom').value = entry ? entry.room || '' : '';
    // nach der letzten Stunde des Tages weitermachen
    const last = O.dayEntries(p, entry ? entry.day : day || 1).pop();
    const startDefault = last && last.end ? last.end : '08:00';
    $('#ttStart').value = entry ? entry.start : startDefault;
    $('#ttEnd').value = entry ? entry.end || '' : addMin(startDefault, 45);
    $('#ttSubjects').innerHTML = [...new Set(p.entries.map((x) => x.title))].map((t) => `<option value="${esc(t)}">`).join('');
    $('#ttDelete').hidden = !entry;
    ttDlg.showModal();
  }
  function addMin(t, m) { const x = O.toMin(t) + m; return `${String(Math.floor(x / 60) % 24).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; }
  $('#ttStart').addEventListener('change', () => { if (!editingTt) $('#ttEnd').value = addMin($('#ttStart').value, 45); });
  $('#ttTitle').addEventListener('change', () => {
    const same = plan().entries.find((x) => x.title === $('#ttTitle').value.trim() && x.room);
    if (same && !$('#ttRoom').value) $('#ttRoom').value = same.room;
  });
  $('#ttCancel').onclick = () => ttDlg.close();
  $('#ttDelete').onclick = () => { const p = plan(); p.entries = p.entries.filter((x) => x.id !== editingTt.id); A.save(); ttDlg.close(); A.render(); };
  $('#ttForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const p = plan();
    const data = { day: ttDay, title: $('#ttTitle').value.trim(), start: $('#ttStart').value, end: $('#ttEnd').value, room: $('#ttRoom').value.trim() };
    if (editingTt) Object.assign(p.entries.find((x) => x.id === editingTt.id), data);
    else p.entries.push({ id: A.uid(), ...data });
    A.save(); ttDlg.close(); A.render();
  });
  function newPlan(name) {
    const p = { id: A.uid(), name: name || 'Mein Stundenplan', entries: [] };
    st().timetables.push(p); ttPlanId = p.id;
    A.save(); A.render();
  }
  function renderTimetable() {
    if (A.view !== 'timetable') return;
    const p = plan();
    if (p) ttPlanId = p.id;
    $('#ttPlans').innerHTML = st().timetables.map((x) => `<button class="chip ${p && x.id === p.id ? 'active' : ''}" data-plan="${esc(x.id)}">${esc(x.name)}</button>`).join('') +
      (st().timetables.length ? '<button class="chip" data-plan-new>＋ Weiterer Plan</button>' : '');
    if (!p) {
      $('#ttWeek').innerHTML = `<div class="empty"><div class="big-emoji"><i class="ic ic-school"></i></div><p><b>Stundenplan für Schule, Uni oder Kurse.</b></p><p class="muted">Auf der Startseite siehst du dann, was heute ansteht – auch für mehrere Kinder.</p>
        <button class="btn primary" data-plan-first>Stundenplan anlegen</button></div>`;
      return;
    }
    const wdNow = new Date().getDay();
    const days = [1, 2, 3, 4, 5].concat(p.entries.some((x) => Number(x.day) === 6) ? [6] : []);
    $('#ttWeek').innerHTML = days.map((d) => {
      const list = O.dayEntries(p, d);
      return `<div class="card tt-day ${d === wdNow ? 'today' : ''}"><div class="tt-head"><b>${['', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'][d]}</b>${d === wdNow ? '<span class="pill ok">heute</span>' : ''}${list.length ? '' : '<span class="tt-free">· frei</span>'}<span class="spacer"></span><button class="link-btn" data-tt-add="${d}">＋ Stunde</button></div>
        ${list.length ? list.map((x) => `<button class="tt-entry" data-tt="${esc(x.id)}" style="--c:${O.subjectColor(x.title)}"><span class="tt-time">${esc(x.start)}${x.end ? '<br>' + esc(x.end) : ''}</span><span class="grow"><b>${esc(x.title)}</b>${x.room ? `<span class="muted small">${esc(x.room)}</span>` : ''}</span></button>`).join('') : ''}</div>`;
    }).join('') + '<div class="row"><button class="btn small" data-plan-rename>Plan umbenennen</button><button class="btn small danger" data-plan-delete>Plan löschen</button></div>';
  }
  $('#view-timetable').addEventListener('click', (e) => {
    if (e.target.closest('[data-plan-first]')) { newPlan(st().settings.name ? `${st().settings.name}s Stundenplan` : 'Mein Stundenplan'); return; }
    if (e.target.closest('[data-plan-new]')) { const n = prompt('Name des Plans (z. B. Emma 3b):', ''); if (n !== null) newPlan(n.trim() || `Plan ${st().timetables.length + 1}`); return; }
    const pl = e.target.closest('[data-plan]');
    if (pl) { ttPlanId = pl.dataset.plan; A.render(); return; }
    if (e.target.closest('[data-plan-rename]')) { const p = plan(); const n = prompt('Neuer Name:', p.name); if (n && n.trim()) { p.name = n.trim(); A.save(); A.render(); } return; }
    if (e.target.closest('[data-plan-delete]')) {
      const p = plan();
      if (!confirm(`„${p.name}“ mit allen Stunden löschen?`)) return;
      st().timetables = st().timetables.filter((x) => x.id !== p.id); ttPlanId = null; A.save(); A.render(); return;
    }
    const add = e.target.closest('[data-tt-add]');
    if (add) { openTt(null, Number(add.dataset.ttAdd)); return; }
    const t = e.target.closest('[data-tt]');
    if (t) openTt(plan().entries.find((x) => x.id === t.dataset.tt));
  });

  // =====================================================================
  // Rechner: Prozente & Schlaf
  // =====================================================================
  let pcMode = 'rabatt', slMode = 'wake';
  const PC_LABELS = { rabatt: ['Preis €', 'Rabatt %', '79,99', '25'], mwst: ['Betrag €', 'MwSt. % (19 oder 7)', '119', '19'], diff: ['Vorher', 'Nachher', '80', '100'] };
  function calcPercent() {
    const a = num($('#pcA').value), b = num($('#pcB').value);
    let out = '';
    if (a != null && b != null) {
      if (pcMode === 'rabatt') { const r = O.discount(a, b); out = `Neuer Preis <b>${euro(r.final)}</b> · du sparst ${euro(r.save)}`; }
      else if (pcMode === 'mwst') { const g = O.vat(a, b, true), n = O.vat(a, b, false); out = `Als Brutto: netto <b>${euro(g.net)}</b>, Steuer ${euro(g.tax)}<br>Als Netto: brutto <b>${euro(n.gross)}</b>, Steuer ${euro(n.tax)}`; }
      else { const c = O.pctChange(a, b); out = c == null ? '' : `Veränderung <b>${c > 0 ? '+' : ''}${fmt(c)} %</b> (${b - a > 0 ? '+' : ''}${fmt(b - a)})`; }
    }
    $('#pcResult').innerHTML = out;
  }
  $('#pcMode').addEventListener('click', (e) => {
    const b = e.target.closest('[data-m]');
    if (!b) return;
    pcMode = b.dataset.m;
    $$('#pcMode [data-m]').forEach((x) => x.classList.toggle('active', x === b));
    const [la, lb, pa, pb] = PC_LABELS[pcMode];
    $('#pcLabelA').textContent = la; $('#pcLabelB').textContent = lb; $('#pcA').placeholder = pa; $('#pcB').placeholder = pb;
    if (pcMode === 'mwst' && !['7', '19'].includes($('#pcB').value.trim())) $('#pcB').value = '19';
    calcPercent();
  });
  $('#pcA').addEventListener('input', calcPercent);
  $('#pcB').addEventListener('input', calcPercent);
  function calcSleep() {
    const nowT = new Date().toTimeString().slice(0, 5);
    const res = slMode === 'wake' ? O.bedtimes($('#slWake').value || '06:30') : O.wakeTimes(nowT);
    $('#slResult').innerHTML = `<p class="muted small">${slMode === 'wake' ? 'Ins Bett gehen um:' : `Wenn du jetzt (${nowT}) schlafen gehst, Wecker stellen auf:`}</p>
      <div class="sleep-times">${res.map((r, i) => `<div class="${(slMode === 'wake' ? i === 0 : i === 1) ? 'best' : ''}"><b>${r.time}</b><span>${fmt(r.hours, 1)} Std</span></div>`).join('')}</div>`;
  }
  $('#slMode').addEventListener('click', (e) => {
    const b = e.target.closest('[data-m]');
    if (!b) return;
    slMode = b.dataset.m;
    $$('#slMode [data-m]').forEach((x) => x.classList.toggle('active', x === b));
    $('#slWakeWrap').hidden = slMode !== 'wake';
    calcSleep();
  });
  $('#slWake').addEventListener('input', calcSleep);
  calcSleep();

  // =====================================================================
  // Startseite, Mehr, Kalender, Suche, Erinnerungen
  // =====================================================================
  if (A.homeCards) Object.assign(A.homeCards, { checklists: 'Checklisten', timetable: 'Stundenplan', contracts: 'Verträge' });
  if (A.homeOrder) Object.assign(A.homeOrder, { timetable: [12, 'today'], checklists: [14, 'today'], contracts: [15, 'today'] });
  if (A.homeIcons) Object.assign(A.homeIcons, { checklists: 'list', timetable: 'school', contracts: 'contract' });
  const home = document.createElement('div');
  home.id = 'homeOrganize';
  $('#homeFlow').appendChild(home);
  function renderHomeOrganize() {
    if (A.view !== 'home') return;
    const parts = [];
    // Stundenplan: heute – ab 15 Uhr schon morgen
    const now = new Date();
    const late = now.getHours() >= 15;
    const wd = late ? (now.getDay() + 1) % 7 : now.getDay();
    const mins = now.getHours() * 60 + now.getMinutes();
    const rows = st().timetables.map((p) => ({ p, list: O.dayEntries(p, wd) })).filter((x) => x.list.length);
    if (rows.length) {
      parts.push(`<div class="card home-card" data-card="timetable"><button class="plain" data-goto="timetable"><div class="home-title">Stundenplan ${late ? 'morgen' : 'heute'}</div></button>
        ${rows.map(({ p, list }) => {
          const nn = late ? { now: null, next: null } : O.nowAndNext(list, mins);
          return `<div class="tt-home">${st().timetables.length > 1 ? `<b class="tt-who">${esc(p.name)}</b>` : ''}<div class="tt-chips">${list.map((x) => `<span class="tt-chip ${nn.now === x ? 'now' : ''} ${!late && O.toMin(x.end || x.start) < mins ? 'past' : ''}" style="--c:${O.subjectColor(x.title)}">${esc(x.start)} ${esc(x.title)}</span>`).join('')}</div>
            ${!late && list.length ? `<div class="muted small">${nn.now ? `Jetzt: <b>${esc(nn.now.title)}</b>${nn.now.room ? ' · ' + esc(nn.now.room) : ''}` : ''}${nn.now && nn.next ? ' · ' : ''}${nn.next ? `Als Nächstes: ${esc(nn.next.start)} ${esc(nn.next.title)}` : nn.now ? '' : 'Schluss für heute'}</div>` : `<div class="muted small">Schluss um ${esc(list[list.length - 1].end || list[list.length - 1].start)}</div>`}</div>`;
        }).join('')}</div>`);
    }
    // Angeheftete Checklisten
    const pinned = st().checklists.filter((l) => l.pinned && l.items.length);
    if (pinned.length) parts.push(`<div class="card home-card" data-card="checklists"><button class="plain" data-goto="checklists"><div class="home-title">Checklisten</div></button>${pinned.map((l) => checklistCard(l, true)).join('')}</div>`);
    // Kündigungsfristen
    const soon = st().contracts.filter((c) => !c.cancelled).map((c) => ({ c, i: O.contractInfo(c, today()) })).filter((x) => x.i.state === 'soon').sort((a, b) => a.i.left - b.i.left);
    if (soon.length) {
      parts.push(`<button class="card home-card" data-card="contracts" data-goto="contracts"><div class="home-title">Kündigungsfrist</div>
        ${soon.slice(0, 3).map(({ c, i }) => `<div class="home-line ${i.left <= 7 ? 'warn-text' : ''}"><b>${esc(c.name)}</b> – kündigen bis ${L.formatDate(i.cancelBy)} (${leftText(i.left)})</div>`).join('')}</button>`);
    }
    home.innerHTML = parts.join('');
  }
  home.addEventListener('click', (e) => { if (e.target.closest('[data-item]') || e.target.closest('[data-cl-edit]')) { e.stopPropagation(); onChecklistClick(e); } });

  function renderHubOrganize() {
    const t = today();
    const tot = O.contractTotals(st().contracts);
    const soon = st().contracts.filter((c) => !c.cancelled && O.contractInfo(c, t).state === 'soon').length;
    $('#hubContracts').textContent = soon ? `${soon} Frist${soon > 1 ? 'en' : ''} bald` : tot.count ? `${euro(tot.month)} / Monat` : 'Fristen & Kosten';
    const open = st().checklists.reduce((a, l) => a + l.items.filter((i) => !i.done).length, 0);
    $('#hubChecklists').textContent = st().checklists.length ? `${st().checklists.length} Listen · ${open} offen` : 'Routinen';
    const wd = new Date().getDay();
    const n = st().timetables.reduce((a, p) => a + O.dayEntries(p, wd).length, 0);
    $('#hubTimetable').textContent = st().timetables.length ? (n ? `heute ${n} Stunden` : 'heute frei') : 'Schule, Uni, Kurse';
  }

  A.calendarSources.push((from, to) => st().contracts.filter((c) => !c.cancelled).flatMap((c) => {
    const i = O.contractInfo(c, from);
    return i.cancelBy && i.cancelBy <= to ? [{ date: i.cancelBy, kind: 'task', text: `Kündigungsfrist ${c.name}`, emoji: '📄', go: 'contracts' }] : [];
  }));
  if (A.searchSources) A.searchSources.push((has) => [
    ...st().contracts.filter((c) => has(c.name, c.note)).map((c) => ({ kind: 'go', view: 'contracts', icon: '📄', text: c.name, sub: `Vertrag · ${euro(c.cost)}` })),
    ...st().checklists.filter((l) => has(l.title, l.items.map((i) => i.text).join(' '))).map((l) => ({ kind: 'go', view: 'checklists', icon: '☑️', text: l.title, sub: 'Checkliste' })),
    ...st().timetables.flatMap((p) => p.entries.filter((x) => has(x.title, x.room)).map((x) => ({ kind: 'go', view: 'timetable', icon: '🎓', text: `${x.title} (${O.WEEKDAYS[x.day]} ${x.start})`, sub: p.name }))),
  ]);
  A.glanceSources = A.glanceSources || [];
  A.glanceSources.push(() => {
    const soon = st().contracts.filter((c) => !c.cancelled && O.contractInfo(c, today()).left <= 7 && O.contractInfo(c, today()).left >= 0).length;
    return soon ? [['contracts', 'contract', `${soon} Kündigungsfrist${soon > 1 ? 'en' : ''}`, 'warn']] : [];
  });

  async function checkOrganize() {
    if (O.resetChecklists(st().checklists, today())) { A.save(); A.render(); }
    let changed = false;
    for (const c of st().contracts) {
      if (c.cancelled) continue;
      const i = O.contractInfo(c, today());
      if (i.state !== 'soon') continue;
      const k = `ctr:${c.id}@${i.cancelBy}`;
      if (st().notified.includes(k)) continue;
      st().notified.push(k); changed = true;
      await A.notify('Kündigungsfrist', `${c.name}: kündigen bis ${L.formatDate(i.cancelBy)}, sonst verlängert er sich`, k);
    }
    if (changed) A.save();
  }

  A.actions.checklist = () => A.showView('checklists');
  A.actions.contract = () => { A.showView('contracts'); openContract(null, 'handy'); };

  A.onRender(renderHeader);
  A.onRender(renderHomeOrganize);
  A.onRender(renderContracts);
  A.onRender(renderChecklists);
  A.onRender(renderTimetable);
  A.onRender(renderHubOrganize);
  if (A.applyHomeHidden) A.onRender(A.applyHomeHidden);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkOrganize(); });
  setInterval(() => { if (O.resetChecklists(st().checklists, today())) { A.save(); A.render(); } }, 60000);
  O.resetChecklists(st().checklists, today());
  A.render();
  checkOrganize();
})();
