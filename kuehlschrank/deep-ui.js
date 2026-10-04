/* Vertiefungen: Einkaufsliste nach Gängen, Ausgaben-Verlauf, Gewohnheits-Kalender, alle Erinnerungen in den
   Handy-Kalender, Geburtstage & Geschenkideen, Tagebuch. Baut auf window.App und window.FridgeDeep auf. */
(() => {
  'use strict';
  const A = window.App;
  const L = A.L;
  const D = window.FridgeDeep;
  const P = window.FridgePlanner;
  const F = window.FridgeLife;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const esc = A.esc;
  const st = () => A.state;
  const today = () => A.today();
  const euro = (v) => L.formatEuro(v);
  if (!st().gifts || typeof st().gifts !== 'object') st().gifts = {};
  if (!st().journal || typeof st().journal !== 'object') st().journal = {};
  const dayText = (n) => (n === 0 ? 'heute' : n === 1 ? 'morgen' : `in ${n} Tagen`);

  // =====================================================================
  // Einkaufsliste nach Gängen
  // =====================================================================
  const shopToggle = document.createElement('label');
  shopToggle.className = 'toggle aisle-toggle';
  shopToggle.innerHTML = '<input type="checkbox" id="shopAisles"> nach Supermarkt-Gängen sortieren';
  $('#shopList').before(shopToggle);
  $('#shopAisles').addEventListener('change', () => { st().settings.shopAisles = $('#shopAisles').checked; A.save(); A.render(); });
  function groupShopping() {
    if (A.view !== 'shopping') return;
    const on = st().settings.shopAisles !== false;
    $('#shopAisles').checked = on;
    const rows = $$('#shopList > .shop-item:not(.done)');
    shopToggle.hidden = rows.length < 3;
    if (!on || rows.length < 3) return;
    const byId = Object.fromEntries(st().shopping.map((i) => [i.id, i]));
    const groups = D.groupByAisle(rows.map((r) => ({ ...byId[r.dataset.id], row: r })).filter((x) => x.name));
    const frag = document.createDocumentFragment();
    for (const g of groups) {
      const h = document.createElement('h3');
      h.className = 'aisle-title';
      h.innerHTML = `${esc(g.label)} <span>${g.items.length}</span>`;
      frag.appendChild(h);
      g.items.forEach((x) => frag.appendChild(x.row));
    }
    $('#shopList').prepend(frag);
  }

  // =====================================================================
  // Ausgaben: Verlauf der letzten 6 Monate
  // =====================================================================
  const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const trend = document.createElement('div');
  trend.className = 'card exp-trend';
  trend.id = 'expTrend';
  $('#expSummary').after(trend);
  let trendPick = null;
  function viewedMonth() {
    const [mName, y] = ($('#expTitle').textContent || '').split(' ');
    const m = MONTHS.indexOf(mName);
    return m >= 0 && y ? `${y}-${String(m + 1).padStart(2, '0')}` : today().slice(0, 7);
  }
  function renderTrend() {
    if (A.view !== 'expenses') return;
    const end = viewedMonth();
    const t = D.monthlyTotals(st().expenses, end, 6, P.isIncome);
    if (!t.months.some((x) => x.total > 0)) { trend.hidden = true; return; }
    trend.hidden = false;
    const max = Math.max(...t.months.map((x) => x.total), t.avg, 1);
    const pick = t.months.find((x) => x.ym === trendPick) || t.months[t.months.length - 1];
    const short = (ym) => MONTHS[Number(ym.slice(5)) - 1].slice(0, 3);
    const diff = pick.total - t.avg;
    trend.innerHTML = `<div class="trend-head"><b>Verlauf · 6 Monate</b><span class="muted small">Ø ${euro(t.avg)}</span></div>
      <div class="trend-caption"><b>${MONTHS[Number(pick.ym.slice(5)) - 1]} ${pick.ym.slice(0, 4)}: ${euro(pick.total)}</b>
        ${t.avg && pick.total ? `<span class="muted small">${Math.abs(diff) < 1 ? 'genau im Schnitt' : `${euro(Math.abs(diff))} ${diff > 0 ? 'über' : 'unter'} dem Schnitt`}</span>` : ''}</div>
      <div class="trend-chart" role="list">
        <i class="trend-avg" style="bottom:${(t.avg / max) * 100}%"></i>
        ${t.months.map((x) => `<button class="trend-col ${x === pick ? 'on' : ''}" data-ym="${x.ym}" role="listitem" aria-label="${short(x.ym)}: ${euro(x.total)}">
          <span class="trend-bar" style="height:${Math.max(x.total ? 2 : 0, (x.total / max) * 100)}%"></span></button>`).join('')}
      </div>
      <div class="trend-labels">${t.months.map((x) => `<span class="${x === pick ? 'on' : ''}">${short(x.ym)}</span>`).join('')}</div>`;
  }
  trend.addEventListener('click', (e) => { const c = e.target.closest('[data-ym]'); if (c) { trendPick = c.dataset.ym; renderTrend(); } });

  // =====================================================================
  // Gewohnheiten: Verlauf der letzten 12 Wochen
  // =====================================================================
  const openHeat = new Set();
  function renderHeatmaps() {
    if (A.view !== 'habits') return;
    $$('#habitList .habit').forEach((card) => {
      const id = (card.querySelector('[data-hedit]') || {}).dataset?.hedit;
      const h = st().habits.find((x) => x.id === id);
      if (!h || card.querySelector('.h-heat')) return;
      const heat = D.habitHeatmap(st().habitLog, h, today(), 12);
      const best = D.bestWeekday(heat);
      card.insertAdjacentHTML('beforeend', `<details class="h-heat" data-heat="${esc(h.id)}" ${openHeat.has(h.id) ? 'open' : ''}><summary>Verlauf · 12 Wochen</summary>
        <div class="heat-wrap"><div class="heat-days"><span>Mo</span><span></span><span>Mi</span><span></span><span>Fr</span><span></span><span>So</span></div>
        <div class="heat-grid">${heat.cols.map((col) => `<div>${col.map((c) => `<i class="lv${c.level}" title="${L.formatDate(c.iso)}: ${c.count}"></i>`).join('')}</div>`).join('')}</div></div>
        <div class="heat-legend muted small"><span><i class="lv0"></i>nicht</span><span><i class="lv1"></i>angefangen</span><span><i class="lv2"></i>geschafft</span></div>
        <p class="small">${heat.met} von ${heat.active} Tagen geschafft (${heat.rate} %)${best ? ` · am besten klappt es ${best}s` : ''}</p></details>`);
    });
  }
  $('#habitList').addEventListener('toggle', (e) => {
    const d = e.target.closest && e.target.closest('[data-heat]');
    if (d) { if (d.open) openHeat.add(d.dataset.heat); else openHeat.delete(d.dataset.heat); }
  }, true);

  // =====================================================================
  // Alle Erinnerungen in den Handy-Kalender
  // =====================================================================
  const at9 = (daysBefore) => daysBefore * 1440 - 540; // ganztägig: Erinnerung um 9 Uhr, n Tage vorher
  const EV_RRULE = { weekly: 'FREQ=WEEKLY', biweekly: 'FREQ=WEEKLY;INTERVAL=2', monthly: 'FREQ=MONTHLY', yearly: 'FREQ=YEARLY' };
  const TASK_RRULE = { daily: 'FREQ=DAILY', weekdays: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', weekly: 'FREQ=WEEKLY', biweekly: 'FREQ=WEEKLY;INTERVAL=2', monthly: 'FREQ=MONTHLY' };
  function reminderItems() {
    const t = today();
    const items = [];
    items.push(...D.medItems(st().meds || [], t));
    for (const ev of st().events) {
      if (!ev.date) continue;
      const bd = ev.type === 'geburtstag';
      items.push({ uid: `ev-${ev.id}`, title: bd ? `Geburtstag ${ev.title}` : ev.title, date: ev.date, time: ev.time || null, rrule: EV_RRULE[ev.repeat] || null, note: ev.note || '',
        alarm: ev.time ? (ev.remind != null && ev.remind !== '' ? Number(ev.remind) : 30) : at9(bd ? 1 : 0) });
    }
    for (const k of st().tasks) {
      if (k.done || !k.due) continue;
      items.push({ uid: `task-${k.id}`, title: k.title, date: k.due, time: k.time || null, rrule: TASK_RRULE[k.repeat] || null, alarm: k.time ? 0 : at9(0), note: k.note || '' });
    }
    for (const d of st().deadlines || []) items.push({ uid: `dl-${d.id}`, title: `${d.title} läuft ab`, date: d.date, alarm: at9(Number(d.remind) || 30), note: d.note || '' });
    const O = window.FridgeOrganize;
    if (O) for (const c of st().contracts || []) {
      if (c.cancelled) continue;
      const i = O.contractInfo(c, t);
      if (i.cancelBy) items.push({ uid: `ctr-${c.id}-${i.cancelBy}`, title: `Kündigungsfrist ${c.name}`, date: i.cancelBy, alarm: at9(14), note: `Letzter Tag zum Kündigen – sonst läuft der Vertrag bis nach dem ${L.formatDate(i.end)} weiter.` });
    }
    const DY = window.FridgeDaily;
    if (DY) {
      for (const w of st().waste || []) {
        const next = DY.nextPickup(w, t);
        if (next) items.push({ uid: `waste-${w.id}`, title: `${DY.WASTE_TYPES[w.type].label} rausstellen`, date: next, rrule: w.every ? `FREQ=WEEKLY;INTERVAL=${w.every / 7}` : null, alarm: 360 });
      }
      for (const p of st().parcels || []) {
        const s = DY.parcelStatus(p, t);
        if (s.until && !p.returned && s.left >= 0) items.push({ uid: `ret-${p.id}`, title: `Rückgabefrist: ${p.what}`, date: s.until, alarm: at9(2) });
      }
    }
    for (const l of st().loans || []) if (!l.returned && l.due) items.push({ uid: `loan-${l.id}`, title: l.dir === 'out' ? `${l.who}: ${l.what} zurückbekommen` : `${l.what} an ${l.who} zurückgeben`, date: l.due, alarm: at9(0) });
    const PL = window.FridgePlus;
    if (PL) for (const c of st().countdowns || []) {
      const i = PL.countdownInfo(c, t);
      if (!i.past) items.push({ uid: `cd-${c.id}`, title: c.title, date: c.yearly ? c.date : i.date, rrule: c.yearly ? 'FREQ=YEARLY' : null, alarm: at9(1) });
    }
    return items;
  }
  function renderExportInfo() {
    const last = st().settings.lastReminderExport;
    $('#exportInfo').textContent = last ? `Zuletzt übertragen: ${L.formatDate(last.date)} (${last.count} Einträge). Neue Einträge danach erneut übertragen.` : '';
  }
  $('#btnExportReminders').addEventListener('click', () => {
    const items = reminderItems();
    if (!items.length) { A.toast('Noch nichts mit Datum eingetragen'); return; }
    const now = new Date();
    const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([D.buildICS(items, stamp)], { type: 'text/calendar' }));
    a.download = 'alltagsheld-erinnerungen.ics';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    st().settings.lastReminderExport = { date: today(), count: items.length };
    A.save(); renderExportInfo();
    A.toast(`${items.length} Erinnerungen übertragen – Datei öffnen und „Hinzufügen“ wählen`);
  });

  // =====================================================================
  // Geburtstage & Geschenkideen
  // =====================================================================
  const openBd = new Set();
  function giftsOf(id) { return (st().gifts[id] = st().gifts[id] || []); }
  function renderBirthdays() {
    if (A.view !== 'birthdays') return;
    const list = D.upcomingBirthdays(st().events, today());
    $('#bdList').innerHTML = list.length ? list.map(({ e, date, days, age }) => {
      const gifts = giftsOf(e.id);
      const bought = gifts.find((g) => g.bought === date.slice(0, 4));
      return `<details class="card bd ${days <= 14 ? 'soon' : ''}" data-bd="${esc(e.id)}" ${openBd.has(e.id) ? 'open' : ''}>
        <summary><span class="bd-date"><b>${date.slice(8)}</b><small>${['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'][Number(date.slice(5, 7)) - 1]}</small></span>
          <span class="grow"><b>${esc(e.title)}</b><span class="muted small">${days === 0 ? '<b class="ok-text">heute!</b>' : dayText(days)}${age != null ? ` · wird ${age}` : ''}${D.isRound(age) ? ' <span class="tag">rund</span>' : ''}</span></span>
          <span class="bd-gift ${bought ? 'ok' : days <= 14 ? 'warn' : ''}" title="Geschenk">${bought ? '✓' : gifts.length || ''}<i class="ic ic-gift"></i></span></summary>
        <div class="bd-body">
          ${gifts.length ? gifts.map((g) => `<div class="gift ${g.bought ? 'bought' : ''}"><button class="cl-item ${g.bought ? 'done' : ''}" data-gift="${esc(g.id)}"><span class="cl-box"></span>${esc(g.text)}${g.bought ? ` <span class="muted small">gekauft ${esc(g.bought)}</span>` : ''}</button><button class="icon-sm" data-gift-del="${esc(g.id)}" aria-label="entfernen">✕</button></div>`).join('') : '<p class="muted small">Noch keine Geschenkidee – schreib auf, was dir einfällt, wenn es dir einfällt.</p>'}
          <form class="addrow gift-form" data-gift-add="${esc(e.id)}"><input placeholder="Geschenkidee, z. B. Buch von …" autocomplete="off"><button class="btn">＋</button></form>
          <div class="row tight"><button class="btn small" data-bd-edit="${esc(e.id)}">Bearbeiten</button>${gifts.some((g) => !g.bought) ? `<button class="btn small" data-bd-shop="${esc(e.id)}">Auf Einkaufsliste</button>` : ''}</div>
        </div></details>`;
    }).join('') : `<div class="empty"><div class="big-emoji"><i class="ic ic-gift"></i></div><p><b>Nie wieder einen Geburtstag vergessen.</b></p><p class="muted">Mit Alter, Erinnerung am Vortag und Geschenkideen, die du sammeln kannst, sobald sie dir einfallen.</p></div>`;
  }
  $('#bdList').addEventListener('toggle', (e) => {
    const d = e.target.closest && e.target.closest('[data-bd]');
    if (d) { if (d.open) openBd.add(d.dataset.bd); else openBd.delete(d.dataset.bd); }
  }, true);
  $('#bdList').addEventListener('submit', (e) => {
    const f = e.target.closest('[data-gift-add]');
    if (!f) return;
    e.preventDefault();
    const v = f.querySelector('input').value.trim();
    if (!v) return;
    giftsOf(f.dataset.giftAdd).push({ id: A.uid(), text: v, bought: null });
    openBd.add(f.dataset.giftAdd);
    A.save(); A.render();
    const again = $(`[data-gift-add="${f.dataset.giftAdd}"] input`);
    if (again) again.focus();
  });
  $('#bdList').addEventListener('click', (e) => {
    const card = e.target.closest('[data-bd]');
    if (!card) return;
    const id = card.dataset.bd;
    const g = e.target.closest('[data-gift]');
    if (g) {
      const gift = giftsOf(id).find((x) => x.id === g.dataset.gift);
      const nb = D.upcomingBirthdays(st().events.filter((x) => x.id === id), today())[0];
      gift.bought = gift.bought ? null : (nb ? nb.date.slice(0, 4) : today().slice(0, 4));
      A.save(); A.render();
      if (gift.bought) A.toast('Geschenk besorgt – abgehakt');
      return;
    }
    const del = e.target.closest('[data-gift-del]');
    if (del) { st().gifts[id] = giftsOf(id).filter((x) => x.id !== del.dataset.giftDel); A.save(); A.render(); return; }
    if (e.target.closest('[data-bd-edit]')) { A.openEvent(id); return; }
    if (e.target.closest('[data-bd-shop]')) {
      const ev = st().events.find((x) => x.id === id);
      giftsOf(id).filter((x) => !x.bought).forEach((x) => A.addToShopping(`${x.text} (für ${ev.title})`));
      A.save(); A.render(); A.toast('Geschenkideen stehen auf der Einkaufsliste');
    }
  });
  $('#bdAdd').onclick = () => { A.showView('calendar'); A.newEvent('geburtstag'); };

  // =====================================================================
  // Tagebuch
  // =====================================================================
  let jrMood = null;
  $('#jrMoods').innerHTML = F.MOODS.map((m) => `<button type="button" data-mood="${m.v}" aria-label="${m.label}">${m.emoji}</button>`).join('');
  $('#jrMoods').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mood]');
    if (!b) return;
    jrMood = Number(b.dataset.mood);
    $$('#jrMoods [data-mood]').forEach((x) => x.classList.toggle('active', x === b));
  });
  let jrLoaded = null;
  function renderJournal() {
    if (A.view !== 'journal') return;
    const t = today();
    const j = st().journal[t] || {};
    if (jrLoaded !== t) { // Eingaben nicht beim Neuzeichnen überschreiben
      jrLoaded = t;
      $('#jrText').value = j.text || '';
      ['#jrG1', '#jrG2', '#jrG3'].forEach((s, i) => { $(s).value = (j.grateful || [])[i] || ''; });
      jrMood = (st().moods[t] || {}).mood || null;
      $$('#jrMoods [data-mood]').forEach((x) => x.classList.toggle('active', Number(x.dataset.mood) === jrMood));
    }
    $('#jrDate').textContent = new Date(t + 'T12:00').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
    $('#jrPrompt').textContent = D.promptOfDay(t);
    const streak = D.journalStreak(st().journal, t);
    $('#jrStreak').textContent = streak > 1 ? `${streak} Tage in Folge geschrieben` : '';
    const fb = D.flashbacks(st().journal, t);
    $('#jrFlash').innerHTML = fb.map((f) => `<div class="card jr-flash"><span class="muted small">${f.label} · ${L.formatDate(f.date)}</span>${entryHtml(f.date, f.entry)}</div>`).join('');
    const days = Object.keys(st().journal).filter((d) => d < t && (st().journal[d].text || (st().journal[d].grateful || []).some(Boolean))).sort().reverse();
    $('#jrList').innerHTML = days.length ? days.slice(0, 60).map((d) => `<details class="card jr-entry"><summary><span class="jr-mood">${moodEmoji(d)}</span><span class="grow"><b>${new Date(d + 'T12:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long', year: d.slice(0, 4) === t.slice(0, 4) ? undefined : 'numeric' })}</b>
        <span class="muted small">${esc((st().journal[d].text || (st().journal[d].grateful || []).filter(Boolean).join(', ')).slice(0, 70))}</span></span></summary>${entryHtml(d, st().journal[d])}</details>`).join('')
      : '<p class="muted small">Hier erscheinen deine Einträge. Schon zwei Sätze am Abend machen einen Unterschied.</p>';
  }
  const moodEmoji = (d) => { const m = st().moods[d]; const x = m && F.MOODS.find((y) => y.v === m.mood); return x ? x.emoji : '·'; };
  function entryHtml(d, e) {
    const g = (e.grateful || []).filter(Boolean);
    return `${e.text ? `<p class="jr-text">${esc(e.text).replace(/\n/g, '<br>')}</p>` : ''}${g.length ? `<p class="small"><b>Dankbar für:</b> ${g.map(esc).join(' · ')}</p>` : ''}`;
  }
  $('#jrForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const t = today();
    const text = $('#jrText').value.trim();
    const grateful = ['#jrG1', '#jrG2', '#jrG3'].map((s) => $(s).value.trim());
    if (!text && !grateful.some(Boolean) && !jrMood) { A.toast('Schreib ein paar Worte oder wähle eine Stimmung'); return; }
    st().journal[t] = { text, grateful, updated: new Date().toISOString() };
    if (jrMood) st().moods[t] = { ...(st().moods[t] || {}), mood: jrMood };
    // Gewohnheit „Dankbarkeit notieren“ automatisch abhaken
    const gh = st().habits.find((h) => /dankbar/i.test(h.name));
    if (gh && grateful.some(Boolean)) { st().habitLog[t] = st().habitLog[t] || {}; st().habitLog[t][gh.id] = Math.max(st().habitLog[t][gh.id] || 0, gh.target || 1); }
    A.save(); A.render();
    const s = D.journalStreak(st().journal, t);
    A.toast(s > 1 ? `Gespeichert – ${s} Tage in Folge` : 'Eintrag gespeichert');
  });

  // =====================================================================
  // Startseite, Mehr, Suche
  // =====================================================================
  if (A.homeCards) Object.assign(A.homeCards, { birthdays: 'Geburtstage', journal: 'Tagebuch am Abend' });
  if (A.homeOrder) Object.assign(A.homeOrder, { birthdays: [11, 'today'], journal: [43, 'review'] });
  if (A.homeIcons) Object.assign(A.homeIcons, { birthdays: 'gift', journal: 'book' });
  const home = document.createElement('div');
  home.id = 'homeDeep';
  $('#homeFlow').appendChild(home);
  function renderHomeDeep() {
    if (A.view !== 'home') return;
    const t = today();
    const parts = [];
    const bds = D.upcomingBirthdays(st().events, t).filter((x) => x.days <= 7);
    if (bds.length) {
      parts.push(`<button class="card home-card" data-card="birthdays" data-goto="birthdays"><div class="home-title">Geburtstage</div>
        ${bds.slice(0, 3).map((x) => { const gifts = giftsOf(x.e.id); const has = gifts.some((g) => g.bought === x.date.slice(0, 4)); return `<div class="home-line"><b>${esc(x.e.title)}</b> ${x.days === 0 ? 'hat heute Geburtstag' : dayText(x.days)}${x.age != null ? ` (wird ${x.age})` : ''} · ${has ? 'Geschenk ✓' : `<span class="${x.days <= 3 ? 'warn-text' : 'muted'}">${gifts.length ? `${gifts.length} Idee${gifts.length > 1 ? 'n' : ''}` : 'noch kein Geschenk'}</span>`}</div>`; }).join('')}</button>`);
    }
    const j = st().journal[t];
    if (new Date().getHours() >= 19 && !(j && (j.text || (j.grateful || []).some(Boolean)))) {
      parts.push(`<button class="card home-card" data-card="journal" data-goto="journal"><div class="home-title">Tagebuch</div><div class="home-line">${esc(D.promptOfDay(t))}</div></button>`);
    }
    home.innerHTML = parts.join('');
  }
  A.glanceSources = A.glanceSources || [];
  A.glanceSources.push(() => {
    const b = D.upcomingBirthdays(st().events, today()).filter((x) => x.days <= 1);
    return b.map((x) => ['birthdays', 'gift', `${x.e.title} ${x.days === 0 ? 'hat Geburtstag' : 'morgen'}`, '']);
  });
  function renderHubDeep() {
    const n = D.upcomingBirthdays(st().events, today())[0];
    $('#hubBirthdays').textContent = n ? `${n.e.title}: ${dayText(n.days)}` : 'mit Geschenkideen';
    const s = D.journalStreak(st().journal, today());
    $('#hubJournal').textContent = s ? `${s} Tag${s > 1 ? 'e' : ''} in Folge` : st().journal[today()] ? 'heute geschrieben' : 'Gedanken & Dankbarkeit';
  }
  if (A.searchSources) A.searchSources.push((has) => [
    ...Object.entries(st().journal).filter(([, e]) => has(e.text, (e.grateful || []).join(' '))).slice(0, 8)
      .map(([d, e]) => ({ kind: 'go', view: 'journal', icon: '📔', text: (e.text || (e.grateful || []).join(', ')).slice(0, 50), sub: `Tagebuch · ${L.formatDate(d)}` })),
    ...Object.entries(st().gifts).flatMap(([id, list]) => list.filter((g) => has(g.text)).map((g) => {
      const ev = st().events.find((x) => x.id === id);
      return { kind: 'go', view: 'birthdays', icon: '🎁', text: g.text, sub: `Geschenkidee${ev ? ' für ' + ev.title : ''}` };
    })),
  ]);

  A.actions.journal = () => A.showView('journal');
  A.actions.birthday = () => { A.showView('calendar'); A.newEvent('geburtstag'); };

  A.onRender(groupShopping);
  A.onRender(renderTrend);
  A.onRender(renderHeatmaps);
  A.onRender(renderExportInfo);
  A.onRender(renderBirthdays);
  A.onRender(renderJournal);
  A.onRender(renderHomeDeep);
  A.onRender(renderHubDeep);
  if (A.applyHomeHidden) A.onRender(A.applyHomeHidden);
  // Ausgaben-Monat wechseln zeichnet nur die Ausgaben neu → Verlauf mitziehen
  ['#expPrev', '#expNext'].forEach((s) => $(s).addEventListener('click', () => { trendPick = null; setTimeout(renderTrend, 0); }));
  A.render();
})();
