/* Kalender: Monat/Woche/Liste, Ebenen, gemeinsame Kalender (Supabase) und Termine teilen.
   Der Termin-Dialog selbst liegt in alltag.js; hier kommen Darstellung, Teilen und gemeinsame Kalender dazu. */
(() => {
  'use strict';
  const A = window.App;
  const L = A.L;
  const P = window.FridgePlanner;
  const C = window.FridgeCalendar;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const esc = A.esc;
  const st = () => A.state;
  const today = () => A.today();
  const ym = (d) => d.slice(0, 7);
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* voll */ } }, remove: (k) => { try { localStorage.removeItem(k); } catch (e) { /* egal */ } } };
  const CACHE_KEY = 'alltagsheld.sharedCal', JOIN_KEY = 'alltagsheld.pendingJoin';
  const ME = { id: 'me', name: 'Mein Kalender' };
  const LAYERS = { tasks: 'Aufgaben', stock: 'Ablaufdaten', meals: 'Essensplan', sport: 'Training', other: 'Fristen, Müll & mehr' };
  const layerOf = (go) => ({ tasks: 'tasks', stock: 'stock', recipes: 'meals', sport: 'sport' }[go] || 'other');

  let mode = st().settings.calMode || 'month';
  let calDay = today();
  const settings = () => {
    const s = st().settings;
    if (!s.calLayers) s.calLayers = { tasks: true, stock: true, meals: true, sport: true, other: true };
    if (!Array.isArray(s.calHidden)) s.calHidden = [];
    return s;
  };

  // =====================================================================
  // Gemeinsame Kalender (Supabase)
  // =====================================================================
  let cache = { calendars: [], events: [], members: {}, at: 0, me: null };
  try { cache = { ...cache, ...JSON.parse(ls.get(CACHE_KEY) || '{}') }; } catch (e) { /* leer */ }
  const client = () => (A.authClient ? A.authClient() : null);
  const logged = () => { const c = client(); return !!(c && c.user); };
  let loading = false, notSetup = false;
  async function loadShared(force) {
    if (!logged()) { if (cache.calendars.length) { cache = { calendars: [], events: [], members: {}, at: 0 }; ls.remove(CACHE_KEY); } return; }
    if (loading || (!force && Date.now() - cache.at < 60000 && cache.me === client().user.id)) return;
    loading = true;
    try {
      const c = client();
      const [cals, mem, evs] = await Promise.all([
        c.api('/rest/v1/shared_calendars?select=*&order=created_at'),
        c.api('/rest/v1/calendar_members?select=calendar_id,user_id,name'),
        c.api('/rest/v1/shared_events?select=*'),
      ]);
      const members = {};
      for (const m of mem || []) (members[m.calendar_id] = members[m.calendar_id] || []).push(m);
      cache = { calendars: cals || [], events: evs || [], members, at: Date.now(), me: c.user.id };
      notSetup = false;
      ls.set(CACHE_KEY, JSON.stringify(cache));
      A.render();
    } catch (e) {
      notSetup = /does not exist|relation|404|PGRST/i.test(String(e.message) + JSON.stringify(e.raw || ''));
    } finally { loading = false; }
  }
  const calById = (id) => cache.calendars.find((c) => c.id === id);
  const colorOf = (calId) => (calId && calId !== 'me' ? (calById(calId) || {}).color || '#64748b' : 'var(--primary)');
  const memberName = (calId, uid) => {
    if (uid && client() && client().user && uid === client().user.id) return 'dir';
    const m = (cache.members[calId] || []).find((x) => x.user_id === uid);
    return m && m.name ? m.name : 'jemandem';
  };
  const sharedEvents = () => cache.events.filter((r) => calById(r.calendar_id)).map((r) => ({ ...r.data, id: r.id, cal: r.calendar_id, by: r.created_by, updatedBy: r.updated_by, updatedAt: r.updated_at }));
  const strip = (ev) => { const { id, cal, by, updatedBy, updatedAt, ...data } = ev; return data; }; // eslint-disable-line no-unused-vars

  // Schnittstelle für Termin-Dialog, Startseite und Erinnerungen
  A.allEvents = () => (logged() ? st().events.concat(sharedEvents()) : st().events);
  A.calChoices = () => [ME].concat(logged() ? cache.calendars.map((c) => ({ id: c.id, name: c.name })) : []);
  A.calDefault = () => (settings().calDefault && (settings().calDefault === 'me' || calById(settings().calDefault)) ? settings().calDefault : 'me');
  A.findSharedEvent = (id) => sharedEvents().find((e) => e.id === id);
  A.calMeta = (ev) => {
    const cal = calById(ev.cal);
    if (!cal) return '';
    const by = ev.updatedBy && ev.updatedBy !== ev.by ? `geändert von ${memberName(ev.cal, ev.updatedBy)}` : `eingetragen von ${memberName(ev.cal, ev.by)}`;
    return `${cal.name} · ${by}`;
  };
  A.calFocus = (date) => { calDay = date; };

  A.saveSharedEvent = async (ev, cal, editing) => {
    if (!navigator.onLine) { A.toast('Gemeinsame Termine brauchen Internet'); return false; }
    const c = client();
    try {
      const data = strip(ev);
      if (cal === 'me') { // gemeinsamer → eigener Kalender
        st().events.push({ ...data, id: A.uid() });
        A.save();
        if (editing && editing.cal) await c.api(`/rest/v1/shared_events?id=eq.${editing.cal ? editing.id : ''}`, { method: 'DELETE' });
      } else if (editing && editing.cal === cal) {
        await c.api(`/rest/v1/shared_events?id=eq.${editing.id}`, { method: 'PATCH', body: { data }, headers: { Prefer: 'return=minimal' } });
      } else {
        await c.api('/rest/v1/shared_events', { method: 'POST', body: { calendar_id: cal, data }, headers: { Prefer: 'return=minimal' } });
        if (editing && editing.cal) await c.api(`/rest/v1/shared_events?id=eq.${editing.id}`, { method: 'DELETE' });
        else if (editing) { st().events = st().events.filter((x) => x.id !== editing.id); A.save(); }
      }
      settings().calDefault = cal;
      await loadShared(true);
      A.toast(cal === 'me' ? `${ev.title} gespeichert` : `${ev.title} – für alle in „${(calById(cal) || {}).name}“ sichtbar`);
      return true;
    } catch (e) { A.toast(e.message); return false; }
  };
  A.deleteSharedEvent = async (ev) => {
    try {
      await client().api(`/rest/v1/shared_events?id=eq.${ev.id}`, { method: 'DELETE' });
      await loadShared(true);
      A.toast(`${ev.title} gelöscht – für alle`);
      return true;
    } catch (e) { A.toast(e.message); return false; }
  };

  // =====================================================================
  // Darstellung
  // =====================================================================
  function visibleEvents() {
    const hid = settings().calHidden;
    return A.allEvents().filter((e) => !hid.includes(e.cal || 'me'));
  }
  function extras(from, to) {
    const lay = settings().calLayers;
    return (A.autoEntries ? A.autoEntries(from, to) : []).filter((x) => lay[layerOf(x.go)] !== false);
  }
  function evRow(o) {
    const ev = o.event;
    const cal = ev.cal ? calById(ev.cal) : null;
    const sub = [ev.location, cal ? cal.name : ''].filter(Boolean).join(' · ');
    return `<button class="ev-row" data-ev="${esc(ev.id)}" style="--c:${colorOf(ev.cal)}">
      <span class="ev-time">${esc(C.timeRange(ev))}</span>
      <span class="grow"><b>${esc(A.eventTitle ? A.eventTitle(ev, o.date) : ev.title)}</b>${sub ? `<span class="muted small">${esc(sub)}</span>` : ''}</span></button>`;
  }
  const extraRow = (x) => `<button class="ev-row auto" data-goto="${esc(x.go || 'calendar')}"><span class="ev-time">${esc(x.emoji || '•')}</span><span class="grow">${esc(x.text)}</span></button>`;

  function render() {
    if (A.view !== 'calendar') return;
    loadShared();
    $$('#calMode [data-m]').forEach((b) => b.classList.toggle('active', b.dataset.m === mode));
    const t = today();
    const evs = visibleEvents();
    $('#calDayBox').hidden = mode !== 'month';
    if (mode === 'month') {
      const [y, m] = ym(calDay).split('-').map(Number);
      $('#calTitle').textContent = P.monthLabel(ym(calDay));
      const weeks = P.monthGrid(y, m - 1);
      const from = weeks[0][0].iso, to = weeks[weeks.length - 1][6].iso;
      const occ = P.occurrences(evs, from, to);
      const ex = extras(from, to);
      $('#calBody').innerHTML = `<div class="cal-grid" id="calGrid">${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => `<div class="cal-wd">${d}</div>`).join('')}${weeks.flat().map((d) => {
        const de = occ.filter((o) => o.date === d.iso);
        const dx = ex.filter((x) => x.date === d.iso);
        const dots = de.slice(0, 3).map((o) => `<i style="background:${colorOf(o.event.cal)}"></i>`).join('') + (dx.length && de.length < 3 ? '<i class="x"></i>' : '');
        return `<button class="cal-cell ${d.out ? 'out' : ''} ${d.iso === t ? 'today' : ''} ${d.iso === calDay ? 'sel' : ''}" data-day="${d.iso}"><span class="n">${d.day}</span><span class="dots">${dots}</span></button>`;
      }).join('')}</div>`;
      $('#calDayTitle').textContent = C.dayHeading(calDay, t);
      const dayOcc = P.occurrences(evs, calDay, calDay).sort((a, b) => (a.event.time || '').localeCompare(b.event.time || ''));
      const dayEx = extras(calDay, calDay);
      $('#calDay').innerHTML = dayOcc.map(evRow).join('') + dayEx.map(extraRow).join('') || `<button class="empty-day" data-newday="${calDay}">Frei · ＋ Termin</button>`;
    } else if (mode === 'week') {
      const days = C.weekDays(calDay);
      $('#calTitle').textContent = C.weekLabel(calDay, Number(t.slice(0, 4)));
      const groups = C.groupByDay(P.occurrences(evs, days[0], days[6]), extras(days[0], days[6]), days[0], days[6]);
      $('#calBody').innerHTML = `<div class="week">${groups.map((g) => {
        const d = new Date(g.date + 'T12:00');
        const empty = !g.events.length && !g.extra.length;
        return `<div class="week-day ${g.date === t ? 'today' : ''} ${empty ? 'empty' : ''}"><button class="wd-head" data-newday="${g.date}"><b>${C.WD_SHORT[d.getDay()]}</b><span>${d.getDate()}.</span></button>
          <div class="wd-items">${empty ? `<button class="wd-free" data-newday="${g.date}">frei</button>` : g.events.map(evRow).join('') + g.extra.map(extraRow).join('')}</div></div>`;
      }).join('')}</div>`;
    } else {
      const from = calDay < t ? calDay : t, to = C.addDays(from, 60);
      $('#calTitle').textContent = 'Demnächst';
      const groups = C.groupByDay(P.occurrences(evs, from, to), extras(from, to), from, to).filter((g) => g.events.length || g.extra.length);
      $('#calBody').innerHTML = groups.length ? groups.map((g) => `<h3 class="sec-title ${g.date === t ? 'is-today' : ''}">${esc(C.dayHeading(g.date, t))}</h3>${g.events.map(evRow).join('')}${g.extra.map(extraRow).join('')}`).join('')
        : '<div class="empty"><div class="big-emoji"><i class="ic ic-calendar"></i></div><p><b>In den nächsten Wochen ist nichts geplant.</b></p></div>';
    }
  }
  $('#calMode').addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (!b) return; mode = b.dataset.m; settings().calMode = mode; A.save(); render(); });
  $('#calPrev').onclick = () => { calDay = mode === 'month' ? `${P.shiftMonth(ym(calDay), -1)}-01` : C.addDays(calDay, mode === 'week' ? -7 : -30); render(); };
  $('#calNext').onclick = () => { calDay = mode === 'month' ? `${P.shiftMonth(ym(calDay), 1)}-01` : C.addDays(calDay, mode === 'week' ? 7 : 30); render(); };
  $('#calToday').onclick = () => { calDay = today(); render(); };
  $('#btnNewEvent').onclick = () => A.openEventDialog(null, calDay);
  $('#view-calendar').addEventListener('click', (e) => {
    const cell = e.target.closest('[data-day]');
    if (cell) { if (calDay === cell.dataset.day) A.openEventDialog(null, calDay); else { calDay = cell.dataset.day; render(); } return; }
    const nd = e.target.closest('[data-newday]');
    if (nd) { A.openEventDialog(null, nd.dataset.newday); return; }
    const r = e.target.closest('[data-ev]');
    if (r) { const ev = st().events.find((x) => x.id === r.dataset.ev) || A.findSharedEvent(r.dataset.ev); if (ev) A.openEventDialog(ev); }
  });

  // =====================================================================
  // Kalender & Ebenen (Blatt)
  // =====================================================================
  const layersDlg = $('#calLayers');
  function renderLayers() {
    const s = settings();
    const rows = [ME].concat(cache.calendars).map((c) => {
      const shared = c.id !== 'me';
      const n = shared ? (cache.members[c.id] || []).length : 0;
      return `<div class="cal-row"><label class="toggle"><input type="checkbox" data-calvis="${esc(c.id)}" ${s.calHidden.includes(c.id) ? '' : 'checked'}><i class="cal-dot" style="background:${colorOf(c.id)}"></i><span><b>${esc(c.name)}</b>${shared ? `<span class="muted small">${n} ${n === 1 ? 'Person' : 'Personen'}</span>` : ''}</span></label>
        <button class="btn small" data-calshare="${esc(c.id)}"><i class="ic ic-share"></i> Teilen</button></div>`;
    }).join('');
    $('#calList').innerHTML = rows + (logged() ? (notSetup ? '<p class="muted small">Gemeinsame Kalender sind auf dem Server noch nicht eingerichtet (supabase/calendar.sql).</p>' : '')
      : '<p class="muted small">Für gemeinsame Kalender mit Familie oder Freunden brauchst du ein Konto.</p>');
    $('#calCreate').hidden = $('#calJoin').hidden = false;
    $('#calLayerChips').innerHTML = Object.entries(LAYERS).map(([k, l]) => `<button class="chip ${s.calLayers[k] !== false ? 'active' : ''}" data-layer="${k}">${l}</button>`).join('');
  }
  $('#calLayersBtn').onclick = () => { renderLayers(); layersDlg.showModal(); loadShared(true).then(() => { if (layersDlg.open) renderLayers(); }); };
  $('#calLayersClose').onclick = () => layersDlg.close();
  layersDlg.addEventListener('click', (e) => {
    if (e.target === layersDlg) { layersDlg.close(); return; }
    const ch = e.target.closest('[data-layer]');
    if (ch) { const s = settings(); s.calLayers[ch.dataset.layer] = s.calLayers[ch.dataset.layer] === false; A.save(); renderLayers(); render(); return; }
    const sh = e.target.closest('[data-calshare]');
    if (sh) { layersDlg.close(); if (sh.dataset.calshare === 'me') shareMine(); else openCalShare(sh.dataset.calshare); }
  });
  layersDlg.addEventListener('change', (e) => {
    const v = e.target.closest('[data-calvis]');
    if (!v) return;
    const s = settings();
    s.calHidden = v.checked ? s.calHidden.filter((x) => x !== v.dataset.calvis) : s.calHidden.concat(v.dataset.calvis);
    A.save(); render();
  });
  /** „Mein Kalender“ teilen: als Kalenderdatei oder Angebot, einen gemeinsamen Kalender anzulegen */
  async function shareMine() {
    const ok = await ask({ title: 'Mein Kalender teilen', body: '<p>Damit andere deine Termine sehen und selbst welche eintragen können, lege einen <b>gemeinsamen Kalender</b> an und lade sie per Link ein.</p><p class="muted small">Oder: Alle Termine als Datei senden – das ist nur eine Kopie und aktualisiert sich nicht.</p>', ok: 'Gemeinsamen Kalender anlegen', alt: 'Als Datei senden' });
    if (ok === true) createCalendar();
    else if (ok === 'alt') shareFile(st().events, 'termine.ics', 'Meine Termine');
  }

  // =====================================================================
  // Gemeinsamen Kalender anlegen, beitreten, verwalten
  // =====================================================================
  let cnColor = C.CAL_COLORS[0];
  $('#cnColors').innerHTML = C.CAL_COLORS.map((c) => `<button type="button" class="swatch" data-color="${c}" style="--sw:${c};--sw-d:${c}" aria-label="Farbe"><i></i></button>`).join('');
  $('#cnColors').addEventListener('click', (e) => { const b = e.target.closest('[data-color]'); if (b) { cnColor = b.dataset.color; $$('#cnColors .swatch').forEach((x) => x.classList.toggle('active', x === b)); } });
  function needLogin(why) {
    if (logged()) return false;
    A.toast(why);
    if (A.openAuth) A.openAuth('signup');
    return true;
  }
  function createCalendar() {
    if (needLogin('Für gemeinsame Kalender melde dich bitte an')) return;
    $('#cnName').value = '';
    cnColor = C.CAL_COLORS[(cache.calendars.length + 1) % C.CAL_COLORS.length];
    $$('#cnColors .swatch').forEach((x) => x.classList.toggle('active', x.dataset.color === cnColor));
    $('#calNewDialog').showModal();
  }
  $('#calCreate').onclick = () => { layersDlg.close(); createCalendar(); };
  $('#cnCancel').onclick = () => $('#calNewDialog').close();
  $('#calNewForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#cnName').value.trim();
    if (!name) return;
    try {
      const rows = await client().api('/rest/v1/shared_calendars', { method: 'POST', body: { name, color: cnColor }, headers: { Prefer: 'return=representation' } });
      $('#calNewDialog').close();
      await loadShared(true);
      settings().calDefault = rows[0].id; A.save();
      openCalShare(rows[0].id, true);
    } catch (err) { A.toast(notSetupMsg(err)); }
  });
  const notSetupMsg = (err) => (/does not exist|relation|PGRST20/i.test(String(err.message) + JSON.stringify(err.raw || '')) ? 'Gemeinsame Kalender sind auf dem Server noch nicht eingerichtet (supabase/calendar.sql ausführen)' : err.message);

  let shareCal = null;
  function openCalShare(id, fresh) {
    const cal = calById(id);
    if (!cal) return;
    shareCal = cal;
    const mine = client() && cal.owner === client().user.id;
    const link = C.inviteLink(location.href, cal.invite_code);
    $('#csTitle').textContent = cal.name;
    $('#csInfo').textContent = fresh ? 'Kalender erstellt! Schick den Link an alle, die mitmachen sollen.' : 'Wer den Link öffnet und sich anmeldet, sieht die Termine und kann selbst welche eintragen.';
    $('#csLink').value = link;
    const mem = cache.members[id] || [];
    $('#csMembers').innerHTML = mem.map((m) => `<div class="member"><i class="cal-dot" style="background:${cal.color}"></i><span class="grow">${esc(m.name || 'ohne Namen')}${m.user_id === client().user.id ? ' <span class="muted small">(du)</span>' : ''}${m.user_id === cal.owner ? ' <span class="tag">erstellt</span>' : ''}</span>
      ${mine && m.user_id !== cal.owner ? `<button class="icon-sm" data-kick="${esc(m.user_id)}" aria-label="entfernen">✕</button>` : ''}</div>`).join('');
    $('#csNewCode').hidden = !mine;
    $('#csLeave').textContent = mine ? 'Kalender löschen' : 'Kalender verlassen';
    $('#calShareDialog').showModal();
  }
  A.openCalShare = openCalShare;
  $('#csClose').onclick = () => $('#calShareDialog').close();
  $('#csCopy').onclick = async () => {
    try { await navigator.clipboard.writeText($('#csLink').value); A.toast('Link kopiert'); } catch (e) { $('#csLink').select(); A.toast('Link markiert – jetzt kopieren'); }
  };
  $('#csShare').onclick = async () => {
    const text = `Ich lade dich zu unserem Kalender „${shareCal.name}“ in Alltagsheld ein:`;
    if (navigator.share) { try { await navigator.share({ title: `Kalender „${shareCal.name}“`, text, url: $('#csLink').value }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    $('#csCopy').click();
  };
  $('#csNewCode').onclick = async () => {
    if (!confirm('Neuen Einladungslink erzeugen? Der alte Link funktioniert dann nicht mehr (Mitglieder bleiben drin).')) return;
    try { await client().api('/rest/v1/rpc/new_invite_code', { method: 'POST', body: { cal: shareCal.id } }); await loadShared(true); openCalShare(shareCal.id); A.toast('Neuer Link erstellt'); } catch (e) { A.toast(e.message); }
  };
  $('#csMembers').addEventListener('click', async (e) => {
    const k = e.target.closest('[data-kick]');
    if (!k || !confirm('Diese Person aus dem Kalender entfernen?')) return;
    try { await client().api(`/rest/v1/calendar_members?calendar_id=eq.${shareCal.id}&user_id=eq.${k.dataset.kick}`, { method: 'DELETE' }); await loadShared(true); openCalShare(shareCal.id); } catch (err) { A.toast(err.message); }
  });
  $('#csLeave').onclick = async () => {
    const mine = shareCal.owner === client().user.id;
    if (!confirm(mine ? `„${shareCal.name}“ mit allen Terminen für alle löschen?` : `„${shareCal.name}“ verlassen? Du siehst die Termine dann nicht mehr.`)) return;
    try {
      if (mine) await client().api(`/rest/v1/shared_calendars?id=eq.${shareCal.id}`, { method: 'DELETE' });
      else await client().api(`/rest/v1/calendar_members?calendar_id=eq.${shareCal.id}&user_id=eq.${client().user.id}`, { method: 'DELETE' });
      $('#calShareDialog').close();
      await loadShared(true);
      A.toast(mine ? 'Kalender gelöscht' : 'Kalender verlassen');
    } catch (err) { A.toast(err.message); }
  };

  async function join(code) {
    if (needLogin('Melde dich an (oder erstelle ein Konto), um dem Kalender beizutreten')) { ls.set(JOIN_KEY, code); return; }
    ls.remove(JOIN_KEY);
    const name = await ask({ title: 'Kalender beitreten', body: '<p>Unter welchem Namen sollen dich die anderen sehen?</p>', input: 'Dein Name', value: st().settings.name || client().user.name || '', ok: 'Beitreten' });
    if (name === null || name === false) return;
    try {
      const id = await client().api('/rest/v1/rpc/join_calendar', { method: 'POST', body: { code, display_name: typeof name === 'string' ? name : '' } });
      await loadShared(true);
      A.showView('calendar');
      const cal = calById(id);
      A.toast(cal ? `Du bist jetzt in „${cal.name}“` : 'Beigetreten');
    } catch (e) { A.toast(/ungültig/.test(e.message) ? 'Diese Einladung ist ungültig oder wurde erneuert – frag nach einem neuen Link' : notSetupMsg(e)); }
  }
  $('#calJoin').onclick = async () => {
    layersDlg.close();
    const v = await ask({ title: 'Kalender beitreten', body: '<p>Füge den Einladungslink oder Code ein.</p>', input: 'Link oder Code', value: '', ok: 'Weiter' });
    if (typeof v !== 'string') return;
    const code = C.parseInviteCode(v);
    if (!code) { A.toast('Das ist kein gültiger Einladungslink'); return; }
    join(code);
  };

  // =====================================================================
  // Einzelne Termine teilen & aus einem Link übernehmen
  // =====================================================================
  async function shareFile(events, name, title) {
    const ics = P.toICS(events);
    const file = typeof File !== 'undefined' ? new File([ics], name, { type: 'text/calendar' }) : null;
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  A.shareEvent = async (ev) => {
    if (!ev) return;
    const link = `${location.href.replace(/[?#].*$/, '')}?ev=${C.encodeEvent(ev)}`;
    const text = C.shareText(ev);
    const choice = await ask({ title: 'Termin teilen', body: `<p class="share-preview">${esc(text).replace(/\n/g, '<br>')}</p>`, ok: 'Als Nachricht', alt: 'Als Kalenderdatei' });
    if (choice === 'alt') { shareFile([ev], `${ev.title.replace(/[^\wäöüÄÖÜß -]/g, '').trim() || 'termin'}.ics`, ev.title); return; }
    if (choice !== true) return;
    const msg = `${text}\n\nIn Alltagsheld übernehmen: ${link}`;
    if (navigator.share) { try { await navigator.share({ title: ev.title, text: msg }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(msg); A.toast('Text mit Link kopiert – jetzt in WhatsApp & Co. einfügen'); } catch (e) { A.toast('Teilen wird hier nicht unterstützt'); }
  };
  async function importEvent(ev) {
    const ok = await ask({ title: 'Termin übernehmen?', body: `<p class="share-preview">${esc(C.shareText(ev)).replace(/\n/g, '<br>')}</p>`, ok: 'In meinen Kalender' });
    if (ok !== true) return;
    st().events.push({ ...ev, id: A.uid(), type: ev.type || 'termin' });
    A.save();
    calDay = ev.date;
    A.showView('calendar');
    A.toast(`${ev.title} übernommen`);
  }

  // ---------- kleiner Frage-Dialog ----------
  function ask({ title, body, input, value, ok, alt }) {
    return new Promise((resolve) => {
      const dlg = $('#calAskDialog');
      $('#caTitle').textContent = title;
      $('#caBody').innerHTML = body || '';
      $('#caInputWrap').hidden = !input;
      $('#caInputLabel').textContent = input || '';
      $('#caInput').value = value || '';
      $('#caOk').textContent = ok || 'OK';
      let altBtn = $('#caAlt');
      if (!altBtn) { altBtn = document.createElement('button'); altBtn.type = 'button'; altBtn.className = 'btn'; altBtn.id = 'caAlt'; $('#caOk').before(altBtn); }
      altBtn.hidden = !alt; altBtn.textContent = alt || '';
      let done = false;
      const finish = (v) => { if (done) return; done = true; dlg.close(); resolve(v); };
      $('#caCancel').onclick = () => finish(null);
      altBtn.onclick = () => finish('alt');
      $('#calAskForm').onsubmit = (e) => { e.preventDefault(); finish(input ? $('#caInput').value.trim() : true); };
      dlg.onclose = () => finish(null);
      dlg.showModal();
      if (input) setTimeout(() => $('#caInput').focus(), 50);
    });
  }

  // =====================================================================
  // Start: Links (?join=…, ?ev=…), Abgleich
  // =====================================================================
  const q = new URLSearchParams(location.search);
  const qJoin = q.get('join'), qEv = q.get('ev');
  if (qJoin || qEv) history.replaceState(null, '', location.pathname);
  setTimeout(() => {
    if (qEv) { const ev = C.decodeEvent(qEv); if (ev) importEvent(ev); else A.toast('Der Termin-Link ist leider beschädigt'); }
    const code = qJoin ? C.parseInviteCode(qJoin) : null;
    if (code) join(code);
  }, 400);
  // Nach dem Anmelden: offene Einladung annehmen, gemeinsame Kalender laden
  let wasLogged = logged();
  A.onRender(() => {
    const now = logged();
    if (now && !wasLogged) { loadShared(true); const pend = ls.get(JOIN_KEY); if (pend) setTimeout(() => join(pend), 300); }
    if (!now && wasLogged) loadShared();
    wasLogged = now;
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadShared(); });
  setInterval(() => { if (!document.hidden && A.view === 'calendar') loadShared(); }, 60000);

  A.onRender(render);
  if (logged()) loadShared(true);
  A.render();
})();
