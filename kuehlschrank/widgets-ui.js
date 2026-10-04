/* Widgets auf der Startseite (frei wählbar), Zahl am App-Symbol und direkte Aktionen aus den App-Verknüpfungen. */
(() => {
  'use strict';
  const A = window.App;
  const L = A.L;
  const P = window.FridgePlanner;
  const F = window.FridgeLife;
  const DY = window.FridgeDaily;
  const PL = window.FridgePlus;
  const $ = (s) => document.querySelector(s);
  const esc = A.esc;
  const st = () => A.state;
  const today = () => A.today();
  const euro = (v) => L.formatEuro(v);
  const DEFAULT = ['water', 'event', 'shopping', 'waste'];
  const chosen = () => (Array.isArray(st().settings.widgets) ? st().settings.widgets : DEFAULT);
  const dayLabel = (d) => { const n = L.daysUntil(d); return n === 0 ? 'heute' : n === 1 ? 'morgen' : new Date(d + 'T12:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' }); };

  // ---------- Wasser (nutzt die Gewohnheit „Wasser trinken“) ----------
  function waterHabit(create) {
    let h = st().habits.find((x) => /wasser/i.test(x.name));
    if (!h && create) {
      const p = F.HABIT_PRESETS.find((x) => /wasser/i.test(x.name)) || { name: 'Wasser trinken', emoji: '💧', target: 8, unit: 'Gläser' };
      h = { id: A.uid(), created: today(), ...p };
      st().habits.push(h);
    }
    return h;
  }
  const habitCount = (h) => (st().habitLog[today()] && st().habitLog[today()][h.id]) || 0;
  function drink() {
    const h = waterHabit(true);
    const d = today();
    st().habitLog[d] = st().habitLog[d] || {};
    const n = Math.min(99, habitCount(h) + 1);
    st().habitLog[d][h.id] = n;
    A.save(); A.render();
    A.toast(n >= h.target ? `${n} Gläser – Tagesziel geschafft!` : `${n} von ${h.target} Gläsern`, { label: 'Rückgängig', fn: () => { st().habitLog[d][h.id] = n - 1; A.save(); A.render(); } });
  }

  /** Alle Widgets: Wert, kleine Zeile darunter, Aktion beim Antippen */
  const WIDGETS = {
    water: { label: 'Wasser', icon: 'droplet', get: () => { const h = waterHabit(false); return h ? { value: `${habitCount(h)}/${h.target}`, sub: 'Glas +1', done: habitCount(h) >= h.target } : { value: '+1', sub: 'Glas trinken' }; }, tap: drink },
    event: { label: 'Nächster Termin', icon: 'calendar', go: 'calendar', get: () => {
      const o = P.occurrences(st().events, today(), P.addDays(today(), 30))[0];
      return o ? { value: o.event.time && o.date === today() ? o.event.time : dayLabel(o.date), sub: o.event.title } : { value: '–', sub: 'keine Termine' };
    } },
    shopping: { label: 'Einkauf', icon: 'cart', go: 'shopping', get: () => { const n = st().shopping.filter((i) => !i.done).length; return { value: String(n), sub: 'auf der Liste' }; } },
    waste: { label: 'Müll', icon: 'trash', go: 'waste', get: () => {
      if (!DY || !(st().waste || []).length) return { value: '–', sub: 'einrichten' };
      const x = DY.pickupsBetween(st().waste, today(), DY.addDays(today(), 30))[0];
      return x ? { value: dayLabel(x.date), sub: DY.WASTE_TYPES[x.w.type].label, warn: L.daysUntil(x.date) <= 1 } : { value: '–', sub: 'nichts geplant' };
    } },
    budget: { label: 'Budget', icon: 'wallet', go: 'expenses', get: () => {
      const m = today().slice(0, 7);
      const sum = P.summarize(P.monthEntries(st().expenses, m).filter((e) => !P.isIncome(e))).total;
      const b = P.budgetStatus(sum, st().settings.budget, m);
      return b ? { value: euro(Math.abs(b.left)).replace(/,00/, ''), sub: b.over ? 'über Budget' : 'noch übrig', warn: b.over } : { value: euro(sum).replace(/,00/, ''), sub: 'diesen Monat' };
    } },
    kcal: { label: 'Kalorien', icon: 'flame', go: 'food', get: () => {
      const k = Math.round((st().food || []).filter((f) => f.date === today()).reduce((a, f) => a + (f.kcal || 0), 0));
      return { value: k.toLocaleString('de-DE'), sub: 'kcal heute' };
    } },
    meds: { label: 'Medikament', icon: 'pill', go: 'meds', get: () => {
      const X = window.FridgeExtras;
      const open = X ? X.dosesOn(st().meds || [], today(), st().medLog).filter((d) => !d.taken) : [];
      return open.length ? { value: open[0].time, sub: open[0].med.name } : { value: '✓', sub: (st().meds || []).length ? 'alles genommen' : 'keine' };
    } },
    parking: { label: 'Parken', icon: 'parking', get: () => {
      const p = st().parking;
      if (!p) return { value: 'P', sub: 'Hier geparkt' };
      const left = DY && DY.parkingLeft(p, Date.now());
      return left != null ? { value: `${Math.max(0, left)} Min`, sub: 'Parkuhr', warn: left <= 10 } : { value: new Date(p.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }), sub: 'geparkt' };
    }, tap: () => (st().parking ? A.showView('parking') : A.actions.parkNow && A.actions.parkNow()) },
    countdown: { label: 'Countdown', icon: 'hourglass', go: 'countdowns', get: () => {
      const n = PL && PL.upcomingCountdowns(st().countdowns || [], today())[0];
      return n ? { value: `${n.i.days} T.`, sub: n.c.title } : { value: '–', sub: 'keiner' };
    } },
    focus: { label: 'Fokus', icon: 'target', go: 'focus', get: () => ({ value: '25:00', sub: 'Fokus starten' }) },
    note: { label: 'Notiz', icon: 'note', get: () => ({ value: '＋', sub: 'schnelle Notiz' }), tap: () => A.actions.note && A.actions.note() },
  };

  // ---------- Startseite ----------
  const box = document.createElement('div');
  box.className = 'home-card widgets-grid';
  box.dataset.card = 'widgets';
  $('#homeFlow').appendChild(box);
  if (A.homeCards) A.homeCards.widgets = 'Widgets';
  if (A.homeOrder) A.homeOrder.widgets = [0, 'top'];
  function render() {
    if (A.view !== 'home') return;
    const list = chosen().filter((k) => WIDGETS[k]);
    box.innerHTML = list.map((k) => {
      const w = WIDGETS[k];
      let v;
      try { v = w.get(); } catch (e) { v = { value: '–', sub: '' }; }
      return `<button class="widget ${v.warn ? 'warn' : ''} ${v.done ? 'done' : ''}" data-widget="${k}" aria-label="${esc(w.label)}: ${esc(v.value)} ${esc(v.sub || '')}">
        <span class="w-top"><i class="ic ic-${w.icon}"></i><span>${esc(w.label)}</span></span>
        <b class="w-val">${esc(v.value)}</b><span class="w-sub">${esc(v.sub || '')}</span></button>`;
    }).join('');
  }
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-widget]');
    if (!b) return;
    const w = WIDGETS[b.dataset.widget];
    if (w.tap) w.tap(); else if (w.go) A.showView(w.go);
  });

  // ---------- Auswahl in Einstellungen → Startseite ----------
  const pick = document.createElement('div');
  pick.innerHTML = '<p class="set-label">Widgets oben auf der Startseite</p><div class="chips" id="widgetToggles"></div>';
  const homeBody = document.querySelector('#prefHome .pref-body');
  if (homeBody) homeBody.prepend(pick);
  function renderPick() {
    const c = chosen();
    $('#widgetToggles').innerHTML = Object.entries(WIDGETS).map(([k, w]) => `<button class="chip ${c.includes(k) ? 'active' : ''}" data-wt="${k}"><i class="ic ic-${w.icon}"></i> ${esc(w.label)}</button>`).join('');
  }
  $('#widgetToggles').addEventListener('click', (e) => {
    const b = e.target.closest('[data-wt]');
    if (!b) return;
    const c = chosen().slice();
    const k = b.dataset.wt;
    if (!c.includes(k) && c.length >= 6) { A.toast('Höchstens 6 Widgets – nimm erst eins heraus'); return; }
    st().settings.widgets = c.includes(k) ? c.filter((x) => x !== k) : c.concat(k);
    A.save(); A.render();
  });

  // ---------- Zahl am App-Symbol ----------
  function badgeCount() {
    const t = today();
    const tasks = st().tasks.filter((k) => !k.done && k.due && k.due <= t).length;
    const X = window.FridgeExtras;
    const meds = X ? X.dosesOn(st().meds || [], t, st().medLog).filter((d) => !d.taken).length : 0;
    const exp = st().items.filter((i) => i.expiry && L.daysUntil(i.expiry) <= 0).length;
    return tasks + meds + exp;
  }
  let lastBadge = null;
  function updateBadge() {
    if (!('setAppBadge' in navigator)) return;
    const n = st().settings.badge === false ? 0 : badgeCount();
    if (n === lastBadge) return;
    lastBadge = n;
    (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
  }
  const badgeRow = document.createElement('label');
  badgeRow.className = 'toggle';
  badgeRow.innerHTML = '<input type="checkbox" id="badgeToggle"> Zahl am App-Symbol (heute fällig)';
  if (homeBody) homeBody.appendChild(badgeRow);
  $('#badgeToggle').addEventListener('change', () => { st().settings.badge = $('#badgeToggle').checked; A.save(); updateBadge(); });
  const renderBadgeToggle = () => { $('#badgeToggle').checked = st().settings.badge !== false; };

  // ---------- Direkte Aktionen aus den App-Verknüpfungen (lange auf das App-Symbol drücken) ----------
  A.actions.water = drink;
  const action = new URLSearchParams(location.search).get('action');
  if (action && A.actions[action]) {
    history.replaceState(null, '', location.pathname);
    setTimeout(() => A.actions[action](), 300);
  }

  A.onRender(render);
  A.onRender(renderPick);
  A.onRender(renderBadgeToggle);
  A.onRender(updateBadge);
  if (A.applyHomeHidden) A.onRender(A.applyHomeHidden);
  setInterval(() => { if (A.view === 'home' && !document.hidden && st().parking) render(); }, 30000);
  A.render();
})();
