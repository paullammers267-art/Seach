/* Oberfläche für Aufgaben, Gewohnheiten, Gesundheit, Notizen, Wetter und die Suche über alles.
   Baut auf window.App (app.js) und window.FridgeLife (life.js) auf. */
(() => {
  'use strict';
  const A = window.App;
  const L = A.L;
  const F = window.FridgeLife;
  const S = window.FridgeSport;
  const P = window.FridgePlanner;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const esc = A.esc;
  const st = () => A.state;
  const today = () => A.today();
  A.searchSources = A.searchSources || [];

  function dueLabel(iso) {
    if (!iso) return '';
    const d = L.daysUntil(iso);
    if (d === 0) return 'heute';
    if (d === 1) return 'morgen';
    if (d === -1) return 'gestern';
    if (d < 0) return `seit ${-d} Tagen`;
    if (d < 7) return new Date(iso + 'T12:00').toLocaleDateString('de-DE', { weekday: 'long' });
    return L.formatDate(iso).slice(0, 6);
  }

  // =====================================================================
  // Startseite: Wetter, Aufgaben heute, Gewohnheiten
  // =====================================================================
  let weatherLoading = false;
  let lastWeatherTry = 0;
  const WEATHER_TTL = 10 * 60000; // alle 10 Minuten frisch (Open-Meteo aktualisiert „current“ alle 15 Min.)
  const isGpsPlace = (p) => p && (p.gps || p.name === 'Mein Standort');

  /** Aktuelle Position (für „Mein Standort“), höchstens 10 Min. alt. */
  function currentPosition() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: Math.round(pos.coords.latitude * 100) / 100, lon: Math.round(pos.coords.longitude * 100) / 100 }),
        () => resolve(null), { timeout: 8000, maximumAge: 10 * 60000 });
    });
  }

  async function loadWeather(force) {
    const p = st().settings.place;
    if (!p || weatherLoading) return;
    const c = st().weatherCache;
    if (!force && c && c.lat === p.lat && c.lon === p.lon && Date.now() - c.at < WEATHER_TTL) return;
    if (!force && Date.now() - lastWeatherTry < 60000) return; // offline: nicht im Kreis versuchen
    lastWeatherTry = Date.now();
    weatherLoading = true;
    if (force) renderHomeTop();
    try {
      // Unterwegs: Standort neu bestimmen, damit das Wetter zum aktuellen Ort passt
      if (isGpsPlace(p)) {
        const pos = await currentPosition();
        if (pos && (pos.lat !== p.lat || pos.lon !== p.lon)) { p.lat = pos.lat; p.lon = pos.lon; p.gps = true; }
      }
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}` +
        '&current=temperature_2m,apparent_temperature,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=3';
      const j = await (await fetch(url, { cache: 'no-store' })).json();
      st().weatherCache = {
        at: Date.now(), lat: p.lat, lon: p.lon,
        current: { temp: j.current.temperature_2m, feels: j.current.apparent_temperature, code: j.current.weather_code },
        daily: j.daily.time.map((d, i) => ({ date: d, code: j.daily.weather_code[i], max: j.daily.temperature_2m_max[i], min: j.daily.temperature_2m_min[i], rain: j.daily.precipitation_probability_max[i] || 0 })),
      };
      A.save();
    } catch (e) { /* offline – alter Stand bleibt */ } finally { weatherLoading = false; renderHomeTop(); }
  }
  // Solange die Startseite offen ist, regelmäßig prüfen; beim Zurückkehren in die App sofort
  setInterval(() => { if (A.view === 'home' && !document.hidden) loadWeather(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && A.view === 'home') loadWeather(); });

  function weatherCard() {
    const p = st().settings.place;
    if (!p) {
      return `<div class="card home-card weather">
        <div class="home-title">Wetter</div>
        <div class="home-line muted">Wetter für deinen Ort anzeigen.</div>
        <div class="row tight"><button class="btn small" data-weather="gps">Mein Standort</button><button class="btn small" data-pref="prefWeather">Ort eingeben</button></div>
      </div>`;
    }
    const w = st().weatherCache;
    if (!w || w.lat !== p.lat) return `<div class="card home-card weather"><div class="home-title">Wetter ${esc(p.name)}</div><div class="muted">Lade …</div></div>`;
    const now = F.weatherInfo(w.current.code);
    const age = Math.round((Date.now() - w.at) / 60000);
    const stand = weatherLoading ? 'aktualisiere …' : age < 1 ? 'gerade aktualisiert' : `Stand ${new Date(w.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
    const d0 = w.daily.find((d) => d.date === today()) || w.daily[0];
    const tips = F.weatherTips(d0);
    return `<div class="card home-card weather">
      <div class="weather-now">
        <span class="w-emoji">${now.emoji}</span>
        <div><div class="w-temp">${Math.round(w.current.temp)}°</div><div class="muted small">${esc(p.name)} · ${now.text} · gefühlt ${Math.round(w.current.feels)}°</div></div>
        <div class="w-range small">↑ ${Math.round(d0.max)}°<br>↓ ${Math.round(d0.min)}°<br>${d0.rain}%</div>
      </div>
      ${tips.length ? `<div class="w-tips">${tips.map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
      <div class="w-days">${w.daily.slice(1).map((d) => { const i = F.weatherInfo(d.code); return `<span>${new Date(d.date + 'T12:00').toLocaleDateString('de-DE', { weekday: 'short' })} ${i.emoji} ${Math.round(d.max)}°/${Math.round(d.min)}° ☔${d.rain}%</span>`; }).join('')}</div>
      <button class="w-refresh ${weatherLoading ? 'spin' : ''}" data-weather="refresh" aria-label="Wetter aktualisieren">↻ ${stand}</button>
    </div>`;
  }

  function renderHomeTop() {
    if (A.view !== 'home') return;
    const parts = [weatherCard()];
    const b = F.taskBuckets(st().tasks);
    const due = [...b.overdue, ...b.today];
    if (st().tasks.length) {
      parts.push(`<div class="card home-card">
        <button class="plain" data-goto="tasks"><div class="home-title">Aufgaben heute ${due.length ? `<span class="muted small">(${due.length})</span>` : ''}</div></button>
        ${due.length ? due.slice(0, 6).map(taskRow).join('') : '<div class="home-line">Für heute ist alles erledigt 🎉</div>'}
        ${due.length > 6 ? `<button class="link-btn" data-goto="tasks">+ ${due.length - 6} weitere</button>` : ''}
      </div>`);
    }
    if (st().habits.length) {
      parts.push(`<div class="card home-card">
        <button class="plain" data-goto="habits"><div class="home-title">Gewohnheiten</div></button>
        <div class="habit-quick">${st().habits.map((h) => {
          const c = habitCount(h);
          return `<button class="hq ${c >= h.target ? 'met' : ''}" data-hplus="${esc(h.id)}">${esc(h.emoji)} <b>${c}/${h.target}</b><span>${esc(h.name)}</span></button>`;
        }).join('')}</div>
      </div>`);
    }
    $('#homeTop').innerHTML = parts.join('');
    if (A.applyHomeHidden) A.applyHomeHidden();
    loadWeather();
  }

  $('#homeTop').addEventListener('click', async (e) => {
    const w = e.target.closest('[data-weather]');
    if (!w) return;
    if (w.dataset.weather === 'refresh') loadWeather(true);
    else useGps();
  });

  // =====================================================================
  // Suche über alles
  // =====================================================================
  function search(q) {
    const n = L.norm(q.trim());
    if (n.length < 2) return [];
    const has = (...xs) => L.norm(xs.filter(Boolean).join(' ')).includes(n);
    const out = [];
    for (const i of st().items) if (has(i.name, i.note)) out.push({ kind: 'item', id: i.id, icon: '🧊', text: i.name, sub: i.expiry ? L.statusText(i.expiry) : 'Vorrat' });
    for (const i of st().shopping) if (!i.done && has(i.name)) out.push({ kind: 'shop', icon: '🛒', text: i.name, sub: 'Einkaufsliste' });
    for (const t of st().tasks) if (!t.done && has(t.title, t.note)) out.push({ kind: 'task', id: t.id, icon: '✅', text: t.title, sub: t.due ? 'fällig ' + dueLabel(t.due) : 'Aufgabe' });
    for (const ev of st().events) if (has(ev.title, ev.note)) out.push({ kind: 'event', id: ev.id, icon: '📅', text: ev.title, sub: L.formatDate(ev.date) + (ev.repeat && ev.repeat !== 'none' ? ' · ' + P.REPEATS[ev.repeat] : '') });
    for (const nt of st().notes) if (has(nt.title, nt.text)) out.push({ kind: 'note', id: nt.id, icon: '📝', text: nt.title || nt.text.split('\n')[0], sub: 'Notiz' });
    for (const r of window.FridgeRecipes.concat(st().customRecipes)) if (has(r.name)) out.push({ kind: 'recipe', id: r.name, icon: r.emoji || '🍳', text: r.name, sub: `Rezept · ${r.minutes} Min` });
    for (const x of st().expenses) if (has(x.note)) out.push({ kind: 'expense', icon: '💶', text: `${x.note} ${L.formatEuro(x.amount)}`, sub: L.formatDate(x.date) });
    for (const ex of S.EXERCISES) if (has(ex.name)) out.push({ kind: 'exercise', icon: ex.emoji, text: ex.name, sub: 'Übung' });
    for (const fn of A.searchSources) out.push(...fn(has));
    return out.slice(0, 25);
  }
  $('#globalSearch').addEventListener('input', () => {
    const q = $('#globalSearch').value;
    const res = search(q);
    $('#searchResults').innerHTML = q.trim().length < 2 ? '' : res.length
      ? `<div class="card search-res">${res.map((r, i) => `<button class="sr" data-i="${i}"><span>${esc(r.icon)}</span><span class="grow">${esc(r.text)}<span class="muted small"> · ${esc(r.sub)}</span></span></button>`).join('')}</div>`
      : '<p class="muted small">Nichts gefunden.</p>';
    $('#searchResults').onclick = (e) => {
      const b = e.target.closest('[data-i]');
      if (!b) return;
      const r = res[b.dataset.i];
      $('#globalSearch').value = '';
      $('#searchResults').innerHTML = '';
      if (r.kind === 'item') { A.showView('stock'); A.openItemDialog(st().items.find((i) => i.id === r.id)); }
      else if (r.kind === 'shop') A.showView('shopping');
      else if (r.kind === 'task') { A.showView('tasks'); openTaskDialog(st().tasks.find((t) => t.id === r.id)); }
      else if (r.kind === 'event') A.openEvent(r.id);
      else if (r.kind === 'note') { A.showView('notes'); openNote(st().notes.find((x) => x.id === r.id)); }
      else if (r.kind === 'recipe') {
        A.showView('recipes');
        $('#recipeTabs [data-sub="all"]').click();
        $('#recipeSearch').value = r.id;
        $('#recipeSearch').dispatchEvent(new Event('input'));
      } else if (r.kind === 'expense') A.showView('expenses');
      else if (r.kind === 'go') A.showView(r.view);
      else if (r.kind === 'exercise') { A.showView('sport'); $('.ex-card').open = true; $('#exSearch').value = r.text; $('#exSearch').dispatchEvent(new Event('input')); }
    };
  });

  // =====================================================================
  // Aufgaben
  // =====================================================================
  let taskFilter = '';
  let editingTask = null;
  let tkCat = 'privat';
  const catOf = (k) => F.TASK_CATEGORIES[k] || F.TASK_CATEGORIES.privat;

  function taskRow(t) {
    const overdue = t.due && t.due < today();
    const meta = [
      t.due ? `<span class="${overdue ? 'warn-text' : ''}">${dueLabel(t.due)}${t.time ? ' ' + t.time : ''}</span>` : '',
      t.repeat && t.repeat !== 'none' ? F.TASK_REPEATS[t.repeat] : '',
      catOf(t.category).label,
      t.note ? esc(t.note) : '',
    ].filter(Boolean).join(' · ');
    return `<div class="task ${t.done ? 'done' : ''} prio${t.priority || 0}" data-task="${esc(t.id)}">
      <button class="tcheck" data-tdone aria-label="erledigt">${t.done ? '✔' : ''}</button>
      <span class="grow" data-tedit>${t.priority ? `<b class="prio-tag p${t.priority}">${t.priority > 1 ? 'dringend' : 'wichtig'}</b>` : ''}${esc(t.title)}<span class="muted small t-meta">${meta}</span></span>
    </div>`;
  }

  function renderTasks() {
    if (A.view !== 'tasks') return;
    const all = st().tasks;
    const counts = {};
    all.filter((t) => !t.done).forEach((t) => (counts[t.category] = (counts[t.category] || 0) + 1));
    $('#taskFilter').innerHTML = `<button class="chip ${!taskFilter ? 'active' : ''}" data-f="">Alle</button>` +
      Object.entries(F.TASK_CATEGORIES).filter(([k]) => counts[k]).map(([k, c]) => `<button class="chip ${taskFilter === k ? 'active' : ''}" data-f="${k}">${c.emoji} ${c.label} <span class="muted small">${counts[k]}</span></button>`).join('');
    const b = F.taskBuckets(all.filter((t) => !taskFilter || t.category === taskFilter));
    const sec = (title, list, cls = '') => list.length ? `<h3 class="section ${cls}">${title} <span class="muted small">${list.length}</span></h3>${list.map(taskRow).join('')}` : '';
    const open = b.overdue.length + b.today.length + b.tomorrow.length + b.week.length + b.later.length + b.someday.length;
    $('#taskList').innerHTML = (open ? '' : `<div class="empty"><div class="big-emoji">✅</div><p><b>Keine offenen Aufgaben.</b></p><p class="muted">Tippe oben z. B. „Bad putzen jeden Samstag“ – oder nutze die Putzplan-Vorlage.</p></div>`) +
      sec('Überfällig', b.overdue, 'warn-text') + sec('Heute', b.today) + sec('Morgen', b.tomorrow) + sec('Diese Woche', b.week) + sec('Später', b.later) + sec('Irgendwann', b.someday) +
      (b.done.length ? `<details class="done-box"><summary>Erledigt (${b.done.length})</summary>${b.done.slice(0, 30).map(taskRow).join('')}
        <button class="btn small" id="btnTaskClearDone">Erledigte löschen</button></details>` : '');
    if ($('#btnTaskClearDone')) $('#btnTaskClearDone').onclick = () => { st().tasks = st().tasks.filter((t) => !t.done); A.save(); A.render(); };
  }

  function toggleTask(id) {
    const t = st().tasks.find((x) => x.id === id);
    if (!t) return;
    const before = { ...t };
    if (t.done) { t.done = false; delete t.doneAt; A.save(); A.render(); return; }
    Object.assign(t, F.completeTask(t));
    A.save(); A.render();
    if (navigator.vibrate) navigator.vibrate(40);
    const undo = { label: 'Rückgängig', fn: () => { Object.keys(t).forEach((k) => delete t[k]); Object.assign(t, before); A.save(); A.render(); } };
    A.toast(t.repeat && t.repeat !== 'none' ? `${t.title} – nächstes Mal ${dueLabel(t.due)}` : `${t.title} erledigt`, undo);
  }

  document.addEventListener('click', (e) => {
    const row = e.target.closest('[data-task]');
    if (!row) return;
    if (e.target.closest('[data-tdone]')) toggleTask(row.dataset.task);
    else if (e.target.closest('[data-tedit]')) openTaskDialog(st().tasks.find((t) => t.id === row.dataset.task));
  });
  $('#taskFilter').addEventListener('click', (e) => { const c = e.target.closest('[data-f]'); if (c) { taskFilter = c.dataset.f; renderTasks(); } });

  function addTaskFromText(text) {
    const p = F.parseTaskText(text);
    if (!p.title) return null;
    const t = { id: A.uid(), created: today(), ...p };
    st().tasks.push(t);
    A.save(); A.render();
    return t;
  }
  $('#taskForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const t = addTaskFromText($('#taskInput').value);
    if (!t) return;
    $('#taskInput').value = '';
    A.toast(`${t.title}${t.due ? ' · ' + dueLabel(t.due) : ''}${t.time ? ' ' + t.time : ''}${t.repeat !== 'none' ? ' · 🔁 ' + F.TASK_REPEATS[t.repeat] : ''}`, { label: 'Ändern', fn: () => openTaskDialog(t) });
  });
  if (A.listen) $('#micTask').hidden = false;
  $('#micTask').onclick = () => A.listen($('#micTask'), (text) => {
    const t = addTaskFromText(text);
    if (t) A.toast(`${t.title}${t.due ? ' · ' + dueLabel(t.due) : ''}`, { label: 'Ändern', fn: () => openTaskDialog(t) });
  });
  $('#btnCleaning').onclick = () => {
    const have = new Set(st().tasks.filter((t) => !t.done).map((t) => L.norm(t.title)));
    const add = F.cleaningTasks().filter((t) => !have.has(L.norm(t.title)));
    if (!add.length) { A.toast('Der Putzplan ist schon angelegt'); return; }
    if (!confirm(`Putzplan mit ${add.length} wiederkehrenden Aufgaben anlegen?\n\n${add.map((t) => '• ' + t.title + ' (' + F.TASK_REPEATS[t.repeat] + ')').join('\n')}`)) return;
    add.forEach((t) => st().tasks.push({ id: A.uid(), created: today(), ...t }));
    A.save(); A.render();
    A.toast(`${add.length} Aufgaben angelegt – passe Tage oder Rhythmus einfach an`);
  };

  // ---------- Aufgaben-Dialog ----------
  const tkDlg = $('#taskDialog');
  $('#tkRepeat').innerHTML = Object.entries(F.TASK_REPEATS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  $('#tkCategory').innerHTML = Object.entries(F.TASK_CATEGORIES).map(([k, c]) => `<button type="button" class="chip" data-v="${k}">${c.emoji} ${c.label}</button>`).join('');
  const setTkCat = (k) => { tkCat = k; $$('#tkCategory .chip').forEach((c) => c.classList.toggle('active', c.dataset.v === k)); };
  $('#tkCategory').addEventListener('click', (e) => { const c = e.target.closest('[data-v]'); if (c) setTkCat(c.dataset.v); });
  function openTaskDialog(t) {
    editingTask = t || null;
    $('#taskDlgTitle').textContent = t ? 'Aufgabe bearbeiten' : 'Neue Aufgabe';
    $('#tkTitle').value = t ? t.title : '';
    $('#tkDue').value = t ? t.due || '' : '';
    $('#tkTime').value = t ? t.time || '' : '';
    $('#tkRepeat').value = t ? t.repeat || 'none' : 'none';
    $('#tkPriority').value = String(t ? t.priority || 0 : 0);
    $('#tkNote').value = t ? t.note || '' : '';
    setTkCat(t ? t.category || 'privat' : 'privat');
    $('#tkDelete').hidden = !t;
    tkDlg.showModal();
  }
  $('#tkTitle').addEventListener('input', () => { if (!editingTask) setTkCat(F.detectTaskCategory($('#tkTitle').value)); });
  $('#btnTaskNew').onclick = () => openTaskDialog(null);
  $('#tkCancel').onclick = () => tkDlg.close();
  $('#tkDelete').onclick = () => {
    st().tasks = st().tasks.filter((t) => t.id !== editingTask.id);
    A.save(); tkDlg.close(); A.render();
  };
  $('#taskDlgForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = {
      title: $('#tkTitle').value.trim() || 'Aufgabe', due: $('#tkDue').value || null, time: $('#tkTime').value || '',
      repeat: $('#tkRepeat').value, priority: Number($('#tkPriority').value), category: tkCat, note: $('#tkNote').value.trim(),
    };
    if (data.repeat !== 'none' && !data.due) data.due = today();
    if (editingTask) Object.assign(st().tasks.find((t) => t.id === editingTask.id), data);
    else st().tasks.push({ id: A.uid(), created: today(), ...data });
    A.save(); tkDlg.close();
    if (A.view !== 'tasks' && A.view !== 'home') A.showView('tasks'); else A.render();
  });

  // Kalender: offene Aufgaben mit Datum
  A.calendarSources.push((from, to) => st().tasks.filter((t) => !t.done && t.due && t.due >= from && t.due <= to)
    .map((t) => ({ date: t.due, kind: 'task', text: (t.time ? t.time + ' ' : '') + t.title, emoji: '✅', go: 'tasks' })));

  // Erinnerung zur Uhrzeit (solange die App offen ist)
  async function checkTaskReminders() {
    const now = Date.now();
    let changed = false;
    for (const t of st().tasks) {
      if (t.done || !t.due || !t.time) continue;
      const at = new Date(t.due + 'T' + t.time).getTime();
      const key = 'task:' + t.id + '@' + t.due + 'T' + t.time;
      if (at <= now && now - at < 3600000 && !st().notified.includes(key)) {
        st().notified.push(key);
        changed = true;
        const shown = await A.notify('Aufgabe', `${t.title} (${t.time})`, key);
        if (!shown || !document.hidden) A.toast(`${t.title}`, { label: 'Erledigt', fn: () => toggleTask(t.id) });
      }
    }
    if (changed) A.save();
  }
  setInterval(checkTaskReminders, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkTaskReminders(); });

  // =====================================================================
  // Gewohnheiten
  // =====================================================================
  let editingHabit = null;
  const habitCount = (h, d = today()) => (st().habitLog[d] && st().habitLog[d][h.id]) || 0;
  function setHabitCount(h, n) {
    const d = today();
    st().habitLog[d] = st().habitLog[d] || {};
    st().habitLog[d][h.id] = Math.max(0, Math.min(99, n));
    A.save();
  }
  function habitPlus(id, delta = 1) {
    const h = st().habits.find((x) => x.id === id);
    if (!h) return;
    const before = habitCount(h);
    setHabitCount(h, before + delta);
    if (before < h.target && before + delta >= h.target) {
      if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
      const streak = F.habitStreak(st().habitLog, h);
      A.toast(`${h.emoji} ${h.name} geschafft!${streak > 1 ? ` 🔥 ${streak} Tage in Folge` : ''}`);
    }
    A.render();
  }
  document.addEventListener('click', (e) => {
    const p = e.target.closest('[data-hplus]');
    if (p) { habitPlus(p.dataset.hplus, 1); return; }
    const m = e.target.closest('[data-hminus]');
    if (m) habitPlus(m.dataset.hminus, -1);
  });

  function renderHabits() {
    if (A.view !== 'habits') return;
    const days = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    $('#habitList').innerHTML = st().habits.length ? st().habits.map((h) => {
      const c = habitCount(h);
      const pct = Math.min(100, Math.round((c / h.target) * 100));
      const week = F.habitWeek(st().habitLog, h);
      const streak = F.habitStreak(st().habitLog, h);
      return `<div class="card habit ${c >= h.target ? 'met' : ''}">
        <div class="habit-head">
          <span class="h-emoji">${esc(h.emoji)}</span>
          <button class="plain grow" data-hedit="${esc(h.id)}"><b>${esc(h.name)}</b>
            <div class="muted small">${streak ? `${streak} Tag${streak > 1 ? 'e' : ''} in Folge · ` : ''}${F.habitRate(st().habitLog, h)}&nbsp;% in 30&nbsp;Tagen</div></button>
          ${h.target > 1 ? `<button class="icon" data-hminus="${esc(h.id)}" aria-label="minus">−</button>` : ''}
          <button class="h-plus" data-hplus="${esc(h.id)}" aria-label="plus">${c >= h.target ? '✔' : '+1'}</button>
        </div>
        <div class="h-progress"><div class="meter"><i style="width:${pct}%"></i></div><span class="small"><b>${c}</b> / ${h.target}${h.unit ? ' ' + esc(h.unit) : ''}</span></div>
        <div class="h-week">${week.map((d) => `<span class="${d.met ? 'met' : d.count ? 'part' : ''}" title="${d.iso}: ${d.count}"><i></i>${days[new Date(d.iso + 'T12:00').getDay()]}</span>`).join('')}</div>
      </div>`;
    }).join('') : `<div class="empty"><div class="big-emoji">💧</div><p><b>Kleine Gewohnheiten, große Wirkung.</b></p><p class="muted">Wähle unten eine Vorlage – z. B. 8 Gläser Wasser am Tag – und tippe jedes Mal auf +1.</p></div>`;
    const have = new Set(st().habits.map((h) => h.name));
    $('#habitPresets').innerHTML = F.HABIT_PRESETS.filter((p) => !have.has(p.name)).map((p) => `<button class="chip" data-preset="${esc(p.name)}">＋ ${p.emoji} ${esc(p.name)}${p.target > 1 ? ` (${p.target})` : ''}</button>`).join('');
  }
  $('#habitPresets').addEventListener('click', (e) => {
    const c = e.target.closest('[data-preset]');
    if (!c) return;
    const p = F.HABIT_PRESETS.find((x) => x.name === c.dataset.preset);
    st().habits.push({ id: A.uid(), created: today(), ...p });
    A.save(); A.render();
  });
  $('#habitList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-hedit]');
    if (b) openHabitDialog(st().habits.find((h) => h.id === b.dataset.hedit));
  });
  const hbDlg = $('#habitDialog');
  function openHabitDialog(h) {
    editingHabit = h || null;
    $('#habitDlgTitle').textContent = h ? 'Gewohnheit bearbeiten' : 'Eigene Gewohnheit';
    $('#hbName').value = h ? h.name : '';
    $('#hbEmoji').value = h ? h.emoji : '⭐';
    $('#hbTarget').value = h ? h.target : 1;
    $('#hbUnit').value = h ? h.unit || '' : '';
    $('#hbDelete').hidden = !h;
    hbDlg.showModal();
  }
  $('#btnHabitCustom').onclick = () => openHabitDialog(null);
  $('#hbCancel').onclick = () => hbDlg.close();
  $('#hbDelete').onclick = () => {
    if (!confirm(`„${editingHabit.name}“ löschen?`)) return;
    st().habits = st().habits.filter((h) => h.id !== editingHabit.id);
    A.save(); hbDlg.close(); A.render();
  };
  $('#habitForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = { name: $('#hbName').value.trim() || 'Gewohnheit', emoji: $('#hbEmoji').value.trim() || '⭐', target: Math.max(1, parseInt($('#hbTarget').value, 10) || 1), unit: $('#hbUnit').value.trim() };
    if (editingHabit) Object.assign(st().habits.find((h) => h.id === editingHabit.id), data);
    else st().habits.push({ id: A.uid(), created: today(), ...data });
    A.save(); hbDlg.close(); A.render();
  });

  // =====================================================================
  // Gesundheit
  // =====================================================================
  let mood = null;
  $('#moodPick').innerHTML = F.MOODS.map((m) => `<button class="mood" data-mood="${m.v}"><span>${m.emoji}</span>${m.label}</button>`).join('');
  $('#moodPick').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mood]');
    if (!b) return;
    mood = Number(b.dataset.mood);
    $$('#moodPick .mood').forEach((x) => x.classList.toggle('active', x === b));
  });

  function renderHealth() {
    if (A.view !== 'health') return;
    const s = st().settings;
    if (document.activeElement !== $('#heightInput')) $('#heightInput').value = s.height || '';
    if (document.activeElement !== $('#goalInput')) $('#goalInput').value = s.weightGoal ? String(s.weightGoal).replace('.', ',') : '';
    const w = F.weightStats(st().weights);
    if (!w) $('#weightStats').innerHTML = '<p class="muted small">Trage dein Gewicht ein – am besten morgens, immer zur gleichen Zeit.</p>';
    else {
      const b = F.bmi(w.last.kg, s.height);
      const arrow = (v) => (v == null ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '±') + String(Math.abs(v)).replace('.', ','));
      const vals = w.list.slice(-60).map((x) => x.kg);
      const goal = s.weightGoal;
      const all = goal ? vals.concat(goal) : vals;
      const min = Math.min(...all), max = Math.max(...all);
      const gy = goal && max !== min ? 4 + (1 - (goal - min) / (max - min)) * 72 : null;
      $('#weightStats').innerHTML = `
        <div class="statgrid">
          <div><b>${String(w.last.kg).replace('.', ',')}</b><span>kg aktuell</span></div>
          <div><b>${arrow(w.change7)}</b><span>kg in 7 Tagen</span></div>
          <div><b>${arrow(w.change30)}</b><span>kg in 30 Tagen</span></div>
          <div><b>${b != null ? String(b).replace('.', ',') : '–'}</b><span>${b ? 'BMI · ' + F.bmiLabel(b) : 'BMI (Größe fehlt)'}</span></div>
        </div>
        ${vals.length > 1 ? `<svg class="spark" viewBox="0 0 300 80" preserveAspectRatio="none" aria-label="Gewichtsverlauf">
          ${gy != null ? `<line x1="0" x2="300" y1="${gy.toFixed(1)}" y2="${gy.toFixed(1)}" class="goal"/>` : ''}
          <path d="${F.sparkPath(vals, 300, 80, 4, min, max)}" /></svg>
          <div class="muted small spark-legend"><span>${L.formatDate(w.list[Math.max(0, w.list.length - 60)].date).slice(0, 6)}</span><span>${goal ? `– – Ziel ${String(goal).replace('.', ',')} kg (noch ${String(Math.round((w.last.kg - goal) * 10) / 10).replace('.', ',')} kg)` : `min ${min} · max ${max} kg`}</span></div>` : ''}
        <div class="w-list">${[...w.list].reverse().slice(0, 5).map((x) => `<div class="small">${L.formatDate(x.date)} · <b>${String(x.kg).replace('.', ',')} kg</b> <button class="icon-sm" data-wdel="${x.date}" aria-label="löschen">✕</button></div>`).join('')}</div>`;
    }
    const m = st().moods[today()];
    if (m && mood == null) { mood = m.mood; }
    $$('#moodPick .mood').forEach((x) => x.classList.toggle('active', Number(x.dataset.mood) === mood));
    if (m && document.activeElement !== $('#sleepInput') && !$('#sleepInput').value) $('#sleepInput').value = m.sleep != null ? String(m.sleep).replace('.', ',') : '';
    if (m && document.activeElement !== $('#moodNote') && !$('#moodNote').value) $('#moodNote').value = m.note || '';
    const ms = F.moodStats(st().moods);
    const last7 = Array.from({ length: 7 }, (_, i) => F.addDays(today(), i - 6));
    $('#moodStats').innerHTML = ms.days ? `<div class="mood-week">${last7.map((d) => { const x = st().moods[d]; const e = x && F.MOODS.find((mm) => mm.v === x.mood); return `<span title="${d}">${e ? e.emoji : '·'}<small>${new Date(d + 'T12:00').toLocaleDateString('de-DE', { weekday: 'short' }).slice(0, 2)}</small></span>`; }).join('')}</div>
      <p class="small muted">Ø Stimmung (7 Tage): ${ms.mood != null ? F.MOODS[Math.round(ms.mood) - 1].emoji + ' ' + String(ms.mood).replace('.', ',') : '–'}${ms.sleep != null ? ` · Ø Schlaf ${String(ms.sleep).replace('.', ',')} h` : ''}</p>` : '';
  }
  $('#weightForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const kg = L.parsePrice($('#weightInput').value);
    if (!kg || kg < 20 || kg > 400) { A.toast('Bitte Gewicht in kg eingeben, z. B. 72,4'); return; }
    st().weights = st().weights.filter((w) => w.date !== today()).concat({ date: today(), kg });
    $('#weightInput').value = '';
    A.save(); A.render();
    const w = F.weightStats(st().weights);
    A.toast(`${String(kg).replace('.', ',')} kg gespeichert${w.change7 ? ` (${w.change7 > 0 ? '+' : ''}${String(w.change7).replace('.', ',')} kg in 7 Tagen)` : ''}`);
  });
  $('#weightStats').addEventListener('click', (e) => {
    const b = e.target.closest('[data-wdel]');
    if (!b) return;
    st().weights = st().weights.filter((w) => w.date !== b.dataset.wdel);
    A.save(); A.render();
  });
  $('#heightInput').addEventListener('change', () => { st().settings.height = parseInt($('#heightInput').value, 10) || null; A.save(); A.render(); });
  $('#goalInput').addEventListener('change', () => { st().settings.weightGoal = L.parsePrice($('#goalInput').value); A.save(); A.render(); });
  $('#btnMoodSave').onclick = () => {
    if (mood == null) { A.toast('Wähle zuerst, wie es dir geht'); return; }
    const sleep = L.parsePrice($('#sleepInput').value);
    st().moods[today()] = { mood, sleep, note: $('#moodNote').value.trim() };
    A.save(); A.render();
    A.toast(`${F.MOODS[mood - 1].emoji} Eintrag für heute gespeichert`);
  };

  // =====================================================================
  // Notizen
  // =====================================================================
  const NOTE_COLORS = { '': 'keine', yellow: '🟨', green: '🟩', blue: '🟦', pink: '🟪' };
  let editingNote = null;
  let ntColor = '';
  $('#ntColors').innerHTML = Object.entries(NOTE_COLORS).map(([k, v]) => `<button type="button" class="chip" data-c="${k}">${v}</button>`).join('');
  $('#ntColors').addEventListener('click', (e) => {
    const c = e.target.closest('[data-c]');
    if (!c) return;
    ntColor = c.dataset.c;
    $$('#ntColors .chip').forEach((x) => x.classList.toggle('active', x === c));
  });

  function noteBody(n) {
    return n.text.split('\n').slice(0, 12).map((line, i) => {
      const m = line.match(/^\s*(?:[-*]\s*)?\[( |x|X)\]\s?(.*)$/);
      if (m) return `<label class="ncheck ${m[1] !== ' ' ? 'on' : ''}"><input type="checkbox" data-nline="${i}" ${m[1] !== ' ' ? 'checked' : ''}> ${esc(m[2])}</label>`;
      return `<div>${esc(line) || '&nbsp;'}</div>`;
    }).join('');
  }
  function renderNotes() {
    if (A.view !== 'notes') return;
    const q = L.norm($('#noteSearch').value.trim());
    const list = st().notes.filter((n) => !q || L.norm(n.title + ' ' + n.text).includes(q))
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || String(b.updated).localeCompare(String(a.updated)));
    $('#noteList').innerHTML = list.length ? list.map((n) => `<div class="note ${n.color || ''}" data-note="${esc(n.id)}">
        ${n.pinned ? '<span class="pin">📌</span>' : ''}
        ${n.title ? `<b>${esc(n.title)}</b>` : ''}
        <div class="nbody">${noteBody(n)}</div>
      </div>`).join('')
      : (q ? '<p class="muted small">Nichts gefunden.</p>' : `<div class="empty"><div class="big-emoji">📝</div><p><b>Noch keine Notizen.</b></p><p class="muted">Ideen, Packlisten, Geschenkideen, Zählerstände … Zeilen mit „[ ]“ werden zur Checkliste.</p></div>`);
  }
  $('#noteSearch').addEventListener('input', renderNotes);
  $('#noteList').addEventListener('click', (e) => {
    const card = e.target.closest('[data-note]');
    if (!card) return;
    const n = st().notes.find((x) => x.id === card.dataset.note);
    const cb = e.target.closest('[data-nline]');
    if (cb) {
      const lines = n.text.split('\n');
      const i = Number(cb.dataset.nline);
      lines[i] = lines[i].replace(/\[( |x|X)\]/, cb.checked ? '[x]' : '[ ]');
      n.text = lines.join('\n');
      n.updated = new Date().toISOString();
      A.save(); renderNotes();
      return;
    }
    if (e.target.closest('label')) return;
    openNote(n);
  });
  const ntDlg = $('#noteDialog');
  function openNote(n) {
    editingNote = n || null;
    $('#ntTitle').value = n ? n.title || '' : '';
    $('#ntText').value = n ? n.text : '';
    $('#ntPinned').checked = !!(n && n.pinned);
    ntColor = n ? n.color || '' : '';
    $$('#ntColors .chip').forEach((x) => x.classList.toggle('active', x.dataset.c === ntColor));
    $('#ntDelete').hidden = !n;
    $('#ntShare').hidden = !n;
    ntDlg.showModal();
    if (!n) setTimeout(() => $('#ntText').focus(), 50);
  }
  $('#btnNoteNew').onclick = () => openNote(null);
  $('#ntCancel').onclick = () => ntDlg.close();
  $('#ntDelete').onclick = () => {
    if (!confirm('Notiz löschen?')) return;
    st().notes = st().notes.filter((x) => x.id !== editingNote.id);
    A.save(); ntDlg.close(); A.render();
  };
  $('#ntShare').onclick = async () => {
    const text = ($('#ntTitle').value ? $('#ntTitle').value + '\n\n' : '') + $('#ntText').value;
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); A.toast('Notiz kopiert'); }
    } catch (e) { /* abgebrochen */ }
  };
  $('#noteForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = { title: $('#ntTitle').value.trim(), text: $('#ntText').value.replace(/\s+$/, ''), pinned: $('#ntPinned').checked, color: ntColor, updated: new Date().toISOString() };
    if (!data.title && !data.text) { ntDlg.close(); return; }
    if (editingNote) Object.assign(st().notes.find((x) => x.id === editingNote.id), data);
    else st().notes.push({ id: A.uid(), created: new Date().toISOString(), ...data });
    A.save(); ntDlg.close();
    if (A.view !== 'notes') A.showView('notes'); else A.render();
  });

  // =====================================================================
  // Wetter-Ort
  // =====================================================================
  function renderPlace() {
    const p = st().settings.place;
    $('#placeInfo').textContent = p ? `Aktuell: ${p.name}` : 'Für das Wetter auf der Startseite.';
  }
  async function setPlace(place) {
    st().settings.place = place;
    st().weatherCache = null;
    A.save();
    renderPlace();
    await loadWeather(true);
    A.toast(`Wetter für ${place.name}`);
  }
  function useGps() {
    if (!navigator.geolocation) { A.toast('Standort wird nicht unterstützt – bitte Ort eingeben'); A.openPref('prefWeather'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setPlace({ name: 'Mein Standort', gps: true, lat: Math.round(pos.coords.latitude * 100) / 100, lon: Math.round(pos.coords.longitude * 100) / 100 }),
      () => { A.toast('Standort nicht freigegeben – bitte Ort eingeben'); A.openPref('prefWeather'); setTimeout(() => $('#placeInput').focus(), 50); },
      { timeout: 10000, maximumAge: 10 * 60000 });
  }
  $('#btnPlaceGps').onclick = useGps;
  $('#placeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = $('#placeInput').value.trim();
    if (!q) return;
    try {
      const j = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=de`)).json();
      const r = j.results && j.results[0];
      if (!r) { A.toast('Ort nicht gefunden'); return; }
      $('#placeInput').value = '';
      await setPlace({ name: r.name, lat: r.latitude, lon: r.longitude });
    } catch (err) { A.toast('Keine Verbindung'); }
  });

  // =====================================================================
  function renderHub() {
    const b = F.taskBuckets(st().tasks);
    const due = b.overdue.length + b.today.length;
    $('#hubTasks').textContent = due ? `${due} heute fällig` : `${st().tasks.filter((t) => !t.done).length} offen`;
    const met = st().habits.filter((h) => habitCount(h) >= h.target).length;
    $('#hubHabits').textContent = st().habits.length ? `${met}/${st().habits.length} heute` : 'Wasser, Vitamine …';
    const w = F.weightStats(st().weights);
    $('#hubHealth').textContent = w ? `${String(w.last.kg).replace('.', ',')} kg` : 'Gewicht & Stimmung';
    $('#hubNotes').textContent = `${st().notes.length} Notiz${st().notes.length === 1 ? '' : 'en'}`;
  }

  A.actions.task = () => { A.showView('tasks'); setTimeout(() => $('#taskInput').focus(), 50); };
  A.actions.note = () => openNote(null);
  A.actions.weight = () => { A.showView('health'); setTimeout(() => $('#weightInput').focus(), 50); };
  A.onRender(renderHomeTop);
  A.onRender(renderTasks);
  A.onRender(renderHabits);
  A.onRender(renderHealth);
  A.onRender(renderNotes);
  A.onRender(renderHub);
  A.onRender(renderPlace);
  A.render();
  checkTaskReminders();
  const view = new URLSearchParams(location.search).get('view');
  if (view) A.showView(view);
})();
