/* Kalorien-Tracker (Barcode, Nährwerttabelle per Foto, Suche, Text/Sprache) – komplett kostenlos und Darstellung (Hell/Dunkel).
   Baut auf window.App (app.js) und window.FridgeNutrition (nutrition.js) auf. */
(() => {
  'use strict';
  const A = window.App;
  const L = A.L;
  const N = window.FridgeNutrition;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const esc = A.esc;
  const st = () => A.state;
  const today = () => A.today();
  const addDays = window.FridgeLife.addDays;
  const num = (v) => (v === '' || v == null ? null : L.parsePrice(String(v)));
  const fmt = (v, d = 0) => (v == null ? '–' : Number(v).toLocaleString('de-DE', { maximumFractionDigits: d }));

  if (!Array.isArray(st().food)) st().food = [];
  if (!st().settings.nutrition) st().settings.nutrition = { sex: 'w', age: null, activity: 1.375, goal: 'keep', manual: null, weight: null };

  let foodDate = today();

  // =====================================================================
  // Darstellung (Hell/Dunkel)
  // =====================================================================
  function applyTheme() {
    const t = st().settings.theme || 'auto';
    if (t === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    $$('#themeSwitch [data-theme-set]').forEach((b) => b.classList.toggle('active', b.dataset.themeSet === t));
  }
  $('#themeSwitch').addEventListener('click', (e) => {
    const b = e.target.closest('[data-theme-set]');
    if (!b) return;
    st().settings.theme = b.dataset.themeSet;
    A.save(); applyTheme();
  });

  // =====================================================================
  // Ziel & Summen
  // =====================================================================
  function latestWeight() {
    const w = [...st().weights].sort((a, b) => a.date.localeCompare(b.date)).pop();
    return w ? w.kg : st().settings.nutrition.weight;
  }
  function goal() {
    const n = st().settings.nutrition;
    if (n.manual) {
      const kcal = n.manual;
      return { kcal, protein: Math.round((kcal * 0.2) / 4), carbs: Math.round((kcal * 0.5) / 4), fat: Math.round((kcal * 0.3) / 9), manual: true };
    }
    return N.dailyGoal({ sex: n.sex, age: n.age, height: st().settings.height, weight: latestWeight(), activity: n.activity, goal: n.goal });
  }
  const dayEntries = (d) => st().food.filter((e) => e.date === d);
  function burnedOn(d) {
    const kg = latestWeight() || 70;
    return st().workouts.filter((w) => w.date === d).reduce((s, w) => s + N.burned(w, kg), 0);
  }
  function dayLabel(d) {
    if (d === today()) return 'Heute';
    if (d === addDays(today(), -1)) return 'Gestern';
    return new Date(d + 'T12:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  // =====================================================================
  // Ansicht
  // =====================================================================
  function renderFood() {
    if (A.view !== 'food') return;
    $('#foodDay').textContent = dayLabel(foodDate);
    $('#foodNext').disabled = foodDate >= today();
    const list = dayEntries(foodDate);
    const t = N.totals(list);
    const g = goal();
    const burned = burnedOn(foodDate);
    const budget = g ? g.kcal + burned : null;
    const left = budget != null ? budget - t.kcal : null;
    const pct = budget ? Math.min(1, t.kcal / budget) : 0;
    const C = 2 * Math.PI * 52;
    const macro = (label, val, target, unit = 'g') => `<div class="macro"><span>${label}</span><span><b>${fmt(val)}</b>${target ? ' / ' + fmt(target) : ''} ${unit}</span>
      <div class="meter ${target && val > target * 1.1 ? 'over' : ''}"><i style="width:${target ? Math.min(100, (val / target) * 100) : 0}%"></i></div></div>`;
    $('#foodSummary').innerHTML = `<div class="food-ring">
        <svg viewBox="0 0 120 120" aria-hidden="true"><circle class="track" cx="60" cy="60" r="52"/>
          <circle class="val ${left != null && left < 0 ? 'over' : ''}" cx="60" cy="60" r="52" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - pct)).toFixed(1)}"/>
          <text x="60" y="62">${left != null ? fmt(Math.abs(left)) : fmt(t.kcal)}</text>
          <text x="60" y="78" class="sub">${left == null ? 'kcal gegessen' : left >= 0 ? 'kcal übrig' : 'kcal zu viel'}</text></svg>
        <div class="facts">
          <div>Gegessen: <b>${fmt(t.kcal)} kcal</b></div>
          ${g ? `<div>Ziel: <b>${fmt(g.kcal)} kcal</b></div>` : '<div class="muted small">Ziel unten einstellen 👇</div>'}
          ${burned ? `<div>Training: <b>+${fmt(burned)} kcal</b></div>` : ''}
        </div>
      </div>
      ${macro('Eiweiß', t.p, g && g.protein)}${macro('Kohlenhydrate', t.c, g && g.carbs)}${macro('Fett', t.f, g && g.fat)}`;

    $('#foodMeals').innerHTML = Object.entries(N.MEALS).map(([k, label]) => {
      const items = list.filter((e) => e.meal === k);
      return `<div class="meal-head"><h3>${label}</h3><span class="muted small">${items.length ? fmt(N.totals(items).kcal) + ' kcal' : ''} <button class="link-btn" data-addmeal="${k}">＋</button></span></div>` +
        items.map((e) => `<button class="food-row" data-food="${esc(e.id)}">
          ${e.photo ? `<img src="${esc(e.photo)}" alt="" referrerpolicy="no-referrer">` : `<span class="fe">${e.source === 'ai' ? '🤖' : e.source === 'barcode' ? '📦' : e.source === 'label' ? '🏷️' : '🍴'}</span>`}
          <span class="grow">${esc(e.name)}<span class="muted small"> · ${e.grams ? fmt(e.grams) + ' g' : ''}</span></span>
          <b>${fmt(e.kcal)} kcal</b></button>`).join('');
    }).join('');

    // Zuletzt gegessen: schnell nochmal eintragen
    const seen = new Set();
    const recent = [...st().food].reverse().filter((e) => !seen.has(e.name) && seen.add(e.name)).slice(0, 8);
    $('#foodRecent').innerHTML = recent.length ? `<div class="muted small">Schnell nochmal:</div><div class="chips">${recent.map((e) => `<button class="chip" data-again="${esc(e.id)}">＋ ${esc(e.name)} <span class="muted small">${fmt(e.kcal)}</span></button>`).join('')}</div>` : '';

    // Woche
    const days = Array.from({ length: 7 }, (_, i) => addDays(foodDate, i - 6));
    const sums = days.map((d) => N.totals(dayEntries(d)).kcal);
    const max = Math.max(g ? g.kcal : 0, ...sums, 1) * 1.1;
    const avg = sums.filter(Boolean).length ? Math.round(sums.filter(Boolean).reduce((a, b) => a + b, 0) / sums.filter(Boolean).length) : 0;
    $('#foodWeek').innerHTML = `<h2>Letzte 7 Tage</h2>
      <div class="week-bars">${g ? `<div class="goal-line" style="bottom:${(18 + (g.kcal / max) * 90).toFixed(0)}px"></div>` : ''}${days.map((d, i) => `<div class="wb ${g && sums[i] > g.kcal * 1.05 ? 'over' : ''}"><i style="height:${(sums[i] / max) * 90}px"></i>${new Date(d + 'T12:00').toLocaleDateString('de-DE', { weekday: 'short' }).slice(0, 2)}</div>`).join('')}</div>
      <div class="muted small">Ø ${fmt(avg)} kcal an Tagen mit Einträgen${g ? ` · Ziel ${fmt(g.kcal)} kcal (gestrichelt)` : ''}</div>`;
    renderGoalForm();
  }

  function renderGoalForm() {
    const n = st().settings.nutrition;
    const set = (sel, v) => { if (document.activeElement !== $(sel)) $(sel).value = v ?? ''; };
    set('#fgSex', n.sex || 'w');
    set('#fgAge', n.age);
    set('#fgHeight', st().settings.height);
    set('#fgWeight', latestWeight() != null ? String(latestWeight()).replace('.', ',') : '');
    set('#fgActivity', String(n.activity || 1.375));
    set('#fgGoal', n.goal || 'keep');
    set('#fgManual', n.manual);
    const g = goal();
    $('#foodGoalShort').textContent = g ? `${fmt(g.kcal)} kcal/Tag` : '(noch nicht eingestellt)';
    $('#fgResult').innerHTML = g ? (g.manual ? `Eigenes Ziel: <b>${fmt(g.kcal)} kcal</b> · Eiweiß ${g.protein} g · Kohlenh. ${g.carbs} g · Fett ${g.fat} g`
      : `Grundumsatz ${fmt(g.bmr)} kcal · Gesamtbedarf ${fmt(g.tdee)} kcal<br>Ziel: <b>${fmt(g.kcal)} kcal</b> · Eiweiß ${g.protein} g · Kohlenh. ${g.carbs} g · Fett ${g.fat} g
        <div class="muted">Richtwert nach der Mifflin-St-Jeor-Formel – kein Ersatz für ärztlichen Rat.</div>`)
      : '<span class="muted">Alter, Größe und Gewicht eintragen – dann rechne ich deinen Tagesbedarf aus.</span>';
  }
  $('#fgActivity').innerHTML = Object.entries(N.ACTIVITY).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  $('#fgGoal').innerHTML = Object.entries(N.GOALS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  $('#foodGoalCard').addEventListener('change', (e) => {
    const n = st().settings.nutrition;
    const id = e.target.id;
    if (id === 'fgSex') n.sex = e.target.value;
    if (id === 'fgAge') n.age = parseInt(e.target.value, 10) || null;
    if (id === 'fgHeight') st().settings.height = parseInt(e.target.value, 10) || null;
    if (id === 'fgWeight') {
      const kg = num(e.target.value);
      n.weight = kg;
      if (kg && kg > 20 && kg < 400) st().weights = st().weights.filter((w) => w.date !== today()).concat({ date: today(), kg });
    }
    if (id === 'fgActivity') n.activity = Number(e.target.value);
    if (id === 'fgGoal') n.goal = e.target.value;
    if (id === 'fgManual') n.manual = parseInt(e.target.value, 10) || null;
    A.save(); A.render();
  });

  $('#foodPrev').onclick = () => { foodDate = addDays(foodDate, -1); renderFood(); };
  $('#foodNext').onclick = () => { if (foodDate < today()) { foodDate = addDays(foodDate, 1); renderFood(); } };

  function defaultMeal() {
    return foodDate === today() ? N.mealForHour(new Date().getHours()) : 'mittag';
  }

  function addEntries(list, opts = {}) {
    const ids = [];
    for (const e of list) {
      const entry = { id: A.uid(), date: foodDate, meal: opts.meal || defaultMeal(), created: new Date().toISOString(), ...e };
      st().food.push(entry);
      ids.push(entry.id);
    }
    A.save(); A.render();
    const kcal = list.reduce((s, e) => s + (e.kcal || 0), 0);
    A.toast(`${list.length === 1 ? list[0].name : list.length + ' Einträge'} · ${fmt(kcal)} kcal`, { label: 'Rückgängig', fn: () => { st().food = st().food.filter((x) => !ids.includes(x.id)); A.save(); A.render(); } });
  }

  // =====================================================================
  // Eintrag-Dialog
  // =====================================================================
  const fdDlg = $('#foodDialog');
  let fdEditing = null;
  let fdBase = null; // { grams, kcal, p, c, f } oder per100
  let fdPer100 = null;
  let fdMeal = 'mittag';
  let fdExtra = {};
  $('#fdMeal').innerHTML = Object.entries(N.MEALS).map(([k, v]) => `<button type="button" class="chip" data-meal="${k}">${v}</button>`).join('');
  const setFdMeal = (k) => { fdMeal = k; $$('#fdMeal .chip').forEach((c) => c.classList.toggle('active', c.dataset.meal === k)); };
  $('#fdMeal').addEventListener('click', (e) => { const c = e.target.closest('[data-meal]'); if (c) setFdMeal(c.dataset.meal); });

  function fillValues(v) {
    $('#fdKcal').value = v.kcal != null ? fmt(v.kcal) : '';
    $('#fdP').value = v.p != null ? fmt(v.p, 1) : '';
    $('#fdC').value = v.c != null ? fmt(v.c, 1) : '';
    $('#fdF').value = v.f != null ? fmt(v.f, 1) : '';
  }
  /**
   * t: { name, grams, kcal, p, c, f, per100, portion, portionLabel, photo, source }
   */
  function openFoodDialog(t, editing) {
    fdEditing = editing || null;
    fdPer100 = t.per100 || null;
    fdBase = { grams: t.grams || null, kcal: t.kcal, p: t.p, c: t.c, f: t.f };
    fdExtra = { photo: t.photo || null, source: t.source || 'manual', per100: t.per100 || null };
    $('#foodDlgTitle').textContent = editing ? 'Eintrag bearbeiten' : 'Eintragen';
    $('#fdName').value = t.name || '';
    $('#fdGrams').value = t.grams ? fmt(t.grams) : '';
    if (fdPer100 && t.grams) fillValues(N.scale(fdPer100, t.grams)); else fillValues(t);
    $('#fdPer100').textContent = fdPer100 ? `pro 100 g: ${fmt(fdPer100.kcal)} kcal · E ${fmt(fdPer100.p, 1)} g · K ${fmt(fdPer100.c, 1)} g · F ${fmt(fdPer100.f, 1)} g` : '';
    $('#fdPhoto').hidden = !t.photo;
    if (t.photo) $('#fdPhoto').src = t.photo;
    const portions = [];
    if (t.portion) portions.push([t.portion, `1 ${t.portionLabel} (${t.portion} g)`], [t.portion * 2, `2 × (${t.portion * 2} g)`], [Math.round(t.portion / 2), `½ (${Math.round(t.portion / 2)} g)`]);
    if (fdPer100) portions.push([100, '100 g']);
    $('#fdPortions').innerHTML = portions.map(([g, l]) => `<button type="button" class="chip" data-g="${g}">${esc(l)}</button>`).join('');
    setFdMeal(editing ? editing.meal : (t.meal || defaultMeal()));
    $('#fdDelete').hidden = !editing;
    fdDlg.showModal();
  }
  function rescale() {
    const g = num($('#fdGrams').value);
    if (!g) return;
    if (fdPer100) fillValues(N.scale(fdPer100, g));
    else if (fdBase && fdBase.grams && fdBase.kcal != null) {
      const k = g / fdBase.grams;
      fillValues({ kcal: Math.round(fdBase.kcal * k), p: fdBase.p != null ? fdBase.p * k : null, c: fdBase.c != null ? fdBase.c * k : null, f: fdBase.f != null ? fdBase.f * k : null });
    }
  }
  $('#fdGrams').addEventListener('input', rescale);
  $('#fdPortions').addEventListener('click', (e) => { const c = e.target.closest('[data-g]'); if (c) { $('#fdGrams').value = c.dataset.g; rescale(); } });
  $('#fdCancel').onclick = () => fdDlg.close();
  $('#fdDelete').onclick = () => {
    st().food = st().food.filter((x) => x.id !== fdEditing.id);
    A.save(); fdDlg.close(); A.render();
  };
  $('#foodForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const kcal = num($('#fdKcal').value);
    if (kcal == null) { A.toast('Bitte Kalorien eintragen'); return; }
    const data = {
      name: $('#fdName').value.trim() || 'Essen', grams: num($('#fdGrams').value), kcal: Math.round(kcal),
      p: num($('#fdP').value), c: num($('#fdC').value), f: num($('#fdF').value), meal: fdMeal, ...fdExtra,
    };
    fdDlg.close();
    if (fdEditing) { Object.assign(st().food.find((x) => x.id === fdEditing.id), data); A.save(); A.render(); }
    else addEntries([data], { meal: fdMeal });
    if (A.view !== 'food') A.showView('food');
  });
  $('#foodMeals').addEventListener('click', (e) => {
    const r = e.target.closest('[data-food]');
    if (r) { const en = st().food.find((x) => x.id === r.dataset.food); openFoodDialog(en, en); return; }
    const m = e.target.closest('[data-addmeal]');
    if (m) openSearch(m.dataset.addmeal);
  });
  $('#foodRecent').addEventListener('click', (e) => {
    const c = e.target.closest('[data-again]');
    if (!c) return;
    const src = st().food.find((x) => x.id === c.dataset.again);
    const { id, date, created, meal, photo, ...rest } = src;
    addEntries([rest]);
  });

  // =====================================================================
  // Suche
  // =====================================================================
  const fsDlg = $('#foodSearchDialog');
  let searchMeal = null;
  function openSearch(meal) {
    searchMeal = meal || null;
    $('#fsInput').value = '';
    renderSearch();
    fsDlg.showModal();
    setTimeout(() => $('#fsInput').focus(), 50);
  }
  function renderSearch() {
    const q = $('#fsInput').value;
    const found = q.trim() ? N.searchFoods(q, 20) : N.FOODS.filter((f) => ['Apfel', 'Banane', 'Brötchen', 'Kaffee schwarz', 'Cappuccino', 'Joghurt natur (3,5 %)', 'Nudeln (gekocht)', 'Pizza Margherita'].includes(f.name));
    $('#fsList').innerHTML = found.map((f) => `<button class="pick" data-fid="${f.id}"><b>${esc(f.name)}</b>
      <span class="muted small">${fmt(f.kcal)} kcal/100 g · 1 ${esc(f.portionLabel)} (${f.portion} g) = ${fmt(Math.round((f.kcal * f.portion) / 100))} kcal</span></button>`).join('') ||
      '<p class="muted small">Nichts gefunden – „Selbst eingeben“ oder per Barcode/Nährwerttabelle erfassen.</p>';
  }
  $('#fsInput').addEventListener('input', renderSearch);
  $('#fsList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-fid]');
    if (!b) return;
    const f = N.FOODS.find((x) => x.id === b.dataset.fid);
    fsDlg.close();
    openFoodDialog({ name: f.name, grams: f.portion, per100: { kcal: f.kcal, p: f.p, c: f.c, f: f.f }, portion: f.portion, portionLabel: f.portionLabel, source: 'db', meal: searchMeal });
  });
  $('#fsManual').onclick = () => { fsDlg.close(); openFoodDialog({ name: $('#fsInput').value.trim(), source: 'manual', meal: searchMeal }); };
  $('#fsCancel').onclick = () => fsDlg.close();
  $('#btnFoodSearch').onclick = () => openSearch(null);

  // =====================================================================
  // Barcode (Open Food Facts)
  // =====================================================================
  async function foodFromBarcode(code) {
    A.toast('Suche Nährwerte …');
    try {
      const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,product_name_de,brands,quantity,serving_size,nutriments,image_front_small_url`;
      const j = await (await fetch(url)).json();
      const p = j.status === 1 && j.product;
      const name = p ? [((p.brands || '').split(',')[0] || '').trim(), p.product_name_de || p.product_name].filter(Boolean).join(' ') : '';
      const nf = p && N.fromOpenFoodFacts(p);
      if (!nf) {
        A.toast(p ? 'Keine Nährwerte hinterlegt – bitte Nährwerttabelle fotografieren oder selbst eingeben' : 'Produkt nicht gefunden – Nährwerttabelle fotografieren?');
        openFoodDialog({ name, source: 'barcode' });
        return;
      }
      openFoodDialog({ name: name || 'Produkt ' + code, grams: nf.serving || 100, per100: nf.per100, portion: nf.serving, portionLabel: 'Portion', photo: p.image_front_small_url || null, source: 'barcode' });
    } catch (e) {
      A.toast('Keine Verbindung – bitte selbst eingeben');
      openFoodDialog({ name: '', source: 'manual' });
    }
  }
  $('#btnFoodBarcode').onclick = () => A.scanBarcode(foodFromBarcode);

  // =====================================================================
  // Fotos verkleinern
  // =====================================================================
  async function shrink(file, maxSide, quality) {
    const img = await createImageBitmap(file);
    const k = Math.min(1, maxSide / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return { dataUrl: c.toDataURL('image/jpeg', quality), bitmap: img };
  }

  // =====================================================================
  // Nährwerttabelle fotografieren (Texterkennung)
  // =====================================================================
  $('#labelPhotoInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    A.toast('Lese Nährwerttabelle … (beim ersten Mal lädt die Texterkennung)');
    try {
      const { dataUrl, bitmap } = await shrink(file, 200, 0.6);
      const texts = await A.ocrText(bitmap);
      const per100 = texts.map(N.parseNutritionLabel).find((x) => x && x.kcal);
      if (!per100) { A.toast('Keine Nährwerte erkannt – Tabelle gerade und nah fotografieren, oder selbst eingeben'); openFoodDialog({ name: '', source: 'label', photo: dataUrl }); return; }
      ['p', 'c', 'f'].forEach((k) => { if (per100[k] == null) per100[k] = 0; });
      openFoodDialog({ name: '', grams: 100, per100, source: 'label', photo: dataUrl });
      setTimeout(() => $('#fdName').focus(), 100);
    } catch (err) { A.toast('Texterkennung nicht verfügbar (offline?)'); }
  });

  // =====================================================================
  // Prüf-Dialog (Text/Sprache)
  // =====================================================================
  const mrDlg = $('#mealReview');
  let mrItems = [];
  let mrPhoto = null;
  let mrMeal = 'mittag';
  $('#mrMeal').innerHTML = Object.entries(N.MEALS).map(([k, v]) => `<button type="button" class="chip" data-meal="${k}">${v}</button>`).join('');
  const setMrMeal = (k) => { mrMeal = k; $$('#mrMeal .chip').forEach((c) => c.classList.toggle('active', c.dataset.meal === k)); };
  $('#mrMeal').addEventListener('click', (e) => { const c = e.target.closest('[data-meal]'); if (c) setMrMeal(c.dataset.meal); });

  function openReview(title, photo, status) {
    mrItems = [];
    mrPhoto = photo || null;
    $('#mrTitle').textContent = title;
    $('#mrPhoto').hidden = !photo;
    if (photo) $('#mrPhoto').src = photo;
    $('#mrStatus').innerHTML = status || '';
    setMrMeal(defaultMeal());
    renderReview();
    if (!mrDlg.open) mrDlg.showModal();
  }
  function renderReview() {
    $('#mrList').innerHTML = mrItems.map((it, i) => it.missing
      ? `<div class="mr-item"><span class="mr-name muted">„${esc(it.text)}“ nicht gefunden</span><button class="btn small" data-mrsearch="${i}">Suchen</button></div>`
      : `<div class="mr-item" data-i="${i}"><input type="checkbox" ${it.use ? 'checked' : ''} aria-label="übernehmen">
          <span class="mr-name">${esc(it.name)}</span><input class="mr-g" inputmode="decimal" value="${fmt(it.grams)}" aria-label="Gramm"><span class="small">g</span>
          <span class="mr-k">${fmt(it.kcal)} kcal</span></div>`).join('');
    const chosen = mrItems.filter((i) => i.use && !i.missing);
    const t = N.totals(chosen);
    $('#mrTotal').innerHTML = chosen.length ? `Zusammen: <b>${fmt(t.kcal)} kcal</b> · E ${fmt(t.p)} g · K ${fmt(t.c)} g · F ${fmt(t.f)} g` : '';
    $('#mrSave').disabled = !chosen.length;
  }
  $('#mrList').addEventListener('change', (e) => {
    const row = e.target.closest('[data-i]');
    if (!row) return;
    const it = mrItems[row.dataset.i];
    if (e.target.type === 'checkbox') it.use = e.target.checked;
    else {
      const g = num(e.target.value);
      if (g && it.grams) {
        const k = g / it.grams;
        Object.assign(it, { grams: Math.round(g), kcal: Math.round(it.kcal * k), p: Math.round(it.p * k * 10) / 10, c: Math.round(it.c * k * 10) / 10, f: Math.round(it.f * k * 10) / 10 });
      }
    }
    renderReview();
  });
  $('#mrList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mrsearch]');
    if (!b) return;
    const q = mrItems[b.dataset.mrsearch].text;
    mrDlg.close();
    openSearch(mrMeal);
    $('#fsInput').value = q;
    renderSearch();
  });
  $('#mrCancel').onclick = () => mrDlg.close();
  $('#mrSave').onclick = () => {
    const chosen = mrItems.filter((i) => i.use && !i.missing).map(({ use, missing, text, ...rest }, idx) => ({ ...rest, photo: idx === 0 ? mrPhoto : null }));
    mrDlg.close();
    addEntries(chosen, { meal: mrMeal });
    if (A.view !== 'food') A.showView('food');
  };

  // ---------- Text & Sprache ----------
  function reviewText(text) {
    const parsed = N.parseFoodText(text);
    if (!parsed.length) { A.toast('Nichts erkannt – z. B. „1 Apfel und 2 Scheiben Toast“'); return; }
    if (parsed.length === 1 && parsed[0].food) {
      const { food: f, grams } = parsed[0];
      openFoodDialog({ name: f.name, grams, per100: { kcal: f.kcal, p: f.p, c: f.c, f: f.f }, portion: f.portion, portionLabel: f.portionLabel, source: 'db' });
      return;
    }
    openReview('Erkannt', null, `„${esc(text)}“`);
    mrItems = parsed.map((x) => x.food
      ? { use: true, name: x.food.name, source: 'db', grams: x.grams, ...N.scale({ kcal: x.food.kcal, p: x.food.p, c: x.food.c, f: x.food.f }, x.grams) }
      : { missing: true, text: x.text });
    renderReview();
  }
  $('#foodQuick').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('#foodQuickInput').value.trim();
    if (!v) return;
    $('#foodQuickInput').value = '';
    reviewText(v);
  });
  if (A.listen) $('#micFood').hidden = false;
  $('#micFood').onclick = () => A.listen($('#micFood'), reviewText);

  // Früher gespeicherten KI-Schlüssel (entfernte Funktion) vom Gerät löschen
  try { localStorage.removeItem('alltagsheld.aiKey'); } catch (e) { /* egal */ }

  // =====================================================================
  // Startseite, Mehr, Schnellmenü
  // =====================================================================
  function renderHomeFood() {
    if (A.view !== 'home') return;
    const g = goal();
    const t = N.totals(dayEntries(today()));
    if (!st().food.length && !g) {
      $('#homeFood').innerHTML = `<div class="card home-card"><button class="plain" data-goto="food"><div class="home-title">Kalorien</div>
        <div class="home-line muted">Barcode scannen, Nährwerttabelle fotografieren oder „1 Apfel“ eintippen – ich zähle mit.</div></button>
        <button class="btn small primary" data-goto="food">＋ Mahlzeit eintragen</button></div>`;
      return;
    }
    const left = g ? g.kcal + burnedOn(today()) - t.kcal : null;
    $('#homeFood').innerHTML = `<div class="card home-card"><button class="plain" data-goto="food"><div class="home-title">Kalorien heute</div>
      <div class="home-line"><b>${fmt(t.kcal)}</b>${g ? ` von ${fmt(g.kcal)} kcal · ${left >= 0 ? 'noch ' + fmt(left) : '<span class="warn-text">' + fmt(-left) + ' zu viel</span>'}` : ' kcal'}</div>
      ${g ? `<div class="meter ${left < 0 ? 'over' : ''}"><i style="width:${Math.min(100, (t.kcal / g.kcal) * 100)}%"></i></div>` : ''}</button>
      <div class="row tight"><button class="btn small primary" data-goto="food">＋ Eintragen</button><button class="btn small" data-foodbarcode>Barcode</button></div></div>`;
  }
  function renderHubFood() {
    const g = goal();
    const t = N.totals(dayEntries(today()));
    $('#hubFood').textContent = g ? `${fmt(t.kcal)} / ${fmt(g.kcal)} kcal` : t.kcal ? `${fmt(t.kcal)} kcal heute` : 'Foto, Barcode, Suche';
  }

  A.actions.meal = () => { foodDate = today(); A.showView('food'); };
  document.addEventListener('click', (e) => { if (e.target.closest('[data-foodbarcode]')) { foodDate = today(); A.showView('food'); A.scanBarcode(foodFromBarcode); } });
  A.actions.habit = () => A.showView('habits');
  A.actions.search = () => { A.showView('home'); setTimeout(() => $('#globalSearch').focus(), 50); };
  A.calendarSources.push((from, to) => {
    const g = goal();
    const out = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const list = dayEntries(d);
      if (list.length) out.push({ date: d, kind: 'food', text: `${fmt(N.totals(list).kcal)} kcal gegessen${g ? ` (Ziel ${fmt(g.kcal)})` : ''}`, emoji: '🍽️', go: 'food' });
    }
    return out;
  });
  A.onRender(renderFood);
  A.onRender(renderHomeFood);
  A.onRender(renderHubFood);
  A.onRender(applyTheme);
  A.render();
  const view = new URLSearchParams(location.search).get('view');
  if (view) A.showView(view);
})();
