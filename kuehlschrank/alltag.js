/* Alltagshelfer: Startseite „Heute“, Sport (Workouts für zuhause), Kalender, Ausgaben.
   Baut auf der Schnittstelle window.App aus app.js auf. */
(() => {
  'use strict';
  const A = window.App;
  const L = A.L;
  const S = window.FridgeSport;
  const P = window.FridgePlanner;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const esc = A.esc;
  const st = () => A.state;
  const euro = (v) => L.formatEuro(v);
  const nowIso = () => A.today();
  const ym = (iso) => iso.slice(0, 7);

  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // =====================================================================
  // Heute
  // =====================================================================
  function renderHome() {
    if (A.view !== 'home') return;
    const h = new Date().getHours();
    $('#homeHello').textContent = h < 11 ? 'Guten Morgen!' : h < 18 ? 'Hallo!' : 'Guten Abend!';
    $('#homeDate').textContent = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
    const today = nowIso(), tomorrow = P.addDays(today, 1);
    const cards = [];

    // Termine
    const occ = P.occurrences(A.allEvents ? A.allEvents() : st().events, today, tomorrow);
    if (occ.length) cards.push(`<button class="card home-card" data-goto="calendar">
      <div class="home-title">Termine</div>
      ${occ.length ? occ.slice(0, 4).map((o) => `<div class="home-line"><b>${o.date === today ? 'Heute' : 'Morgen'}${o.event.time ? ' ' + o.event.time : ''}</b> ${eventEmoji(o.event)} ${esc(eventTitle(o.event, o.date))}</div>`).join('')
        : '<div class="muted">Heute und morgen keine Termine.</div>'}
    </button>`);

    // Küche
    const items = st().items.filter((i) => i.location !== 'haushalt');
    const urgent = A.sortedItems().filter((i) => i.location !== 'haushalt' && i.expiry && L.daysUntil(i.expiry) <= 2);
    const meal = A.findRecipe(st().plan[today]);
    if (items.length || meal) cards.push(`<button class="card home-card" data-goto="stock">
      <div class="home-title">Küche</div>
      ${urgent.length ? `<div class="home-line warn-text"><b>${urgent.length} Produkt${urgent.length > 1 ? 'e' : ''} bald verbrauchen:</b> ${esc(urgent.slice(0, 3).map((i) => i.name).join(', '))}${urgent.length > 3 ? ' …' : ''}</div>`
        : `<div class="home-line">${items.length ? `${items.length} Produkte, nichts läuft in den nächsten 2 Tagen ab.` : 'Noch keine Produkte erfasst.'}</div>`}
      ${meal ? `<div class="home-line">Heute geplant: <b>${esc(meal.name)}</b></div>` : ''}
    </button>`);

    // Training
    const wk = S.thisWeek(st().workouts);
    const goal = st().settings.weeklyGoal;
    const streak = S.streak(st().workouts);
    const trainedToday = st().workouts.some((w) => w.date === today);
    cards.push(`<div class="card home-card">
      <button class="plain" data-goto="sport"><div class="home-title">Sport</div>
        <div class="home-line">Diese Woche <b>${wk.count} von ${goal}</b> Trainings${streak > 1 ? ` · 🔥 ${streak} Tage in Folge` : ''}${trainedToday ? ' · heute schon erledigt 💪' : ''}</div>
        <div class="meter"><i style="width:${Math.min(100, Math.round((wk.count / goal) * 100))}%"></i></div></button>
      <button class="btn small primary" id="homeQuickWorkout">▶ ${st().settings.woMinutes}-Min-Training starten</button>
    </div>`);

    // Ausgaben
    const month = ym(today);
    const sum = P.summarize(P.monthEntries(st().expenses, month).filter((e) => !P.isIncome(e)));
    const b = P.budgetStatus(sum.total, st().settings.budget, month);
    if (sum.total > 0 || b) cards.push(`<button class="card home-card" data-goto="expenses">
      <div class="home-title">Ausgaben ${P.monthLabel(month).split(' ')[0]}</div>
      <div class="home-line"><b>${euro(sum.total)}</b>${b ? ` von ${euro(b.budget)} · ${b.over ? `<span class="warn-text">${euro(-b.left)} drüber</span>` : `noch ${euro(b.left)}${b.perDay != null ? ` (${euro(b.perDay)}/Tag)` : ''}`}` : ''}</div>
      ${b ? `<div class="meter ${b.over ? 'over' : ''}"><i style="width:${b.pct}%"></i></div>` : ''}
    </button>`);

    // Einkauf
    const open = st().shopping.filter((i) => !i.done);
    if (open.length) {
      cards.push(`<button class="card home-card" data-goto="shopping">
        <div class="home-title">Einkaufsliste</div>
        <div class="home-line">${open.length} offen: ${esc(open.slice(0, 5).map((i) => i.name).join(', '))}${open.length > 5 ? ' …' : ''}</div>
      </button>`);
    }
    $('#homeCards').innerHTML = cards.join('');
    $('#homeQuickWorkout').onclick = () => { const w = buildWorkout(); startWorkout(w); };
  }

  function renderHub() {
    const today = nowIso();
    const next = P.occurrences(A.allEvents ? A.allEvents() : st().events, today, P.addDays(today, 60))[0];
    $('#hubCal').textContent = next ? `${next.date === today ? 'heute' : L.formatDate(next.date).slice(0, 6)} ${eventTitle(next.event, next.date)}` : 'keine Termine';
    $('#hubExp').textContent = euro(P.summarize(P.monthEntries(st().expenses, ym(today)).filter((e) => !P.isIncome(e))).total) + ' diesen Monat';
    const wk = S.thisWeek(st().workouts);
    $('#hubSport').textContent = `${wk.count}/${st().settings.weeklyGoal} diese Woche`;
    $('#hubRecipes').textContent = st().plan[today] ? 'heute: ' + (A.findRecipe(st().plan[today]) || {}).name : `${window.FridgeRecipes.length + st().customRecipes.length} Rezepte`;
  }

  // =====================================================================
  // Sport
  // =====================================================================
  let preview = null;
  let seed = Date.now() % 100000;

  $('#woFocus').innerHTML = Object.entries(S.FOCUS).map(([k, f]) => `<button class="chip" data-v="${k}">${f.label}</button>`).join('');
  $('#woLevel').innerHTML = Object.entries(S.LEVELS).map(([k, l]) => `<button class="chip" data-v="${k}">${l.label} <span class="muted small">${l.work}/${l.rest} s</span></button>`).join('');
  $('#woGoal').innerHTML = [1, 2, 3, 4, 5, 6, 7].map((n) => `<button class="chip" data-v="${n}">${n}× pro Woche</button>`).join('');

  function chipGroup(sel, key, cast = (v) => v) {
    $(sel).addEventListener('click', (e) => {
      const c = e.target.closest('[data-v]');
      if (!c) return;
      st().settings[key] = cast(c.dataset.v);
      A.save(); renderSport();
    });
  }
  chipGroup('#woMinutes', 'woMinutes', Number);
  chipGroup('#woFocus', 'woFocus');
  chipGroup('#woLevel', 'woLevel', Number);
  chipGroup('#woGoal', 'weeklyGoal', Number);
  $('#woQuiet').addEventListener('change', () => { st().settings.woQuiet = $('#woQuiet').checked; A.save(); });
  $('#woVoice').addEventListener('change', () => { st().settings.voice = $('#woVoice').checked; A.save(); });

  function buildWorkout() {
    const s = st().settings;
    seed++;
    return S.generateWorkout({ minutes: s.woMinutes, focus: s.woFocus, level: s.woLevel, quiet: s.woQuiet, seed });
  }

  $('#btnWoGenerate').onclick = () => { preview = buildWorkout(); renderPreview(); $('#woPreview').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  $('#btnWoSeven').onclick = () => { preview = S.sevenMinute(st().settings.woQuiet); renderPreview(); $('#woPreview').scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  function renderPreview() {
    if (!preview) { $('#woPreview').innerHTML = ''; return; }
    const main = [...new Set(preview.steps.filter((x) => x.phase === 'work').map((x) => x.id))];
    const warm = preview.steps.filter((x) => x.phase === 'warmup').map((x) => x.id);
    const cool = preview.steps.filter((x) => x.phase === 'cooldown').map((x) => x.id);
    const line = (id) => { const e = S.byId(id); return `<li>${e.emoji} ${esc(e.name)}</li>`; };
    const lvl = S.LEVELS[preview.level] || S.LEVELS[2];
    $('#woPreview').innerHTML = `<div class="card wo-card">
      <h2>${esc(preview.name)}</h2>
      <div class="muted small">${Math.round(preview.totalSeconds / 60)} Min · ${preview.exercises} Übungsintervalle${preview.rounds ? ` · ${preview.rounds} Runden` : ''} · ${lvl.label}${preview.quiet ? ' · 🤫 leise' : ''}</div>
      ${warm.length ? `<h3 class="section">Aufwärmen</h3><ul>${warm.map(line).join('')}</ul>` : ''}
      ${main.length ? `<h3 class="section">${preview.rounds > 1 ? `Zirkel (${preview.rounds}×)` : 'Übungen'}</h3><ul>${main.map(line).join('')}</ul>` : ''}
      ${cool.length ? `<h3 class="section">${main.length ? 'Abkühlen & Dehnen' : 'Dehnen'}</h3><ul>${cool.map(line).join('')}</ul>` : ''}
      <div class="row tight">
        <button class="btn primary" id="woStart">▶ Starten</button>
        ${preview.name !== '7-Minuten-Workout' ? '<button class="btn" id="woReroll">Andere Übungen</button>' : ''}
      </div>
    </div>`;
    $('#woStart').onclick = () => startWorkout(preview);
    if ($('#woReroll')) $('#woReroll').onclick = () => { preview = buildWorkout(); renderPreview(); };
  }

  function renderSport() {
    if (A.view !== 'sport') return;
    const s = st().settings;
    const wk = S.thisWeek(st().workouts);
    $('#sportStats').innerHTML = `
      <div><b>${S.streak(st().workouts)}</b><span>Tage in Folge</span></div>
      <div><b>${wk.count}/${s.weeklyGoal}</b><span>diese Woche</span></div>
      <div><b>${wk.minutes}</b><span>Minuten (Woche)</span></div>
      <div><b>${st().workouts.length}</b><span>Trainings gesamt</span></div>`;
    $$('#woMinutes .chip').forEach((c) => c.classList.toggle('active', Number(c.dataset.v) === s.woMinutes));
    $$('#woFocus .chip').forEach((c) => c.classList.toggle('active', c.dataset.v === s.woFocus));
    $$('#woLevel .chip').forEach((c) => c.classList.toggle('active', Number(c.dataset.v) === s.woLevel));
    $$('#woGoal .chip').forEach((c) => c.classList.toggle('active', Number(c.dataset.v) === s.weeklyGoal));
    $('#woQuiet').checked = !!s.woQuiet;
    $('#woVoice').checked = s.voice !== false;
    renderExercises();
    const hist = [...st().workouts].reverse().slice(0, 10);
    $('#woHistoryCard').hidden = !hist.length;
    $('#woHistory').innerHTML = hist.map((w) => `<div class="hist-line"><b>${L.formatDate(w.date).slice(0, 6)}</b> ${esc(w.name)} <span class="muted small">· ${Math.round(w.seconds / 60)} Min${w.partial ? ' (abgebrochen)' : ''}</span></div>`).join('');
  }

  function renderExercises() {
    const q = L.norm($('#exSearch').value.trim());
    const groups = [['Aufwärmen', (e) => e.kind === 'warmup'], ...Object.entries(S.GROUPS).map(([k, label]) => [label, (e) => e.group === k]), ['Dehnen', (e) => e.kind === 'stretch']];
    $('#exList').innerHTML = groups.map(([label, fn]) => {
      const list = S.EXERCISES.filter(fn).filter((e) => !q || L.norm(e.name + ' ' + e.cues).includes(q));
      if (!list.length) return '';
      return `<h3 class="section">${label}</h3>` + list.map((e) => `<details class="ex">
        <summary>${e.emoji} ${esc(e.name)} <span class="muted small">${'●'.repeat(e.level)}${e.quiet ? '' : ' · springt'}</span></summary>
        <p class="small">${esc(e.cues)}</p></details>`).join('');
    }).join('') || '<p class="muted small">Keine Übung gefunden.</p>';
  }
  $('#exSearch').addEventListener('input', renderExercises);

  // ---------- Trainingsmodus ----------
  const woDlg = $('#workoutDialog');
  let run = null; // { w, idx, stepEnd, remaining, paused, done, startedAt }
  let woTick = null;
  let woWake = null;

  function speak(text) {
    if (st().settings.voice === false || !('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'de-DE';
      speechSynthesis.speak(u);
    } catch (e) { /* keine Sprachausgabe */ }
  }

  async function startWorkout(w) {
    run = { w, idx: 0, remaining: w.steps[0].seconds, stepEnd: Date.now() + w.steps[0].seconds * 1000, paused: false, done: 0, lastBeep: null };
    woDlg.showModal();
    announce();
    renderRun();
    clearInterval(woTick);
    woTick = setInterval(tick, 250);
    try { if (navigator.wakeLock) woWake = await navigator.wakeLock.request('screen'); } catch (e) { /* egal */ }
  }

  function stepName(step) {
    return step.id === 'pause' ? 'Pause' : S.byId(step.id).name;
  }
  function announce() {
    const step = run.w.steps[run.idx];
    const next = run.w.steps[run.idx + 1];
    if (step.phase === 'rest') speak(`Pause. Als Nächstes: ${next ? stepName(next) : 'geschafft'}`);
    else speak(`${stepName(step)}, ${step.seconds} Sekunden`);
    A.beep(step.phase === 'rest' ? 1 : 2, step.phase === 'rest' ? 520 : 880, 0.15);
  }

  function tick() {
    if (!run || run.paused) return;
    run.remaining = Math.max(0, (run.stepEnd - Date.now()) / 1000);
    const sec = Math.ceil(run.remaining);
    if (sec <= 3 && sec > 0 && run.lastBeep !== run.idx + ':' + sec) { run.lastBeep = run.idx + ':' + sec; A.beep(1, 1200, 0.08); }
    if (run.remaining <= 0) goTo(run.idx + 1, true);
    else renderRun();
  }

  function goTo(idx, completed) {
    if (completed) run.done += run.w.steps[run.idx].seconds;
    if (idx >= run.w.steps.length) { finishWorkout(false); return; }
    run.idx = Math.max(0, idx);
    run.remaining = run.w.steps[run.idx].seconds;
    run.stepEnd = Date.now() + run.remaining * 1000;
    if (navigator.vibrate) navigator.vibrate(120);
    announce();
    renderRun();
  }

  function renderRun() {
    const step = run.w.steps[run.idx];
    const next = run.w.steps.slice(run.idx + 1).find((x) => x.phase !== 'rest');
    const e = step.id === 'pause' ? null : S.byId(step.id);
    const total = run.w.totalSeconds;
    const elapsed = run.w.steps.slice(0, run.idx).reduce((s, x) => s + x.seconds, 0) + (step.seconds - run.remaining);
    const workIdx = run.w.steps.slice(0, run.idx + 1).filter((x) => x.phase === 'work').length;
    $('#woTitle').textContent = run.w.name;
    $('#woCount').textContent = `${Math.floor(elapsed / 60)}:${String(Math.floor(elapsed % 60)).padStart(2, '0')} von ${Math.round(total / 60)} Min`;
    $('#woBar').style.width = Math.min(100, (elapsed / total) * 100) + '%';
    $('#woPhase').textContent = { warmup: 'Aufwärmen', work: `Übung ${workIdx} von ${run.w.exercises}${step.round ? ' · Runde ' + step.round : ''}`, rest: 'Pause', cooldown: 'Dehnen' }[step.phase];
    $('#woEmoji').textContent = e ? e.emoji : '⏸️';
    $('#woName').textContent = e ? e.name : 'Durchatmen';
    $('#woTime').textContent = Math.ceil(run.remaining);
    $('#woCues').textContent = e ? e.cues : (run.w.steps[run.idx + 1] ? 'Gleich: ' + (S.byId(run.w.steps[run.idx + 1].id) || {}).cues : '');
    $('#woNext').textContent = next ? `Danach: ${stepName(next)}` : 'Gleich geschafft!';
    $('#woPause').textContent = run.paused ? '▶ Weiter' : 'Pause';
    woDlg.classList.toggle('resting', step.phase === 'rest');
  }

  $('#woPause').onclick = () => {
    if (!run) return;
    run.paused = !run.paused;
    if (!run.paused) run.stepEnd = Date.now() + run.remaining * 1000;
    renderRun();
  };
  $('#woSkip').onclick = () => run && goTo(run.idx + 1, false);
  $('#woBack').onclick = () => run && goTo(run.idx - 1, false);
  $('#woClose').onclick = () => {
    if (!run) { woDlg.close(); return; }
    if (run.done >= 60 && confirm('Training beenden? Der bisherige Teil wird gespeichert.')) finishWorkout(true);
    else if (run.done < 60) stopRun();
  };
  woDlg.addEventListener('cancel', (e) => { e.preventDefault(); $('#woClose').click(); });

  function stopRun() {
    clearInterval(woTick);
    woTick = null;
    run = null;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    if (woWake) { woWake.release().catch(() => {}); woWake = null; }
    if (woDlg.open) woDlg.close();
  }

  function finishWorkout(partial) {
    const w = run.w;
    const seconds = Math.round(partial ? run.done : w.totalSeconds);
    st().workouts.push({ id: A.uid(), date: nowIso(), name: w.name, seconds, focus: w.focus, partial: partial || undefined });
    A.save();
    stopRun();
    if (!partial) { A.beep(3, 990, 0.2); speak('Geschafft! Super gemacht.'); }
    const streak = S.streak(st().workouts);
    A.toast(partial ? `Gespeichert: ${Math.round(seconds / 60)} Min Training` : `Geschafft! ${Math.round(seconds / 60)} Min${streak > 1 ? ` · 🔥 ${streak} Tage in Folge` : ''}`);
    A.render();
  }

  // =====================================================================
  // Kalender
  // =====================================================================
  let editingEvent = null;
  let evType = 'termin';

  const eventEmoji = (ev) => (P.EVENT_TYPES[ev.type] || P.EVENT_TYPES.termin).emoji;
  function eventTitle(ev, day) {
    const age = ev.type === 'geburtstag' ? P.ageOn(ev, day) : null;
    return ev.title + (age ? ` (${age})` : '');
  }

  /** Automatische Einträge: Ablaufdaten, Essensplan, Trainings. */
  function autoEntries(from, to) {
    const out = [];
    for (const i of st().items) {
      if (i.expiry && i.expiry >= from && i.expiry <= to && i.location !== 'haushalt') out.push({ date: i.expiry, kind: 'exp', text: `${i.name} läuft ab`, emoji: A.ingEmoji(i.ingredient), go: 'stock' });
    }
    for (const [d, id] of Object.entries(st().plan)) {
      const r = A.findRecipe(id);
      if (r && d >= from && d <= to) out.push({ date: d, kind: 'meal', text: r.name, emoji: '🍽️', go: 'recipes' });
    }
    for (const w of st().workouts) if (w.date >= from && w.date <= to) out.push({ date: w.date, kind: 'sport', text: `${w.name} (${Math.round(w.seconds / 60)} Min)`, emoji: '🏋️', go: 'sport' });
    for (const src of A.calendarSources) out.push(...src(from, to));
    return out;
  }

  // Darstellung (Monat/Woche/Liste), gemeinsame Kalender und Teilen: calendar-ui.js
  A.autoEntries = autoEntries;
  A.eventEmoji = eventEmoji;
  A.eventTitle = eventTitle;

  $('#btnIcsAll').onclick = () => {
    const all = A.allEvents ? A.allEvents() : st().events;
    if (!all.length) { A.toast('Noch keine Termine'); return; }
    download('termine.ics', P.toICS(all), 'text/calendar');
    A.toast('Kalenderdatei erstellt – öffnen, um die Termine samt Erinnerung in den Handy-Kalender zu übernehmen');
  };

  // ---------- Termin-Dialog ----------
  const evDlg = $('#eventDialog');
  $('#evType').innerHTML = Object.entries(P.EVENT_TYPES).map(([k, t]) => `<button type="button" class="chip" data-v="${k}">${t.emoji} ${t.label}</button>`).join('');
  $('#evRepeat').innerHTML = Object.entries(P.REPEATS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');

  function setEvType(t, isNew) {
    evType = t;
    $$('#evType .chip').forEach((c) => c.classList.toggle('active', c.dataset.v === t));
    $('#evBirthWrap').hidden = t !== 'geburtstag';
    if (isNew) {
      if (t === 'geburtstag') { $('#evRepeat').value = 'yearly'; $('#evTime').value = ''; $('#evRemind').value = '1440'; }
      if (t === 'muell') { $('#evRepeat').value = 'biweekly'; $('#evTime').value = ''; $('#evRemind').value = '1440'; }
      if (t === 'arzt') { $('#evRemind').value = '1440'; }
    }
  }
  $('#evType').addEventListener('click', (e) => { const c = e.target.closest('[data-v]'); if (c) setEvType(c.dataset.v, !editingEvent); });

  function openEventDialog(ev, day, cal) {
    editingEvent = ev || null;
    const cals = A.calChoices ? A.calChoices() : [];
    $('#evCal').innerHTML = cals.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
    $('#evCalWrap').hidden = cals.length < 2;
    $('#evCal').value = ev ? ev.cal || 'me' : cal || (A.calDefault ? A.calDefault() : 'me');
    $('#evEnd').value = ev ? ev.endTime || '' : '';
    $('#evLocation').value = ev ? ev.location || '' : '';
    $('#evShare').hidden = !ev;
    const meta = ev && ev.cal && A.calMeta ? A.calMeta(ev) : '';
    $('#evMeta').hidden = !meta;
    $('#evMeta').textContent = meta;
    $('#eventTitle').textContent = ev ? 'Termin bearbeiten' : 'Neuer Termin';
    $('#evTitle').value = ev ? ev.title : '';
    $('#evDate').value = ev ? ev.date : (day || nowIso());
    $('#evTime').value = ev ? ev.time || '' : '';
    $('#evRepeat').value = ev ? ev.repeat || 'none' : 'none';
    $('#evRemind').value = ev && ev.remind != null ? String(ev.remind) : '';
    $('#evBirthYear').value = ev && ev.birthYear ? ev.birthYear : '';
    $('#evNote').value = ev ? ev.note || '' : '';
    setEvType(ev ? ev.type || 'termin' : 'termin', false);
    $('#evDelete').hidden = !ev;
    evDlg.showModal();
  }
  A.actions.event = () => openEventDialog(null, nowIso());
  A.openEvent = (id) => { A.showView('calendar'); openEventDialog(st().events.find((x) => x.id === id) || (A.findSharedEvent && A.findSharedEvent(id))); };
  A.openEventDialog = openEventDialog;
  A.newEvent = (type) => { openEventDialog(null, nowIso()); setEvType(type || 'termin', true); };

  // Bei Geburtstagen mit Geburtsjahr im Datum: Datum = Geburtstag, Wiederholung jährlich
  $('#eventForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const remind = $('#evRemind').value;
    const ev = {
      id: editingEvent ? editingEvent.id : A.uid(),
      title: $('#evTitle').value.trim() || P.EVENT_TYPES[evType].label,
      type: evType,
      date: $('#evDate').value,
      time: $('#evTime').value || '',
      repeat: $('#evRepeat').value,
      remind: remind === '' ? '' : Number(remind),
      note: $('#evNote').value.trim(),
      endTime: $('#evTime').value && $('#evEnd').value > $('#evTime').value ? $('#evEnd').value : '',
      location: $('#evLocation').value.trim(),
      birthYear: evType === 'geburtstag' && /^\d{4}$/.test($('#evBirthYear').value) ? Number($('#evBirthYear').value) : undefined,
    };
    if (!ev.date) return;
    const cal = $('#evCal').value || 'me';
    if (cal !== 'me' || (editingEvent && editingEvent.cal)) {
      // gemeinsamer Kalender (oder Wechsel zwischen eigenem und gemeinsamem Kalender)
      if (!A.saveSharedEvent) return;
      A.saveSharedEvent(ev, cal, editingEvent).then((ok) => { if (ok) { evDlg.close(); if (A.calFocus) A.calFocus(ev.date); A.render(); } });
      return;
    }
    st().events = st().events.filter((x) => x.id !== ev.id).concat(ev);
    st().notified = st().notified.filter((k) => !k.startsWith(ev.id + '@')); // geänderte Zeit -> neu erinnern
    A.save(); evDlg.close();
    if (A.calFocus) A.calFocus(ev.date);
    if (A.view !== 'calendar') A.showView('calendar'); else A.render();
    A.toast(`${ev.title} gespeichert${ev.remind !== '' ? ' 🔔' : ''}`);
    if (ev.remind !== '' && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  });
  $('#evCancel').onclick = () => evDlg.close();
  $('#evDelete').onclick = () => {
    if (!confirm(`„${editingEvent.title}“ löschen?${editingEvent.repeat !== 'none' ? ' (alle Wiederholungen)' : ''}`)) return;
    if (editingEvent.cal) { A.deleteSharedEvent(editingEvent).then((ok) => { if (ok) { evDlg.close(); A.render(); } }); return; }
    st().events = st().events.filter((x) => x.id !== editingEvent.id);
    A.save(); evDlg.close(); A.render();
  };
  $('#evShare').onclick = () => { if (A.shareEvent) A.shareEvent(editingEvent); };

  // ---------- Erinnerungen (solange die App offen ist) ----------
  async function checkReminders() {
    const due = P.dueReminders(A.allEvents ? A.allEvents() : st().events, Date.now(), st().notified);
    if (!due.length) return;
    for (const o of due) {
      const ev = o.event;
      const d = L.daysUntil(o.date);
      const when = d === 0 ? (ev.time ? 'heute um ' + ev.time : 'heute') : d === 1 ? 'morgen' + (ev.time ? ' um ' + ev.time : '') : L.formatDate(o.date);
      const text = `${eventEmoji(ev)} ${eventTitle(ev, o.date)} – ${when}`;
      const shown = await A.notify('Erinnerung', text, o.key);
      if (!shown || !document.hidden) A.toast(text);
      st().notified.push(o.key);
    }
    st().notified = st().notified.slice(-500);
    A.save();
  }
  setInterval(checkReminders, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkReminders(); });

  // =====================================================================
  // Ausgaben
  // =====================================================================
  let expMonth = ym(nowIso());
  let editingExpense = null;
  let exCat = 'sonstiges';
  const catOf = (k) => P.EXPENSE_CATEGORIES[k] || P.EXPENSE_CATEGORIES.sonstiges;

  function renderExpenses() {
    if (A.view !== 'expenses') return;
    $('#expTitle').textContent = P.monthLabel(expMonth);
    const entries = P.monthEntries(st().expenses, expMonth);
    const sum = P.summarize(entries.filter((e) => !P.isIncome(e)));
    const income = P.summarize(entries.filter(P.isIncome)).total;
    const b = P.budgetStatus(sum.total, st().settings.budget, expMonth);
    const prev = P.summarize(P.monthEntries(st().expenses, P.shiftMonth(expMonth, -1)).filter((e) => !P.isIncome(e))).total;
    const max = Math.max(1, ...sum.byCategory.map((c) => c.amount));
    $('#expSummary').innerHTML = `
      <div class="exp-total">${euro(sum.total)}</div>
      ${income ? `<div class="saldo"><span>Einnahmen <b>${euro(income)}</b></span><span>Saldo <b class="${income - sum.total < 0 ? 'warn-text' : 'ok-text'}">${income - sum.total >= 0 ? '+' : '−'}${euro(Math.abs(income - sum.total))}</b></span></div>` : ''}
      ${prev ? `<div class="muted small center">Vormonat: ${euro(prev)} (${sum.total >= prev ? '+' : '−'}${euro(Math.abs(sum.total - prev))})</div>` : ''}
      ${b ? `<div class="meter ${b.over ? 'over' : ''}"><i style="width:${b.pct}%"></i></div>
        <div class="small center">${b.over ? `<b class="warn-text">${euro(-b.left)} über dem Budget</b>` : `Budget ${euro(b.budget)}: noch <b>${euro(b.left)}</b>${b.perDay != null ? ` · ${euro(b.perDay)} pro Tag` : ''}`}</div>` : '<div class="muted small center">Tipp: Lege unten unter „Budget“ ein Monatsbudget fest.</div>'}
      ${sum.byCategory.length ? `<div class="cat-bars">${sum.byCategory.map((c) => `<div class="cat-bar">
        <span>${catOf(c.category).emoji} ${esc(catOf(c.category).label)}</span><b>${euro(c.amount)}</b>
        <i style="width:${Math.round((c.amount / max) * 100)}%"></i></div>`).join('')}</div>` : ''}`;
    let lastDate = null;
    $('#expList').innerHTML = entries.length ? entries.map((e) => {
      const head = e.date !== lastDate ? `<h3 class="section muted small">${new Date(e.date + 'T12:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })}</h3>` : '';
      lastDate = e.date;
      return head + `<button class="exp-row" data-exp="${esc(e.id)}">
        <span class="emoji-sm">${catOf(e.category).emoji}</span>
        <span class="grow">${esc(e.note || catOf(e.category).label)}${e.recurring ? ' <span class="tag">monatlich</span>' : ''}</span>
        <b class="${P.isIncome(e) ? 'ok-text' : ''}">${P.isIncome(e) ? '+' : ''}${euro(e.amount)}</b></button>`;
    }).join('') : '<p class="muted center">Keine Ausgaben in diesem Monat. Oben z. B. „12,50 Tanken“ eintippen.</p>';
  }

  function addExpense(data) {
    st().expenses.push({ id: A.uid(), created: new Date().toISOString(), date: nowIso(), ...data });
    A.save();
    expMonth = ym(data.date || nowIso());
    A.render();
  }

  $('#expQuick').addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = $('#expQuickInput').value.trim();
    const p = P.parseExpenseText(raw.replace(/^\+\s*/, ''));
    if (p && raw.startsWith('+')) p.category = 'einnahme';
    if (!p) { A.toast('Bitte mit Betrag, z. B. „12,50 Tanken“'); return; }
    addExpense(p);
    $('#expQuickInput').value = '';
    A.toast(`${catOf(p.category).emoji} ${euro(p.amount)} ${p.note} gebucht`, { label: 'Ändern', fn: () => openExpenseDialog(st().expenses[st().expenses.length - 1]) });
  });
  if (A.listen) $('#micExp').hidden = false;
  $('#micExp').onclick = () => A.listen($('#micExp'), (text) => {
    const p = P.parseExpenseText(text);
    if (!p) { A.toast(`„${text}“ – keinen Betrag verstanden`); return; }
    addExpense(p);
    A.toast(`${catOf(p.category).emoji} ${euro(p.amount)} ${p.note} gebucht`, { label: 'Ändern', fn: () => openExpenseDialog(st().expenses[st().expenses.length - 1]) });
  });
  $('#expPrev').onclick = () => { expMonth = P.shiftMonth(expMonth, -1); renderExpenses(); };
  $('#expNext').onclick = () => { expMonth = P.shiftMonth(expMonth, 1); renderExpenses(); };
  $('#expList').addEventListener('click', (e) => {
    const r = e.target.closest('[data-exp]');
    if (r) openExpenseDialog(st().expenses.find((x) => x.id === r.dataset.exp));
  });
  $('#btnExpNew').onclick = () => openExpenseDialog(null);
  $('#btnExpBudget').onclick = () => {
    const v = prompt('Monatsbudget in € (leer = kein Budget):', st().settings.budget ? String(st().settings.budget).replace('.', ',') : '');
    if (v === null) return;
    st().settings.budget = L.parsePrice(v) || 0;
    A.save(); renderExpenses();
  };
  $('#btnExpCsv').onclick = () => {
    const entries = P.monthEntries(st().expenses, expMonth);
    if (!entries.length) { A.toast('Keine Ausgaben in diesem Monat'); return; }
    download(`ausgaben-${expMonth}.csv`, P.toCSV(entries), 'text/csv');
  };

  // ---------- Ausgabe-Dialog ----------
  const exDlg = $('#expenseDialog');
  $('#exCategory').innerHTML = Object.entries(P.EXPENSE_CATEGORIES).map(([k, c]) => `<button type="button" class="chip" data-v="${k}">${c.emoji} ${c.label}</button>`).join('');
  function setExCat(k) { exCat = k; $$('#exCategory .chip').forEach((c) => c.classList.toggle('active', c.dataset.v === k)); }
  $('#exCategory').addEventListener('click', (e) => { const c = e.target.closest('[data-v]'); if (c) setExCat(c.dataset.v); });
  $('#exNote').addEventListener('input', () => {
    if (editingExpense) return;
    const k = P.detectExpenseCategory($('#exNote').value);
    if (k !== 'sonstiges') setExCat(k);
  });
  function openExpenseDialog(ex) {
    editingExpense = ex || null;
    $('#expDlgTitle').textContent = ex ? 'Ausgabe bearbeiten' : 'Neue Ausgabe';
    $('#exAmount').value = ex ? String(ex.amount).replace('.', ',') : '';
    $('#exDate').value = ex ? ex.date : nowIso();
    $('#exNote').value = ex ? ex.note || '' : '';
    $('#exRepeat').checked = !!(ex && ex.repeat === 'monthly');
    setExCat(ex ? ex.category : 'sonstiges');
    $('#exDelete').hidden = !ex;
    exDlg.showModal();
  }
  A.actions.expense = () => openExpenseDialog(null);
  A.openExpense = (preset) => { openExpenseDialog(null); if (preset && preset.category) setExCat(preset.category); if (preset && preset.title) $('#expDlgTitle').textContent = preset.title; };
  $('#expenseForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const amount = L.parsePrice($('#exAmount').value);
    if (!amount) { A.toast('Bitte einen Betrag eingeben'); return; }
    const data = { amount, date: $('#exDate').value || nowIso(), category: exCat, note: $('#exNote').value.trim(), repeat: $('#exRepeat').checked ? 'monthly' : undefined };
    if (editingExpense) Object.assign(st().expenses.find((x) => x.id === editingExpense.id), data);
    else st().expenses.push({ id: A.uid(), created: new Date().toISOString(), ...data });
    A.save(); exDlg.close();
    expMonth = ym(data.date);
    if (A.view !== 'expenses' && A.view !== 'home') A.showView('expenses'); else A.render();
  });
  $('#exCancel').onclick = () => exDlg.close();
  $('#exDelete').onclick = () => {
    if (!confirm(editingExpense.repeat === 'monthly' ? 'Diese Fixkosten löschen (alle Monate)?' : 'Ausgabe löschen?')) return;
    st().expenses = st().expenses.filter((x) => x.id !== editingExpense.id);
    A.save(); exDlg.close(); A.render();
  };

  // =====================================================================
  A.actions.workout = () => { A.showView('sport'); preview = buildWorkout(); renderPreview(); };
  A.onRender(renderHome);
  A.onRender(renderHub);
  A.onRender(renderSport);
  A.onRender(renderExpenses);
  if (!preview) renderPreview();
  A.render();
  checkReminders();
  const view = new URLSearchParams(location.search).get('view');
  if (view) A.showView(view);
})();
