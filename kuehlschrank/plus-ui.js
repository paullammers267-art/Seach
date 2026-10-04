/* Oberfläche für Pflanzen, Verliehen & Geliehen, Countdowns, Fokus-Timer, Notfallpass, Gedanke des Tages
   und Design anpassen (Akzentfarbe, Schriftgröße, kompakt, Name). Baut auf window.App und window.FridgePlus auf. */
(() => {
  'use strict';
  const A = window.App;
  const L = A.L;
  const PL = window.FridgePlus;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const esc = A.esc;
  const st = () => A.state;
  const today = () => A.today();
  for (const k of ['plants', 'loans', 'countdowns', 'focusLog']) if (!Array.isArray(st()[k])) st()[k] = [];
  if (!st().settings.emergency) st().settings.emergency = {};
  const leftText = (n) => (n < 0 ? `seit ${-n} Tag${n === -1 ? '' : 'en'} überfällig` : n === 0 ? 'heute' : n === 1 ? 'morgen' : `in ${n} Tagen`);

  // =====================================================================
  // 🎨 Design anpassen
  // =====================================================================
  function applyDesign() {
    const s = st().settings, de = document.documentElement;
    if (s.accent && s.accent !== 'teal') de.dataset.accent = s.accent; else delete de.dataset.accent;
    if (s.textSize && s.textSize !== 'normal') de.dataset.size = s.textSize; else delete de.dataset.size;
    if (s.compact) de.dataset.density = 'compact'; else delete de.dataset.density;
    $$('#accentPick [data-accent]').forEach((b) => b.classList.toggle('active', b.dataset.accent === (s.accent || 'teal')));
    $$('#sizePick [data-size]').forEach((b) => b.classList.toggle('active', b.dataset.size === (s.textSize || 'normal')));
    $('#compactPick').checked = !!s.compact;
    if (document.activeElement !== $('#namePick')) $('#namePick').value = s.name || '';
  }
  $('#accentPick').innerHTML = Object.entries(PL.ACCENTS).map(([k, a]) =>
    `<button type="button" class="swatch" data-accent="${k}" style="--sw:${a.light};--sw-d:${a.dark}" aria-label="${a.label}"><i></i><span>${a.label}</span></button>`).join('');
  $('#sizePick').innerHTML = Object.entries(PL.TEXT_SIZES).map(([k, t]) => `<button type="button" data-size="${k}" style="font-size:${t.px * 0.9}px">${t.label}</button>`).join('');
  $('#accentPick').addEventListener('click', (e) => {
    const b = e.target.closest('[data-accent]');
    if (!b) return;
    st().settings.accent = b.dataset.accent;
    A.save(); applyDesign();
  });
  $('#sizePick').addEventListener('click', (e) => {
    const b = e.target.closest('[data-size]');
    if (!b) return;
    st().settings.textSize = b.dataset.size;
    A.save(); applyDesign();
  });
  $('#compactPick').addEventListener('change', () => { st().settings.compact = $('#compactPick').checked; A.save(); applyDesign(); });
  $('#namePick').addEventListener('change', () => { st().settings.name = $('#namePick').value.trim(); A.save(); A.render(); });

  /** Begrüßung mit Namen */
  function personalizeHello() {
    if (A.view !== 'home') return;
    const n = (st().settings.name || '').trim();
    const el = $('#homeHello');
    if (n && !el.textContent.includes(n)) el.textContent = el.textContent.replace('!', `, ${n}!`);
  }

  // =====================================================================
  // 🪴 Pflanzen
  // =====================================================================
  const plantDlg = $('#plantDialog');
  let editingPlant = null;
  $('#plantQuick').innerHTML = PL.PLANT_PRESETS.map((p, i) => `<button class="chip" data-preset="${i}">${p.emoji} ${esc(p.name)}</button>`).join('') +
    '<button class="chip" data-preset="-1">＋ Eigene</button>';
  function openPlant(p, preset) {
    editingPlant = p || null;
    const src = p || preset || { emoji: '🪴', name: '', every: 7 };
    $('#plantDlgTitle').textContent = p ? 'Pflanze bearbeiten' : 'Neue Pflanze';
    $('#plantEmoji').value = src.emoji || '🪴';
    $('#plantName').value = src.name || '';
    $('#plantEvery').value = src.every || 7;
    $('#plantSpot').value = p ? p.spot || '' : '';
    $('#plantWatered').value = p ? p.watered || '' : today();
    $('#plantNote').value = p ? p.note || '' : '';
    $('#plantDelete').hidden = !p;
    plantDlg.showModal();
  }
  $('#plantQuick').addEventListener('click', (e) => {
    const c = e.target.closest('[data-preset]');
    if (c) openPlant(null, PL.PLANT_PRESETS[c.dataset.preset]);
  });
  $('#plantCancel').onclick = () => plantDlg.close();
  $('#plantDelete').onclick = () => {
    if (!confirm(`„${editingPlant.name}“ löschen?`)) return;
    st().plants = st().plants.filter((p) => p.id !== editingPlant.id);
    A.save(); plantDlg.close(); A.render();
  };
  $('#plantForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = { emoji: $('#plantEmoji').value.trim() || '🪴', name: $('#plantName').value.trim(), every: Math.max(1, parseInt($('#plantEvery').value, 10) || 7),
      spot: $('#plantSpot').value.trim(), watered: $('#plantWatered').value || null, note: $('#plantNote').value.trim() };
    if (editingPlant) Object.assign(st().plants.find((p) => p.id === editingPlant.id), data);
    else st().plants.push({ id: A.uid(), added: today(), ...data });
    A.save(); plantDlg.close();
    if (A.view !== 'plants') A.showView('plants'); else A.render();
    const s = PL.plantStatus(data, today());
    A.toast(`${data.emoji} ${data.name}: nächstes Gießen ${leftText(s.left)}`);
  });
  function water(id) {
    const p = st().plants.find((x) => x.id === id);
    if (!p) return;
    const before = { watered: p.watered, log: (p.log || []).slice() };
    PL.waterPlant(p, today());
    A.save(); A.render();
    A.toast(`${p.name} gegossen – wieder ${leftText(PL.plantStatus(p, today()).left)}`, { label: 'Rückgängig', fn: () => { Object.assign(p, before); A.save(); A.render(); } });
  }
  function plantRow(p) {
    const s = PL.plantStatus(p, today());
    const due = s.left <= 0;
    return `<div class="plant ${s.state}">
      <button class="plain grow" data-plant="${esc(p.id)}"><span class="p-emoji">${esc(p.emoji || '🪴')}</span>
        <span class="p-text"><b>${esc(p.name)}</b><span class="muted small">${p.spot ? esc(p.spot) + ' · ' : ''}alle ${p.every} Tage · ${due ? `<b class="warn-text">${s.left === 0 ? 'heute gießen' : leftText(s.left)}</b>` : 'nächstes Mal ' + leftText(s.left)}</span></span></button>
      <button class="water-btn ${due ? 'due' : ''}" data-water="${esc(p.id)}" aria-label="${esc(p.name)} gegossen">💧</button>
    </div>`;
  }
  function renderPlants() {
    if (A.view !== 'plants') return;
    const list = [...st().plants].sort((a, b) => PL.plantStatus(a, today()).left - PL.plantStatus(b, today()).left);
    const due = PL.plantsDue(st().plants, today());
    $('#plantList').innerHTML = list.length
      ? (due.length > 1 ? `<button class="btn primary wide" data-waterall>Alle ${due.length} fälligen gegossen</button>` : '') + `<div class="card list-card">${list.map(plantRow).join('')}</div>`
      : `<div class="empty"><div class="big-emoji">🪴</div><p><b>Nie wieder vertrocknete Pflanzen.</b></p><p class="muted">Lege deine Pflanzen an – die App sagt dir, wann welche Wasser braucht.</p></div>`;
  }
  $('#plantList').addEventListener('click', (e) => {
    const w = e.target.closest('[data-water]');
    if (w) { water(w.dataset.water); return; }
    if (e.target.closest('[data-waterall]')) {
      const due = PL.plantsDue(st().plants, today());
      due.forEach(({ p }) => PL.waterPlant(p, today()));
      A.save(); A.render(); A.toast(`${due.length} Pflanzen gegossen`);
      return;
    }
    const r = e.target.closest('[data-plant]');
    if (r) openPlant(st().plants.find((p) => p.id === r.dataset.plant));
  });

  // =====================================================================
  // 🤝 Verliehen & Geliehen
  // =====================================================================
  const loanDlg = $('#loanDialog');
  let editingLoan = null, loanDir = 'out', loanTab = 'out';
  function setLoanDir(d) {
    loanDir = d;
    $$('#loanDir [data-v]').forEach((b) => b.classList.toggle('active', b.dataset.v === d));
    $('#loanWhoLabel').firstChild.textContent = d === 'out' ? 'An wen?' : 'Von wem?';
  }
  $('#loanDir').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) setLoanDir(b.dataset.v); });
  function openLoan(l, dir) {
    editingLoan = l || null;
    $('#loanDlgTitle').textContent = l ? 'Eintrag bearbeiten' : 'Neuer Eintrag';
    setLoanDir(l ? l.dir : dir || loanTab);
    $('#loanWhat').value = l ? l.what : '';
    $('#loanWho').value = l ? l.who : '';
    $('#loanDate').value = l ? l.date : today();
    $('#loanDue').value = l ? l.due || '' : '';
    $('#loanDelete').hidden = !l;
    loanDlg.showModal();
  }
  $('#loanAdd').onclick = () => openLoan(null);
  $('#loanCancel').onclick = () => loanDlg.close();
  $('#loanDelete').onclick = () => { st().loans = st().loans.filter((l) => l.id !== editingLoan.id); A.save(); loanDlg.close(); A.render(); };
  $('#loanForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = { dir: loanDir, what: $('#loanWhat').value.trim(), who: $('#loanWho').value.trim(), date: $('#loanDate').value || today(), due: $('#loanDue').value || null };
    if (editingLoan) Object.assign(st().loans.find((l) => l.id === editingLoan.id), data);
    else st().loans.push({ id: A.uid(), returned: null, ...data });
    loanTab = data.dir;
    A.save(); loanDlg.close();
    if (A.view !== 'loans') A.showView('loans'); else A.render();
    A.toast(data.dir === 'out' ? `${data.what} an ${data.who} – ich behalte es im Blick` : `${data.what} von ${data.who} – nicht vergessen zurückzugeben`);
  });
  $('#loanTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-ld]'); if (b) { loanTab = b.dataset.ld; A.render(); } });
  function loanRow(l) {
    const s = PL.loanStatus(l, today());
    const info = l.returned ? `zurück am ${L.formatDate(l.returned)}`
      : `seit ${L.formatDate(l.date)}${s.since > 0 ? ` (${s.since} Tage)` : ''}${l.due ? ` · ${s.state === 'overdue' ? '<b class="warn-text">' : ''}zurück bis ${L.formatDate(l.due)}${s.state === 'overdue' ? '</b>' : ''}` : ''}`;
    return `<div class="loan ${s.state}">
      <button class="plain grow" data-loan="${esc(l.id)}"><b>${esc(l.what)}</b><span class="muted small">${l.dir === 'out' ? 'an' : 'von'} <b>${esc(l.who)}</b> · ${info}</span></button>
      ${l.returned ? '' : `<button class="btn small" data-back-loan="${esc(l.id)}">Zurück</button>`}
    </div>`;
  }
  function renderLoans() {
    if (A.view !== 'loans') return;
    $$('#loanTabs [data-ld]').forEach((b) => {
      b.classList.toggle('active', b.dataset.ld === loanTab);
      const n = st().loans.filter((l) => l.dir === b.dataset.ld && !l.returned).length;
      b.textContent = (b.dataset.ld === 'out' ? 'Verliehen' : 'Geliehen') + (n ? ` (${n})` : '');
    });
    const mine = st().loans.filter((l) => l.dir === loanTab);
    const open = mine.filter((l) => !l.returned).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
    const done = mine.filter((l) => l.returned).sort((a, b) => b.returned.localeCompare(a.returned));
    $('#loanList').innerHTML = (open.length ? `<div class="card list-card">${open.map(loanRow).join('')}</div>`
      : `<div class="empty"><div class="big-emoji">${loanTab === 'out' ? '📤' : '📥'}</div><p><b>${loanTab === 'out' ? 'Nichts verliehen.' : 'Nichts geliehen.'}</b></p><p class="muted">${loanTab === 'out' ? 'Bohrmaschine, Bücher, Geld – hier steht, wer was von dir hat.' : 'Was du dir ausgeliehen hast – damit nichts liegen bleibt.'}</p></div>`) +
      (done.length ? `<details class="done-box"><summary class="muted">Zurückgegeben (${done.length})</summary><div class="card list-card">${done.slice(0, 20).map(loanRow).join('')}</div></details>` : '');
  }
  $('#loanList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-back-loan]');
    if (b) {
      const l = st().loans.find((x) => x.id === b.dataset.backLoan);
      l.returned = today();
      A.save(); A.render();
      A.toast(`${l.what} ist zurück`, { label: 'Rückgängig', fn: () => { l.returned = null; A.save(); A.render(); } });
      return;
    }
    const r = e.target.closest('[data-loan]');
    if (r) openLoan(st().loans.find((l) => l.id === r.dataset.loan));
  });

  // =====================================================================
  // ⏳ Countdowns
  // =====================================================================
  const cdDlg = $('#cdDialog');
  const CD_EMOJIS = ['🏖️', '✈️', '🎂', '🎄', '💍', '🎉', '🎓', '👶', '🏠', '🎫', '🏃', '❤️'];
  let editingCd = null, cdEmoji = CD_EMOJIS[0];
  $('#cdEmojis').innerHTML = CD_EMOJIS.map((e) => `<button type="button" class="chip emo" data-e="${e}">${e}</button>`).join('');
  const setCdEmoji = (e) => { cdEmoji = e; $$('#cdEmojis [data-e]').forEach((b) => b.classList.toggle('active', b.dataset.e === e)); };
  $('#cdEmojis').addEventListener('click', (e) => { const b = e.target.closest('[data-e]'); if (b) setCdEmoji(b.dataset.e); });
  function openCd(c) {
    editingCd = c || null;
    $('#cdDlgTitle').textContent = c ? 'Countdown bearbeiten' : 'Neuer Countdown';
    $('#cdTitle').value = c ? c.title : '';
    $('#cdDate').value = c ? c.date : '';
    $('#cdYearly').checked = c ? !!c.yearly : false;
    $('#cdHome').checked = c ? c.home !== false : true;
    setCdEmoji(c ? c.emoji : CD_EMOJIS[0]);
    $('#cdDelete').hidden = !c;
    cdDlg.showModal();
  }
  $('#cdAdd').onclick = () => openCd(null);
  $('#cdCancel').onclick = () => cdDlg.close();
  $('#cdDelete').onclick = () => { st().countdowns = st().countdowns.filter((c) => c.id !== editingCd.id); A.save(); cdDlg.close(); A.render(); };
  $('#cdForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = { title: $('#cdTitle').value.trim(), date: $('#cdDate').value, emoji: cdEmoji, yearly: $('#cdYearly').checked, home: $('#cdHome').checked };
    if (!data.date) return;
    if (editingCd) Object.assign(st().countdowns.find((c) => c.id === editingCd.id), data);
    else st().countdowns.push({ id: A.uid(), created: today(), ...data });
    A.save(); cdDlg.close();
    if (A.view !== 'countdowns') A.showView('countdowns'); else A.render();
    A.toast(`${data.emoji} ${data.title}: ${PL.countdownInfo(data, today()).text}`);
  });
  function cdCard(c, small) {
    const i = PL.countdownInfo(c, today());
    return `<button class="${small ? 'cd-mini' : 'card cd-card'} ${i.past ? 'past' : ''}" data-cd="${esc(c.id)}">
      <span class="cd-emoji">${esc(c.emoji || '⏳')}</span>
      <span class="grow"><b>${esc(c.title)}</b><span class="muted small">${L.formatDate(i.date)}${c.yearly ? ' · jährlich' : ''}</span>
        ${!small && i.progress != null && !i.past ? `<span class="meter"><i style="width:${i.progress}%"></i></span>` : ''}</span>
      <span class="cd-days">${i.past ? '✓' : i.days === 0 ? '🎉' : `<b>${i.days}</b><small>${i.days === 1 ? 'Tag' : 'Tage'}</small>`}</span>
    </button>`;
  }
  function renderCountdowns() {
    if (A.view !== 'countdowns') return;
    const up = PL.upcomingCountdowns(st().countdowns, today());
    const past = st().countdowns.filter((c) => PL.countdownInfo(c, today()).past);
    $('#cdList').innerHTML = up.length || past.length
      ? up.map((x) => cdCard(x.c)).join('') + (past.length ? `<details class="done-box"><summary class="muted">Vorbei (${past.length})</summary>${past.map((c) => cdCard(c)).join('')}</details>` : '')
      : `<div class="empty"><div class="big-emoji">⏳</div><p><b>Vorfreude ist die schönste Freude.</b></p><p class="muted">Urlaub, Geburtstag, Konzert, Hochzeit – zähle die Tage bis zu deinem nächsten Highlight.</p></div>`;
  }
  $('#cdList').addEventListener('click', (e) => { const b = e.target.closest('[data-cd]'); if (b) openCd(st().countdowns.find((c) => c.id === b.dataset.cd)); });

  // =====================================================================
  // 🎯 Fokus-Timer
  // =====================================================================
  const RING = 2 * Math.PI * 54;
  const fx = { preset: st().settings.focusPreset || 'klassisch', phase: 'focus', done: 0, endAt: null, remaining: null, timer: null, wake: null };
  const phaseMin = (ph) => { const p = PL.FOCUS_PRESETS[fx.preset]; return ph === 'focus' ? p.focus : ph === 'short' ? p.short : p.long; };
  const PHASE_LABEL = { focus: 'Fokus', short: 'Kurze Pause', long: 'Lange Pause' };
  fx.remaining = phaseMin('focus') * 60;
  $('#focusPreset').innerHTML = Object.entries(PL.FOCUS_PRESETS).map(([k, p]) => `<button type="button" data-fp="${k}">${p.label}</button>`).join('');
  $('#focusPreset').addEventListener('click', (e) => {
    const b = e.target.closest('[data-fp]');
    if (!b || fx.endAt) return;
    fx.preset = b.dataset.fp; st().settings.focusPreset = fx.preset; A.save();
    fx.phase = 'focus'; fx.remaining = phaseMin('focus') * 60;
    drawFocus();
  });
  const secsLeft = () => (fx.endAt ? Math.max(0, Math.round((fx.endAt - Date.now()) / 1000)) : fx.remaining);
  function drawFocus() {
    const left = secsLeft(), total = phaseMin(fx.phase) * 60;
    $('#focusTime').textContent = PL.fmtClock(left);
    $('#focusPhase').textContent = PHASE_LABEL[fx.phase];
    $('#focusCount').textContent = fx.done ? `${fx.done} Einheit${fx.done > 1 ? 'en' : ''} geschafft` : '';
    $('#focusArc').style.strokeDasharray = RING;
    $('#focusArc').style.strokeDashoffset = RING * (1 - left / total);
    $('#focusRing').className = 'focus-ring ' + fx.phase + (fx.endAt ? ' running' : '');
    $('#focusStart').textContent = fx.endAt ? 'Pause' : left < total ? '▶ Weiter' : '▶ Start';
    $$('#focusPreset [data-fp]').forEach((b) => { b.classList.toggle('active', b.dataset.fp === fx.preset); b.disabled = !!fx.endAt; });
    if (fx.endAt) document.title = `${PL.fmtClock(left)} · ${fx.phase === 'focus' ? 'Fokus' : 'Pause'}`;
  }
  async function wake(on) {
    try {
      if (on && navigator.wakeLock && !fx.wake) fx.wake = await navigator.wakeLock.request('screen');
      if (!on && fx.wake) { fx.wake.release().catch(() => {}); fx.wake = null; }
    } catch (e) { /* nicht unterstützt */ }
  }
  function tick() {
    if (secsLeft() > 0) { drawFocus(); return; }
    // Phase vorbei
    const was = fx.phase;
    if (was === 'focus') {
      st().focusLog.push({ date: today(), minutes: phaseMin('focus'), task: $('#focusTask').value.trim() || null });
      if (st().focusLog.length > 500) st().focusLog.splice(0, st().focusLog.length - 500);
      A.save();
    }
    const n = PL.nextFocusPhase(was, fx.done);
    fx.phase = n.phase; fx.done = n.done;
    fx.endAt = Date.now() + phaseMin(fx.phase) * 60000;
    A.beep(was === 'focus' ? 3 : 2, was === 'focus' ? 660 : 880);
    const msg = was === 'focus' ? `Geschafft! Jetzt ${phaseMin(fx.phase)} Min Pause.` : 'Pause vorbei – weiter geht’s!';
    A.toast((was === 'focus' ? '🎉 ' : '🎯 ') + msg);
    A.notify('Fokus-Timer', msg, 'focus' + Date.now());
    drawFocus(); renderFocusStats();
  }
  function startFocus() {
    if (fx.endAt) { // Pause
      fx.remaining = secsLeft(); fx.endAt = null;
      clearInterval(fx.timer); wake(false); document.title = 'Alltagsheld';
    } else {
      fx.endAt = Date.now() + secsLeft() * 1000;
      fx.timer = setInterval(tick, 500);
      wake(true);
    }
    drawFocus();
  }
  function resetFocus() {
    clearInterval(fx.timer); fx.endAt = null; fx.phase = 'focus'; fx.done = 0; fx.remaining = phaseMin('focus') * 60;
    wake(false); document.title = 'Alltagsheld'; drawFocus();
  }
  $('#focusStart').onclick = startFocus;
  $('#focusReset').onclick = resetFocus;
  $('#focusSkip').onclick = () => {
    const running = !!fx.endAt;
    fx.phase = PL.nextFocusPhase(fx.phase, fx.done).phase; // Überspringen zählt nicht als geschafft
    fx.remaining = phaseMin(fx.phase) * 60;
    fx.endAt = running ? Date.now() + fx.remaining * 1000 : null;
    drawFocus();
  };
  document.addEventListener('visibilitychange', () => { if (!document.hidden && fx.endAt) { wake(true); tick(); } });
  function renderFocusStats() {
    const log = st().focusLog;
    const t = today();
    const min = PL.focusMinutesOn(log, t);
    const sessions = log.filter((s) => s.date === t);
    const days = [];
    for (let i = 6; i >= 0; i--) { const d = PL.addDays(t, -i); days.push({ d, m: PL.focusMinutesOn(log, d) }); }
    const max = Math.max(25, ...days.map((x) => x.m));
    const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    $('#focusStats').innerHTML = `<div class="statgrid three"><div><b>${min}</b><span>Minuten heute</span></div><div><b>${sessions.length}</b><span>Einheiten</span></div><div><b>${days.reduce((a, x) => a + x.m, 0)}</b><span>Min. in 7 Tagen</span></div></div>
      <div class="mini-bars">${days.map((x) => `<div><i style="height:${Math.round((x.m / max) * 100)}%"></i><span>${WD[new Date(x.d + 'T12:00').getDay()]}</span></div>`).join('')}</div>
      ${sessions.filter((s) => s.task).length ? `<p class="muted small">Heute: ${esc([...new Set(sessions.filter((s) => s.task).map((s) => s.task))].join(', '))}</p>` : ''}`;
  }
  function renderFocus() {
    if (A.view !== 'focus') return;
    drawFocus(); renderFocusStats();
  }

  // =====================================================================
  // 🆘 Notfallpass
  // =====================================================================
  const EM_FIELDS = { emName: 'name', emBirth: 'birth', emBlood: 'blood', emAllergies: 'allergies', emConditions: 'conditions', emInsurance: 'insurance', emC1: 'c1', emC2: 'c2', emNote: 'note' };
  $('#emBlood').innerHTML = PL.BLOOD_TYPES.map((b) => `<option value="${b}">${b || 'unbekannt'}</option>`).join('');
  function contactHtml(c) {
    if (!c) return '';
    const m = c.match(/^(.*?)[\s–\-:,]*([+\d][\d\s/()-]{4,})$/);
    const name = m ? m[1].trim() : c, phone = m ? m[2].trim() : '';
    return phone ? `<a class="em-call" href="${PL.telHref(phone)}"><span><b>${esc(name || phone)}</b><span class="small">${esc(phone)}</span></span></a>` : `<div class="em-call"><b>${esc(c)}</b></div>`;
  }
  function renderEmergency() {
    if (A.view !== 'emergency') return;
    const e = st().settings.emergency;
    const meds = st().meds.map((m) => m.name).filter(Boolean);
    const filled = Object.values(EM_FIELDS).some((k) => e[k]);
    if (!filled) {
      $('#emView').innerHTML = `<div class="empty"><div class="big-emoji">🆘</div><p><b>Wichtige Infos für den Notfall.</b></p><p class="muted">Blutgruppe, Allergien, Medikamente und Notfallkontakte – auf einen Blick für dich und für Helfer.</p>
        <button class="btn primary" data-emedit>Notfallpass ausfüllen</button></div>`;
      return;
    }
    const age = PL.ageFrom(e.birth, today());
    const line = (label, val, cls = '') => (val ? `<div class="em-line ${cls}"><span>${label}</span><b>${esc(val)}</b></div>` : '');
    $('#emView').innerHTML = `<div class="card em-card">
        <div class="em-head"><div><div class="em-name">${esc(e.name || 'Notfallpass')}</div>${e.birth ? `<div class="small">geb. ${L.formatDate(e.birth)}${age != null ? ` · ${age} Jahre` : ''}</div>` : ''}</div>
          ${e.blood ? `<div class="em-blood"><small>Blutgruppe</small>${esc(e.blood)}</div>` : ''}</div>
        ${line('Allergien', e.allergies, 'alert')}
        ${line('Vorerkrankungen', e.conditions)}
        ${line('Medikamente', meds.join(', '))}
        ${line('Krankenkasse', e.insurance)}
        ${e.donor ? '<div class="em-line"><span>Organspende</span><b>Ausweis vorhanden</b></div>' : ''}
        ${line('Sonstiges', e.note)}
      </div>
      ${e.c1 || e.c2 ? `<h3 class="sec-title">Im Notfall anrufen</h3>${contactHtml(e.c1)}${contactHtml(e.c2)}` : ''}
      <a class="em-call em-112" href="tel:112"><span><b>Notruf 112</b><span class="small">Rettungsdienst & Feuerwehr</span></span></a>
      <a class="em-call" href="tel:116117"><span><b>116 117</b><span class="small">Ärztlicher Bereitschaftsdienst</span></span></a>
      <div class="row"><button class="btn wide" data-emedit>Bearbeiten</button></div>
      <p class="muted small">Tipp: Mach einen Screenshot und speichere ihn als Sperrbildschirm – so sehen Helfer die Infos auch ohne Entsperren.</p>`;
  }
  function openEmForm() {
    const e = st().settings.emergency;
    for (const [id, k] of Object.entries(EM_FIELDS)) $('#' + id).value = e[k] || '';
    $('#emDonor').checked = !!e.donor;
    $('#emView').hidden = true; $('#emForm').hidden = false;
  }
  $('#emView').addEventListener('click', (ev) => { if (ev.target.closest('[data-emedit]')) openEmForm(); });
  $('#emCancel').onclick = () => { $('#emForm').hidden = true; $('#emView').hidden = false; };
  $('#emForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const e = {};
    for (const [id, k] of Object.entries(EM_FIELDS)) e[k] = $('#' + id).value.trim();
    e.donor = $('#emDonor').checked;
    st().settings.emergency = e;
    A.save();
    $('#emForm').hidden = true; $('#emView').hidden = false;
    A.render(); A.toast('Notfallpass gespeichert');
  });

  // =====================================================================
  // Startseite, Mehr, Kalender, Suche, Erinnerungen
  // =====================================================================
  if (A.homeCards) Object.assign(A.homeCards, { plants: 'Pflanzen', countdowns: 'Countdowns', loans: 'Verliehen', thought: 'Gedanke des Tages' });
  if (A.homeOrder) Object.assign(A.homeOrder, { thought: [2, 'top'], countdowns: [16, 'today'], plants: [17, 'today'], loans: [18, 'today'] });
  function renderHomePlus() {
    if (A.view !== 'home') return;
    const t = today();
    const parts = [];
    const cds = PL.upcomingCountdowns(st().countdowns.filter((c) => c.home !== false), t).slice(0, 2);
    if (cds.length) parts.push(`<div class="card home-card" data-card="countdowns"><button class="plain" data-goto="countdowns"><div class="home-title">Vorfreude</div></button>${cds.map((x) => cdCard(x.c, true)).join('')}</div>`);
    const due = PL.plantsDue(st().plants, t);
    if (due.length) {
      parts.push(`<div class="card home-card" data-card="plants"><button class="plain" data-goto="plants"><div class="home-title">Gießen <span class="muted small">${due.length}</span></div></button>
        <div class="habit-quick">${due.slice(0, 6).map(({ p, s }) => `<button class="hq ${s.left < 0 ? 'late' : ''}" data-water="${esc(p.id)}">${esc(p.emoji || '🪴')} <b>${esc(p.name)}</b><span>${s.left < 0 ? leftText(s.left) : 'heute'} · 💧 tippen</span></button>`).join('')}</div></div>`);
    }
    const loans = st().loans.filter((l) => ['overdue', 'soon'].includes(PL.loanStatus(l, t).state));
    if (loans.length) {
      parts.push(`<button class="card home-card" data-card="loans" data-goto="loans"><div class="home-title">Zurückgeben</div>
        ${loans.slice(0, 3).map((l) => `<div class="home-line ${PL.loanStatus(l, t).state === 'overdue' ? 'warn-text' : ''}">${l.dir === 'out' ? '📤' : '📥'} <b>${esc(l.what)}</b> ${l.dir === 'out' ? 'von' : 'an'} ${esc(l.who)} – bis ${L.formatDate(l.due)}</div>`).join('')}</button>`);
    }
    parts.push(`<div class="card home-card thought" data-card="thought"><div class="thought-text"><i class="ic ic-idea"></i><q>${esc(PL.thoughtOfDay(t))}</q></div></div>`);
    $('#homePlus').innerHTML = parts.join('');
  }
  $('#homePlus').addEventListener('click', (e) => {
    const w = e.target.closest('[data-water]');
    if (w) { water(w.dataset.water); return; }
    const c = e.target.closest('[data-cd]');
    if (c) { A.showView('countdowns'); openCd(st().countdowns.find((x) => x.id === c.dataset.cd)); }
  });

  function renderHubPlus() {
    const t = today();
    const due = PL.plantsDue(st().plants, t).length;
    $('#hubPlants').textContent = due ? `${due} heute gießen` : st().plants.length ? `${st().plants.length} Pflanzen` : 'Gießplan';
    const open = st().loans.filter((l) => !l.returned).length;
    $('#hubLoans').textContent = open ? `${open} offen` : 'Wer hat was?';
    const next = PL.upcomingCountdowns(st().countdowns, t)[0];
    $('#hubCountdowns').textContent = next ? `${next.c.title}: ${next.i.days} T.` : 'Tage zählen';
    const fm = PL.focusMinutesOn(st().focusLog, t);
    $('#hubFocus').textContent = fx.endAt ? `läuft · ${PL.fmtClock(secsLeft())}` : fm ? `${fm} Min heute` : 'Pomodoro';
    $('#hubEmergency').textContent = st().settings.emergency.name ? 'ausgefüllt ✓' : 'Wichtige Infos';
  }

  A.calendarSources.push((from, to) => {
    const out = [];
    for (const c of st().countdowns) {
      const i = PL.countdownInfo(c, from);
      if (i.date >= from && i.date <= to) out.push({ date: i.date, kind: 'task', text: c.title, emoji: c.emoji || '⏳', go: 'countdowns' });
    }
    for (const l of st().loans) if (!l.returned && l.due && l.due >= from && l.due <= to) out.push({ date: l.due, kind: 'task', text: `${l.what} ${l.dir === 'out' ? 'zurückbekommen' : 'zurückgeben'}`, emoji: '🤝', go: 'loans' });
    return out;
  });
  if (A.searchSources) A.searchSources.push((has) => [
    ...st().plants.filter((p) => has(p.name, p.spot, p.note)).map((p) => ({ kind: 'go', view: 'plants', icon: p.emoji || '🪴', text: p.name, sub: 'Pflanze' })),
    ...st().loans.filter((l) => has(l.what, l.who)).map((l) => ({ kind: 'go', view: 'loans', icon: '🤝', text: l.what, sub: `${l.dir === 'out' ? 'verliehen an' : 'geliehen von'} ${l.who}` })),
    ...st().countdowns.filter((c) => has(c.title)).map((c) => ({ kind: 'go', view: 'countdowns', icon: c.emoji || '⏳', text: c.title, sub: PL.countdownInfo(c, today()).text })),
  ]);

  async function checkPlusReminders() {
    const t = today();
    let changed = false;
    const due = PL.plantsDue(st().plants, t);
    const key = `plants@${t}`;
    if (due.length && !st().notified.includes(key)) {
      st().notified.push(key); changed = true;
      await A.notify('Gießen', `${due.map((x) => x.p.name).slice(0, 4).join(', ')} ${due.length > 1 ? 'brauchen' : 'braucht'} Wasser`, key);
    }
    for (const l of st().loans) {
      if (PL.loanStatus(l, t).state !== 'overdue') continue;
      const k = `loan:${l.id}@${l.due}`;
      if (st().notified.includes(k)) continue;
      st().notified.push(k); changed = true;
      await A.notify('Zurückgeben', l.dir === 'out' ? `${l.who} hat noch: ${l.what}` : `${l.what} an ${l.who} zurückgeben`, k);
    }
    if (changed) A.save();
  }

  A.actions.plant = () => { A.showView('plants'); openPlant(null); };
  A.actions.loan = () => { A.showView('loans'); openLoan(null, 'out'); };
  A.actions.countdown = () => { A.showView('countdowns'); openCd(null); };
  A.actions.focus = () => A.showView('focus');

  A.onRender(personalizeHello);
  A.onRender(renderHomePlus);
  A.onRender(renderPlants);
  A.onRender(renderLoans);
  A.onRender(renderCountdowns);
  A.onRender(renderFocus);
  A.onRender(renderEmergency);
  A.onRender(renderHubPlus);
  A.onRender(applyDesign);
  if (A.applyHomeHidden) A.onRender(A.applyHomeHidden); // neue Karten einsortieren
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkPlusReminders(); });
  A.render();
  checkPlusReminders();
})();
