/* Frischecheck – Vorrat, Einkaufsliste, Rezepte & Wochenplan, Scanner (Barcode + Datum per Texterkennung). */
(() => {
  'use strict';
  const L = window.FridgeLogic;
  const BUILTIN_RECIPES = window.FridgeRecipes;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const STORE = 'frischecheck.v1';
  const LOCATIONS = { kuehlschrank: '🧊 Kühlschrank', gefrierfach: '❄️ Gefrierfach', vorrat: '🗄️ Vorrat', haushalt: '🧴 Bad & Haushalt' };
  const ZXING_URL = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
  const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  /** Lebensmittel, die normalerweise nicht in den Kühlschrank gehören. */
  const PANTRY = new Set(['nudeln', 'reis', 'mehl', 'linsen', 'kichererbsen', 'bohnen', 'mais', 'passata', 'kokosmilch', 'thunfisch',
    'haferflocken', 'schokolade', 'kartoffeln', 'zwiebeln', 'knoblauch', 'getraenk', 'brot', 'tomaten', 'bananen', 'kuerbis', 'wraps', 'gnocchi']);
  const QUICK = ['milch', 'eier', 'butter', 'kaese', 'joghurt', 'sahne', 'quark', 'brot', 'tomaten', 'gurke', 'paprika', 'salat', 'karotten',
    'champignons', 'hackfleisch', 'haehnchen', 'wurst', 'schinken', 'aepfel', 'bananen', 'beeren', 'kartoffeln', 'zwiebeln', 'nudeln'];

  // ---------- Zustand ----------
  const defaults = () => ({
    items: [], products: {}, stats: { consumed: 0, wasted: 0 }, lastNotified: null,
    shopping: [], favorites: [], customRecipes: [], plan: {}, history: [], staples: [],
    events: [], expenses: [], workouts: [], notified: [],
    tasks: [], habits: [], habitLog: {}, weights: [], moods: {}, notes: [], weatherCache: null,
    settings: { weeklyGoal: 3, budget: 0, voice: true, woMinutes: 20, woFocus: 'ganz', woLevel: 1, woQuiet: false, height: null, weightGoal: null, place: null },
  });
  let state = load();
  let undoSnapshot = null;
  let filterLoc = '';
  let editingId = null;
  let ingredientTouched = false;
  let recipeSub = 'suggest';
  const recipeFilters = new Set();

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE));
      if (s && Array.isArray(s.items)) return { ...defaults(), ...s, settings: { ...defaults().settings, ...(s.settings || {}) } };
    } catch (e) { /* leerer Start */ }
    return defaults();
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { toast('Speichern fehlgeschlagen'); }
  }
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ingLabel = (k) => (L.INGREDIENTS[k] ? L.INGREDIENTS[k].label : k);
  const ingEmoji = (k) => (L.INGREDIENTS[k] ? L.INGREDIENTS[k].emoji : '📦');
  const today = () => L.toISODate(new Date());
  const allRecipes = () => BUILTIN_RECIPES.concat(state.customRecipes);
  const findRecipe = (id) => allRecipes().find((r) => r.id === id);
  const defaultLocation = (k) => (PANTRY.has(k) ? 'vorrat' : 'kuehlschrank');

  function sortedItems(by = 'expiry') {
    const byExpiry = (a, b) => {
      if (!a.expiry && !b.expiry) return a.name.localeCompare(b.name, 'de');
      if (!a.expiry) return 1;
      if (!b.expiry) return -1;
      return a.expiry.localeCompare(b.expiry);
    };
    const cmp = {
      expiry: byExpiry,
      name: (a, b) => a.name.localeCompare(b.name, 'de'),
      added: (a, b) => String(b.added || '').localeCompare(String(a.added || '')) || byExpiry(a, b),
      location: (a, b) => Object.keys(LOCATIONS).indexOf(a.location) - Object.keys(LOCATIONS).indexOf(b.location) || byExpiry(a, b),
    }[by] || byExpiry;
    return [...state.items].sort(cmp);
  }

  // ---------- Toast ----------
  let toastTimer;
  /** actions: { label, fn } oder Liste davon */
  function toast(msg, actions) {
    const list = actions ? [].concat(actions) : [];
    const el = $('#toast');
    // Offene Dialoge liegen in der obersten Ebene – die Meldung muss mit hinein, sonst ist sie verdeckt
    const host = [...document.querySelectorAll('dialog[open]')].pop() || document.body;
    if (el.parentElement !== host) host.appendChild(el);
    el.innerHTML = esc(msg) + list.map((a, i) => ` <button class="link" data-i="${i}">${esc(a.label)}</button>`).join('');
    el.hidden = false;
    el.querySelectorAll('button').forEach((b) => (b.onclick = () => { list[b.dataset.i].fn(); el.hidden = true; }));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), list.length ? 6500 : 3000);
  }

  // ---------- Navigation ----------
  let currentView = 'home';
  let previousView = 'settings';
  function showView(name) {
    if (!$('#view-' + name)) return;
    if (name !== currentView) { previousView = currentView; currentView = name; }
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + name));
    $$('.tab[data-view]').forEach((t) => t.classList.toggle('active', t.dataset.view === name || (t.dataset.hub || '').split(' ').includes(name)));
    window.scrollTo(0, 0);
    render();
  }
  $$('.tab[data-view]').forEach((t) => (t.onclick = () => showView(t.dataset.view)));
  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-goto]');
    if (go) { showView(go.dataset.goto); return; }
    if (e.target.closest('[data-back]')) showView(previousView === currentView ? 'settings' : previousView);
  });

  // ---------- Rendern ----------
  function render() {
    renderSummary();
    renderStock();
    renderShopping();
    renderRecipes();
    renderStats();
    renderStaples();
    renderGuide();
    renderHooks.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
  }
  const renderHooks = [];

  function renderSummary() {
    const c = { expired: 0, today: 0, soon: 0 };
    state.items.forEach((i) => { const s = L.status(i.expiry); if (s in c) c[s]++; });
    const parts = [];
    if (c.expired) parts.push(`<span class="pill expired">${c.expired} abgelaufen</span>`);
    if (c.today) parts.push(`<span class="pill today">${c.today} heute</span>`);
    if (c.soon) parts.push(`<span class="pill soon">${c.soon} bald</span>`);
    if (!parts.length && state.items.length) parts.push(`<span class="pill ok">${state.items.length} Produkt${state.items.length === 1 ? '' : 'e'} · alles frisch</span>`);
    $('#summary').innerHTML = parts.join('');
    const urgent = c.expired + c.today;
    $('#badgeStock').hidden = !urgent;
    $('#badgeStock').textContent = urgent;
    const open = state.shopping.filter((i) => !i.done).length;
    $('#badgeShop').hidden = !open;
    $('#badgeShop').textContent = open;
  }

  function renderStock() {
    const q = L.norm($('#search').value.trim());
    const list = sortedItems($('#sortBy').value).filter((i) =>
      (!filterLoc || i.location === filterLoc) &&
      (!q || L.norm(i.name + ' ' + ingLabel(i.ingredient) + ' ' + (i.note || '')).includes(q)));
    const el = $('#stockList');
    if (!state.items.length) {
      el.innerHTML = `<div class="empty"><div class="big-emoji">🧊</div>
        <p><b>Dein Kühlschrank ist noch leer.</b></p>
        <p class="muted">Tippe unten auf <b>＋ Neu</b>: Barcode und Ablaufdatum scannen – oder häufige Lebensmittel mit einem Tipp hinzufügen.</p></div>`;
      return;
    }
    if (!list.length) { el.innerHTML = '<p class="muted center">Nichts gefunden.</p>'; return; }
    el.innerHTML = list.map((i) => {
      const st = L.status(i.expiry);
      const img = i.image
        ? `<img src="${esc(i.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
        : `<span class="emoji">${ingEmoji(i.ingredient)}</span>`;
      const tags = [
        i.opened ? '<span class="tag">geöffnet</span>' : '',
        i.dateType === 'verbrauch' ? '<span class="tag strict">verbrauchen bis</span>' : '',
        i.note ? `<span class="tag note">${esc(i.note)}</span>` : '',
      ].join('');
      const advice = L.expiredAdvice(i);
      return `<article class="item ${st}" data-id="${esc(i.id)}">
        <div class="thumb">${img}</div>
        <div class="info" data-act="edit">
          <div class="name">${esc(i.name)}${i.qty > 1 ? ` <span class="qty">×${i.qty}</span>` : ''}</div>
          <div class="meta">${LOCATIONS[i.location] || ''}${i.expiry ? ' · ' + L.formatDate(i.expiry) : ''}${tags}</div>
          <div class="badge ${st}">${L.statusText(i.expiry)}</div>
          ${advice ? `<div class="advice-line ${i.dateType === 'verbrauch' ? 'strict' : ''}">${esc(advice)}</div>` : ''}
        </div>
        <div class="actions">
          <button class="icon ok" data-act="consume" title="Verbraucht" aria-label="Verbraucht">✓</button>
          <button class="icon bad" data-act="waste" title="Weggeworfen" aria-label="Weggeworfen">🗑</button>
        </div>
      </article>`;
    }).join('');
  }

  $('#stockList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    const card = e.target.closest('.item');
    if (!btn || !card) return;
    const id = card.dataset.id;
    if (btn.dataset.act === 'edit') openItemDialog(state.items.find((i) => i.id === id));
    else takeOut(id, btn.dataset.act === 'waste' ? 'wasted' : 'consumed');
  });
  $('#search').addEventListener('input', renderStock);
  $('#sortBy').addEventListener('change', renderStock);
  $('#locFilter').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    filterLoc = b.dataset.loc;
    $$('#locFilter .chip').forEach((c) => c.classList.toggle('active', c === b));
    renderStock();
  });

  function snapshot() {
    undoSnapshot = JSON.stringify({ items: state.items, stats: state.stats, shopping: state.shopping, history: state.history });
  }
  function undo() {
    if (!undoSnapshot) return;
    Object.assign(state, JSON.parse(undoSnapshot));
    undoSnapshot = null;
    save(); render();
  }

  /** Nimmt ein Stück aus dem Vorrat (Menge −1, bei 0 entfernt) und merkt es für die Statistik. */
  function takeOut(id, kind, quiet) {
    const it = state.items.find((i) => i.id === id);
    if (!it) return;
    if (!quiet) snapshot();
    state.stats[kind] = (state.stats[kind] || 0) + 1;
    state.history.push({ date: today(), kind, name: it.name, ingredient: it.ingredient, price: it.price || null });
    if (state.history.length > 2000) state.history = state.history.slice(-2000);
    let last = false;
    if (it.qty > 1) it.qty--;
    else { state.items = state.items.filter((i) => i.id !== id); last = true; }
    // Grundvorrat aufgebraucht? -> automatisch auf die Einkaufsliste
    const goneCompletely = last && (!it.ingredient || !state.items.some((i) => i.ingredient === it.ingredient));
    let autoShop = false;
    if (goneCompletely && it.ingredient && state.staples.includes(it.ingredient)) autoShop = addToShopping(ingLabel(it.ingredient), it.ingredient, true);
    save(); render();
    if (quiet) return;
    const msg = kind === 'wasted' ? `„${it.name}“ weggeworfen` : `„${it.name}“ verbraucht 👍`;
    const actions = [{ label: 'Rückgängig', fn: undo }];
    if (autoShop) toast(msg + ' · steht jetzt auf der Einkaufsliste', actions);
    else if (goneCompletely && !onShoppingList(it.name, it.ingredient)) {
      actions.push({ label: 'Nachkaufen', fn: () => { addToShopping(it.ingredient ? ingLabel(it.ingredient) : it.name, it.ingredient); save(); render(); toast('Auf die Einkaufsliste gesetzt 🛒'); } });
      toast(msg, actions);
    } else toast(msg, actions);
  }

  // ---------- Einkaufsliste ----------
  function onShoppingList(name, ingredient) {
    const n = L.norm(name);
    return state.shopping.some((s) => !s.done && ((ingredient && s.ingredient === ingredient) || L.norm(s.name) === n));
  }

  /** Fügt einen Eintrag hinzu (ohne Doppelte). Liefert true, wenn neu hinzugefügt. */
  function addToShopping(name, ingredient, quiet, note) {
    name = String(name || '').trim();
    if (!name) return false;
    ingredient = ingredient || L.detectIngredient(name);
    if (onShoppingList(name, ingredient)) return false;
    state.shopping.push({ id: uid(), name, ingredient: ingredient || null, done: false, note: note || '', added: today() });
    if (!quiet) save();
    return true;
  }

  function renderShopping() {
    const el = $('#shopList');
    const open = state.shopping.filter((i) => !i.done);
    const done = state.shopping.filter((i) => i.done);
    const row = (i) => `<div class="shop-item ${i.done ? 'done' : ''}" data-id="${esc(i.id)}">
        <button class="check" data-act="toggle" aria-label="abhaken">${i.done ? '✔' : ''}</button>
        <span class="shop-name" data-act="toggle">${ingEmoji(i.ingredient)} ${esc(i.name)}${i.note ? ` <span class="muted small">· ${esc(i.note)}</span>` : ''}</span>
        <button class="icon-sm" data-act="remove" aria-label="entfernen">✕</button>
      </div>`;
    el.innerHTML = state.shopping.length
      ? open.map(row).join('') + (done.length ? `<h3 class="muted small section">Im Wagen (${done.length})</h3>` + done.map(row).join('') : '')
      : `<div class="empty"><div class="big-emoji">🛒</div><p><b>Die Einkaufsliste ist leer.</b></p>
         <p class="muted">Füge oben etwas hinzu, übernimm fehlende Zutaten aus Rezepten oder lege unter „Mehr“ fest, was immer im Haus sein soll.</p></div>`;
    $('#shopActions').hidden = !state.shopping.length;
    $('#btnShopToStock').hidden = !done.length;
    $('#btnShopClear').hidden = !done.length;

    // Vorschläge: Grundvorrat, der fehlt, und kürzlich Aufgebrauchtes
    const have = new Set(state.items.map((i) => i.ingredient).filter(Boolean));
    const sugg = [];
    for (const k of state.staples) if (!have.has(k) && !onShoppingList(ingLabel(k), k)) sugg.push({ name: ingLabel(k), ingredient: k });
    for (const h of [...state.history].reverse()) {
      if (sugg.length >= 8) break;
      if (h.kind !== 'consumed' || !h.ingredient || have.has(h.ingredient)) continue;
      const name = ingLabel(h.ingredient);
      if (!sugg.some((s) => s.ingredient === h.ingredient) && !onShoppingList(name, h.ingredient)) sugg.push({ name, ingredient: h.ingredient });
    }
    $('#shopSuggestions').innerHTML = sugg.length
      ? `<div class="muted small">Vorschläge:</div><div class="chips">${sugg.map((s) => `<button class="chip" data-name="${esc(s.name)}" data-ing="${s.ingredient}">＋ ${ingEmoji(s.ingredient)} ${esc(s.name)}</button>`).join('')}</div>`
      : '';
    $('#shopSuggest').innerHTML = Object.values(L.INGREDIENTS).map((v) => `<option value="${esc(v.label)}">`).join('');
  }

  $('#shopForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('#shopInput').value.trim();
    if (!v) return;
    // mehrere auf einmal: "Milch, Eier, Brot"
    let added = 0;
    v.split(/[,;\n]+/).forEach((part) => { if (addToShopping(part)) added++; });
    $('#shopInput').value = '';
    save(); render();
    if (!added) toast('Steht schon auf der Liste');
  });
  $('#shopSuggestions').addEventListener('click', (e) => {
    const b = e.target.closest('[data-name]');
    if (!b) return;
    addToShopping(b.dataset.name, b.dataset.ing);
    render();
  });
  $('#shopList').addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]');
    const row = e.target.closest('.shop-item');
    if (!t || !row) return;
    const it = state.shopping.find((i) => i.id === row.dataset.id);
    if (t.dataset.act === 'toggle') it.done = !it.done;
    else state.shopping = state.shopping.filter((i) => i !== it);
    save(); render();
  });
  $('#btnShopClear').onclick = () => {
    state.shopping = state.shopping.filter((i) => !i.done);
    save(); render();
  };
  $('#btnShopToStock').onclick = () => {
    snapshot();
    const done = state.shopping.filter((i) => i.done);
    for (const s of done) {
      state.items.push({
        id: uid(), added: today(), name: s.name, ingredient: s.ingredient, qty: 1,
        expiry: s.ingredient ? L.suggestExpiry(s.ingredient) : null, location: defaultLocation(s.ingredient),
        dateType: 'mhd', barcode: null, image: null,
      });
    }
    state.shopping = state.shopping.filter((i) => !i.done);
    save(); render();
    toast(`${done.length} Produkt${done.length > 1 ? 'e' : ''} im Vorrat – mit typischer Haltbarkeit. Tippe ein Produkt an, um das Datum anzupassen.`, { label: 'Rückgängig', fn: undo });
  };
  $('#btnShopShare').onclick = async () => {
    const open = state.shopping.filter((i) => !i.done).map((i) => ({ name: i.name, ingredient: i.ingredient, note: i.note }));
    const link = location.origin + location.pathname + '#liste=' + L.encodeShare(open);
    const text = L.shoppingText(state.shopping) + '\n\nIn Frischecheck übernehmen: ' + link;
    try {
      if (navigator.share) await navigator.share({ title: 'Einkaufsliste', text });
      else { await navigator.clipboard.writeText(text); toast('Liste kopiert – jetzt z. B. in WhatsApp einfügen'); }
    } catch (e) { /* abgebrochen */ }
  };

  // ---------- Rezepte ----------
  function chefkochUrl(words) {
    return 'https://www.chefkoch.de/rs/s0/' + words.map((w) => encodeURIComponent(w.toLowerCase())).join('+') + '/Rezepte.html';
  }

  function passesFilters(r) {
    const q = L.norm($('#recipeSearch').value.trim());
    if (q && !L.norm(r.name + ' ' + r.ingredients.map(ingLabel).join(' ')).includes(q)) return false;
    if (recipeFilters.has('fav') && !state.favorites.includes(r.id)) return false;
    if (recipeFilters.has('veg') && !L.isVegetarian(r)) return false;
    if (recipeFilters.has('quick') && r.minutes > 20) return false;
    if (recipeFilters.has('own') && !r.custom) return false;
    return true;
  }

  /** Wie gut passt ein Rezept zum Vorrat? (auch für Rezepte ganz ohne Treffer) */
  function matchInfo(recipe) {
    return L.suggestRecipes([recipe], state.items, new Date(), { minCoverage: 0 })[0] ||
      { recipe, used: [], missing: recipe.ingredients.slice(), extras: [], urgent: [], coverage: 0 };
  }

  function recipeCard(r, open) {
    const rec = r.recipe;
    const ing = (k) => `<span class="ing ${r.urgent.includes(k) ? 'urgent' : ''}">${ingEmoji(k)} ${esc(ingLabel(k))}</span>`;
    const pct = Math.round(r.coverage * 100);
    const fav = state.favorites.includes(rec.id);
    const planned = Object.entries(state.plan).filter(([d, id]) => id === rec.id && d >= today()).map(([d]) => L.nextDays(14).find((x) => x.iso === d)).filter(Boolean);
    return `<article class="recipe card" data-id="${esc(rec.id)}">
      <div class="recipe-head">
        <span class="recipe-emoji">${esc(rec.emoji || '🍽️')}</span>
        <div class="grow">
          <h3>${esc(rec.name)}${rec.custom ? ' <span class="tag">eigenes</span>' : ''}</h3>
          <div class="muted small">⏱ ${rec.minutes} Min · ${pct === 100 ? 'alles da ✅' : pct + ' % vorhanden'}${L.isVegetarian(rec) ? ' · 🥕' : ''}${r.urgent.length ? ' · <b class="urgent-text">rettet ' + r.urgent.length + ' bald ablaufende Zutat' + (r.urgent.length > 1 ? 'en' : '') + '</b>' : ''}${planned.length ? ' · 📅 ' + planned.map((p) => p.label).join(', ') : ''}</div>
        </div>
        <button class="star ${fav ? 'on' : ''}" data-fav="${esc(rec.id)}" aria-label="Favorit">${fav ? '★' : '☆'}</button>
      </div>
      ${r.used.length || r.extras.length ? `<div class="ings"><span class="label">Hast du:</span> ${[...r.used, ...r.extras].map(ing).join(' ')}</div>` : ''}
      ${r.missing.length ? `<div class="ings missing"><span class="label">Fehlt:</span> ${r.missing.map((k) => `<span class="ing">${ingEmoji(k)} ${esc(ingLabel(k))}</span>`).join(' ')}</div>` : ''}
      <div class="row tight">
        <button class="btn small" data-plan="${esc(rec.id)}">📅 Einplanen</button>
        ${r.missing.length ? `<button class="btn small" data-shop="${esc(rec.id)}">🛒 Fehlendes (${r.missing.length})</button>` : ''}
      </div>
      <details${open ? ' open' : ''}>
        <summary>Zubereitung</summary>
        <ol>${rec.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
        <p class="muted small">Salz, Pfeffer, Öl und Gewürze setze ich als vorhanden voraus.</p>
        <div class="row tight">
          <button class="btn small primary" data-cookmode="${esc(rec.id)}">👨‍🍳 Kochmodus</button>
          <button class="btn small" data-cook="${esc(rec.id)}">🍽️ Gekocht – Zutaten austragen</button>
          ${rec.custom ? `<button class="btn small" data-edit="${esc(rec.id)}">✏️ Bearbeiten</button>` : `<a class="btn small" target="_blank" rel="noopener" href="${chefkochUrl([rec.name])}">Varianten auf Chefkoch ↗</a>`}
        </div>
      </details>
    </article>`;
  }

  function renderRecipes() {
    $$('#recipeTabs button').forEach((b) => b.classList.toggle('active', b.dataset.sub === recipeSub));
    $$('#view-recipes .sub').forEach((s) => s.classList.toggle('active', s.id === 'sub-' + recipeSub));
    $('#recipeFilters').hidden = recipeSub === 'plan';
    $$('#recipeFilters .chip').forEach((c) => c.classList.toggle('active', recipeFilters.has(c.dataset.filter)));
    if (recipeSub === 'suggest') renderSuggestions();
    else if (recipeSub === 'plan') renderPlan();
    else renderAllRecipes();
  }

  let surpriseId = null;
  function renderSuggestions() {
    const sr = surpriseId && findRecipe(surpriseId);
    $('#surpriseBox').innerHTML = sr ? `<div class="surprise"><div class="muted small">🎲 Wie wäre es heute mit …</div>${recipeCard(matchInfo(sr), true)}</div>` : '';
    const urgentItems = sortedItems().filter((i) => i.expiry && L.daysUntil(i.expiry) <= 3 && i.location !== 'haushalt');
    const urgentIngs = [...new Set(urgentItems.map((i) => i.ingredient).filter(Boolean))];
    const ub = $('#urgentBox');
    if (urgentItems.length) {
      ub.innerHTML = `<div class="card warn">
        <h2>Jetzt verbrauchen</h2>
        <div class="chips">${urgentItems.map((i) => `<span class="chip static ${L.status(i.expiry)}">${ingEmoji(i.ingredient)} ${esc(i.name)} · ${L.statusText(i.expiry)}</span>`).join('')}</div>
        ${urgentIngs.length ? `<a class="btn small" target="_blank" rel="noopener" href="${chefkochUrl(urgentIngs.slice(0, 3).map(ingLabel))}">Mehr Rezepte mit ${esc(urgentIngs.slice(0, 3).map(ingLabel).join(', '))} auf Chefkoch ↗</a>` : ''}
      </div>`;
    } else ub.innerHTML = '';

    const el = $('#recipeList');
    if (!state.items.length) { el.innerHTML = '<p class="muted center">Füge Produkte hinzu, dann schlage ich passende Rezepte vor. Alle Rezepte findest du unter „📚 Alle“.</p>'; return; }
    const res = L.suggestRecipes(allRecipes(), state.items, new Date(), { minCoverage: $('#showAll').checked ? 0.25 : 0.5 })
      .filter((r) => passesFilters(r.recipe));
    el.innerHTML = res.length
      ? res.slice(0, 30).map(recipeCard).join('')
      : `<p class="muted center">Mit deinem aktuellen Vorrat${recipeFilters.size ? ' und den gewählten Filtern' : ''} passt noch kein Rezept.
          Aktiviere „auch Rezepte zeigen …“ oder schau unter „📚 Alle“.</p>`;
  }

  function renderAllRecipes() {
    const list = allRecipes().filter(passesFilters).map(matchInfo)
      .sort((a, b) => b.coverage - a.coverage || a.recipe.name.localeCompare(b.recipe.name, 'de'));
    $('#allRecipeList').innerHTML = list.length ? list.map(recipeCard).join('') : '<p class="muted center">Kein Rezept passt zu den Filtern.</p>';
  }

  function renderPlan() {
    const days = L.nextDays(7);
    $('#planList').innerHTML = days.map((d) => {
      const rec = findRecipe(state.plan[d.iso]);
      if (!rec) return `<div class="plan-day"><b>${d.label}</b><button class="btn small" data-pickday="${d.iso}">＋ Rezept wählen</button></div>`;
      const missing = L.missingIngredients(rec, state.items);
      return `<div class="plan-day filled">
        <b>${d.label}</b>
        <span class="plan-recipe" data-pickday="${d.iso}">${esc(rec.emoji || '🍽️')} ${esc(rec.name)}
          <span class="muted small">${missing.length ? '· fehlt: ' + esc(missing.map(ingLabel).join(', ')) : '· alles da ✅'}</span></span>
        <button class="icon-sm" data-unplan="${d.iso}" aria-label="entfernen">✕</button>
      </div>`;
    }).join('');
  }

  $('#recipeTabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sub]');
    if (!b) return;
    recipeSub = b.dataset.sub;
    renderRecipes();
  });
  $('#recipeFilters').addEventListener('click', (e) => {
    const c = e.target.closest('[data-filter]');
    if (!c) return;
    const f = c.dataset.filter;
    recipeFilters.has(f) ? recipeFilters.delete(f) : recipeFilters.add(f);
    renderRecipes();
  });
  $('#recipeSearch').addEventListener('input', renderRecipes);
  $('#showAll').addEventListener('change', renderRecipes);

  /** Nicht vorhandene Zutaten auf die Einkaufsliste. */
  function shopMissing(recipes) {
    let n = 0;
    for (const rec of recipes) {
      for (const k of L.missingIngredients(rec, state.items)) if (addToShopping(ingLabel(k), k, true, rec.name)) n++;
    }
    save(); render();
    return n;
  }

  function cook(recipe) {
    snapshot();
    const names = [];
    for (const k of recipe.ingredients) {
      const it = sortedItems().find((i) => i.ingredient === k); // das am frühesten ablaufende
      if (it) { names.push(it.name); takeOut(it.id, 'consumed', true); }
    }
    for (const [d, id] of Object.entries(state.plan)) if (id === recipe.id && d <= today()) delete state.plan[d];
    save(); render();
    toast(names.length ? `Ausgetragen: ${names.join(', ')}` : 'Nichts ausgetragen', { label: 'Rückgängig', fn: undo });
  }

  // Ein Handler für alle Rezeptkarten (Vorschläge + Alle)
  $('#view-recipes').addEventListener('click', (e) => {
    const t = e.target.closest('[data-fav],[data-plan],[data-shop],[data-cook],[data-cookmode],[data-edit],[data-pickday],[data-unplan]');
    if (!t) return;
    const d = t.dataset;
    if (d.fav) {
      state.favorites = state.favorites.includes(d.fav) ? state.favorites.filter((x) => x !== d.fav) : state.favorites.concat(d.fav);
      save(); renderRecipes();
    } else if (d.plan) {
      const rec = findRecipe(d.plan);
      openPicker(`„${rec.name}“ einplanen für …`, L.nextDays(7).map((day) => {
        const other = findRecipe(state.plan[day.iso]);
        return { id: day.iso, label: day.label, sub: other ? 'ersetzt: ' + other.name : 'frei' };
      }), (iso) => { state.plan[iso] = rec.id; save(); render(); toast(`📅 ${rec.name} eingeplant`, { label: 'Zum Wochenplan', fn: () => { recipeSub = 'plan'; renderRecipes(); } }); }, false);
    } else if (d.shop) {
      const n = shopMissing([findRecipe(d.shop)]);
      toast(n ? `${n} Zutat${n > 1 ? 'en' : ''} auf der Einkaufsliste 🛒` : 'Steht schon alles auf der Liste');
    } else if (d.cook) cook(findRecipe(d.cook));
    else if (d.cookmode) openCookMode(findRecipe(d.cookmode));
    else if (d.edit) openRecipeDialog(findRecipe(d.edit));
    else if (d.unplan) { delete state.plan[d.unplan]; save(); renderRecipes(); }
    else if (d.pickday) {
      const ranked = L.suggestRecipes(allRecipes(), state.items, new Date(), { minCoverage: 0 });
      const rest = allRecipes().filter((r) => !ranked.some((x) => x.recipe.id === r.id));
      const label = L.nextDays(7).find((x) => x.iso === d.pickday).label;
      openPicker(`Rezept für ${label}`, ranked.map((x) => ({ id: x.recipe.id, label: `${x.recipe.emoji || '🍽️'} ${x.recipe.name}`, sub: x.missing.length ? 'fehlt: ' + x.missing.map(ingLabel).join(', ') : 'alles da ✅' }))
        .concat(rest.map((r) => ({ id: r.id, label: `${r.emoji || '🍽️'} ${r.name}`, sub: 'fehlt: ' + r.ingredients.map(ingLabel).join(', ') }))),
      (id) => { state.plan[d.pickday] = id; save(); renderRecipes(); }, true);
    }
  });

  $('#btnPlanShop').onclick = () => {
    const recs = L.nextDays(7).map((d) => findRecipe(state.plan[d.iso])).filter(Boolean);
    if (!recs.length) { toast('Plane zuerst ein paar Rezepte ein'); return; }
    const n = shopMissing(recs);
    toast(n ? `${n} Zutat${n > 1 ? 'en' : ''} auf der Einkaufsliste 🛒` : 'Du hast schon alles (oder es steht auf der Liste) 👍',
      n ? { label: 'Zur Liste', fn: () => showView('shopping') } : undefined);
  };

  // ---------- Auswahl-Dialog ----------
  const pickDlg = $('#pickDialog');
  let pickItems = [];
  let pickCb = null;
  function openPicker(title, items, cb, searchable) {
    $('#pickTitle').textContent = title;
    pickItems = items; pickCb = cb;
    $('#pickSearch').hidden = !searchable;
    $('#pickSearch').value = '';
    renderPicker();
    pickDlg.showModal();
  }
  function renderPicker() {
    const q = L.norm($('#pickSearch').value.trim());
    $('#pickList').innerHTML = pickItems.filter((i) => !q || L.norm(i.label + ' ' + (i.sub || '')).includes(q)).slice(0, 80)
      .map((i) => `<button class="pick" data-id="${esc(i.id)}"><b>${esc(i.label)}</b>${i.sub ? `<span class="muted small">${esc(i.sub)}</span>` : ''}</button>`).join('');
  }
  $('#pickSearch').addEventListener('input', renderPicker);
  $('#pickList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (!b) return;
    pickDlg.close();
    pickCb(b.dataset.id);
  });
  $('#pickCancel').onclick = () => pickDlg.close();

  // ---------- Eigene Rezepte ----------
  const recDlg = $('#recipeDialog');
  let editingRecipe = null;
  $('#rIngredients').innerHTML = Object.entries(L.INGREDIENTS)
    .sort((a, b) => a[1].label.localeCompare(b[1].label, 'de'))
    .map(([k, v]) => `<button type="button" class="chip" data-k="${k}">${v.emoji} ${esc(v.label)}</button>`).join('');
  $('#rIngredients').addEventListener('click', (e) => {
    const c = e.target.closest('[data-k]');
    if (c) c.classList.toggle('active');
  });
  function openRecipeDialog(rec) {
    editingRecipe = rec || null;
    $('#recipeTitle').textContent = rec ? 'Rezept bearbeiten' : 'Eigenes Rezept';
    $('#rName').value = rec ? rec.name : '';
    $('#rEmoji').value = rec ? rec.emoji : '';
    $('#rMinutes').value = rec ? rec.minutes : 30;
    $('#rSteps').value = rec ? rec.steps.join('\n') : '';
    $$('#rIngredients .chip').forEach((c) => c.classList.toggle('active', !!rec && rec.ingredients.includes(c.dataset.k)));
    $('#rDelete').hidden = !rec;
    recDlg.showModal();
  }
  $('#btnNewRecipe').onclick = () => openRecipeDialog(null);
  $('#rCancel').onclick = () => recDlg.close();
  $('#rDelete').onclick = () => {
    if (!confirm(`„${editingRecipe.name}“ löschen?`)) return;
    state.customRecipes = state.customRecipes.filter((r) => r.id !== editingRecipe.id);
    state.favorites = state.favorites.filter((id) => id !== editingRecipe.id);
    save(); recDlg.close(); render();
  };
  $('#recipeForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const ingredients = $$('#rIngredients .chip.active').map((c) => c.dataset.k);
    if (!ingredients.length) { toast('Bitte mindestens eine Hauptzutat antippen'); return; }
    const rec = {
      id: editingRecipe ? editingRecipe.id : 'own-' + uid(),
      custom: true,
      name: $('#rName').value.trim() || 'Mein Rezept',
      emoji: $('#rEmoji').value.trim() || '🍽️',
      minutes: Math.max(1, parseInt($('#rMinutes').value, 10) || 30),
      ingredients, optional: [],
      steps: $('#rSteps').value.split('\n').map((s) => s.trim()).filter(Boolean),
    };
    if (!rec.steps.length) rec.steps = ['Nach eigenem Rezept zubereiten.'];
    state.customRecipes = state.customRecipes.filter((r) => r.id !== rec.id).concat(rec);
    save(); recDlg.close();
    recipeSub = 'all'; render();
    toast(`„${rec.name}“ gespeichert`);
  });

  // ---------- Statistik, Grundvorrat, Ratgeber ----------
  function renderStats() {
    const { consumed = 0, wasted = 0 } = state.stats;
    const total = consumed + wasted;
    const rate = total ? Math.round((consumed / total) * 100) : null;
    const months = L.monthlyStats(state.history, 6);
    const max = Math.max(1, ...months.map((m) => m.consumed + m.wasted));
    const wastedValue = state.history.filter((h) => h.kind === 'wasted').reduce((s, h) => s + (h.price || 0), 0);
    const top = L.topWasted(state.history);
    $('#stats').innerHTML = `
      <div class="statgrid">
        <div><b>${state.items.length}</b><span>im Vorrat</span></div>
        <div><b>${consumed}</b><span>verbraucht</span></div>
        <div><b>${wasted}</b><span>weggeworfen</span></div>
        <div><b>${rate === null ? '–' : rate + ' %'}</b><span>gerettet</span></div>
      </div>
      ${state.history.length ? `<div class="bars" aria-label="Verlauf der letzten 6 Monate">${months.map((m) => `
        <div class="bar" title="${m.label}: ${m.consumed} verbraucht, ${m.wasted} weggeworfen">
          <div class="stack" style="height:${Math.round(((m.consumed + m.wasted) / max) * 100)}%">
            <i class="w" style="flex:${m.wasted}"></i><i class="c" style="flex:${m.consumed}"></i>
          </div><span>${m.label}</span></div>`).join('')}</div>
        <div class="legend small muted"><i class="c"></i> verbraucht <i class="w"></i> weggeworfen</div>` : ''}
      ${wastedValue ? `<p class="small">Wert der weggeworfenen Lebensmittel: <b>${L.formatEuro(wastedValue)}</b></p>` : ''}
      ${top.length ? `<p class="small">Landet am häufigsten im Müll: ${top.map((t) => `<b>${esc(t.name)}</b> (${t.times}×)`).join(', ')} – vielleicht kleinere Packungen kaufen?</p>` : ''}`;
  }

  function renderStaples() {
    const keys = [...new Set(QUICK.concat(state.staples))];
    $('#staples').innerHTML = keys.map((k) => `<button class="chip ${state.staples.includes(k) ? 'active' : ''}" data-k="${k}">${ingEmoji(k)} ${esc(ingLabel(k))}</button>`).join('');
  }
  $('#staples').addEventListener('click', (e) => {
    const c = e.target.closest('[data-k]');
    if (!c) return;
    const k = c.dataset.k;
    state.staples = state.staples.includes(k) ? state.staples.filter((x) => x !== k) : state.staples.concat(k);
    save(); render();
  });

  function renderGuide() {
    const q = L.norm($('#guideSearch').value.trim());
    if (!q) { $('#guideList').innerHTML = ''; return; }
    const hits = Object.entries(L.CARE).filter(([k]) => L.norm(ingLabel(k) + ' ' + L.INGREDIENTS[k].terms.join(' ')).includes(q));
    $('#guideList').innerHTML = hits.length ? hits.map(([k, c]) => `<div class="guide-item">
        <b>${ingEmoji(k)} ${esc(ingLabel(k))}</b>
        <div class="small">${esc(c.tip)}</div>
        <div class="muted small">Geöffnet: ca. ${c.opened >= 60 ? Math.round(c.opened / 30) + ' Monate' : c.opened + ' Tag' + (c.opened === 1 ? '' : 'e')} ·
          Einfrieren: ${c.freeze ? 'bis ' + c.freeze + ' Monat' + (c.freeze > 1 ? 'e' : '') : 'nicht empfohlen'}</div></div>`).join('')
      : '<p class="muted small">Dazu habe ich noch keinen Tipp.</p>';
  }
  $('#guideSearch').addEventListener('input', renderGuide);

  // ---------- Überrasch mich ----------
  $('#btnSurprise').onclick = () => {
    const ranked = L.suggestRecipes(allRecipes(), state.items, new Date(), { minCoverage: 0.5 }).filter((r) => passesFilters(r.recipe)).slice(0, 8).map((r) => r.recipe);
    const pool = (ranked.length ? ranked : allRecipes().filter(passesFilters)).filter((r) => r.id !== surpriseId);
    if (!pool.length) { toast('Kein Rezept passt zu den Filtern'); return; }
    surpriseId = pool[Math.floor(Math.random() * pool.length)].id;
    renderSuggestions();
  };

  // ---------- Spracheingabe ----------
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  function listen(btn, onText) {
    const rec = new SpeechRec();
    rec.lang = 'de-DE';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    btn.classList.add('listening');
    toast('🎤 Ich höre zu …');
    let got = false;
    rec.onresult = (e) => { got = true; onText(e.results[0][0].transcript); };
    rec.onerror = (e) => toast(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Mikrofon ist nicht erlaubt (Browser-Einstellungen)' : 'Nicht verstanden – bitte nochmal');
    rec.onend = () => { btn.classList.remove('listening'); if (!got) $('#toast').hidden = true; };
    try { rec.start(); } catch (e) { btn.classList.remove('listening'); }
  }
  if (SpeechRec) { $('#micShop').hidden = false; $('#micItem').hidden = false; }
  $('#micShop').onclick = () => listen($('#micShop'), (text) => {
    const added = [];
    for (const it of L.parseSpokenList(text)) if (addToShopping(it.name, null, true, it.qty > 1 ? it.qty + '×' : '')) added.push(it.name);
    save(); render();
    toast(added.length ? `🛒 ${added.join(', ')}` : `„${text}“ – steht schon auf der Liste`);
  });
  $('#micItem').onclick = () => listen($('#micItem'), (text) => {
    const it = L.parseSpokenItem(text);
    $('#fName').value = it.name;
    $('#fQty').value = it.qty;
    const k = L.detectIngredient(it.name);
    if (k && !ingredientTouched) { ingSelect.value = k; $('#fLocation').value = defaultLocation(k); }
    if (it.expiry) setExpiry(it.expiry);
    updateAdvice();
    toast(it.expiry ? `${it.name} · ${L.formatDate(it.expiry)}` : `${it.name} – Datum noch eintippen oder scannen`);
  });

  // ---------- Kassenbon ----------
  const receiptDlg = $('#receiptDialog');
  let receiptItems = [];
  let receiptTotal = 0;
  $('#receiptInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (dlg.open) dlg.close();
    receiptItems = [];
    receiptTotal = 0;
    renderReceipt();
    $('#receiptStatus').textContent = 'Lese Kassenbon … (beim ersten Mal lädt die Texterkennung, das dauert etwas)';
    receiptDlg.showModal();
    try {
      const img = await createImageBitmap(file);
      const res = await ocrReceipt(img);
      receiptTotal = res.total || Math.round(res.items.reduce((sum, r) => sum + r.price, 0) * 100) / 100;
      receiptItems = res.items.map((r) => ({ ...r, use: !!r.ingredient }));
      $('#receiptStatus').textContent = receiptItems.length
        ? `${receiptItems.length} Produkte erkannt. Haken = kommt in den Vorrat (Namen kannst du ändern).`
        : 'Keine Produkte erkannt. Tipp: Bon glatt hinlegen, gut beleuchtet und nur den Bon fotografieren.';
    } catch (err) {
      $('#receiptStatus').textContent = 'Texterkennung nicht verfügbar (offline?).';
    }
    renderReceipt();
  });
  function renderReceipt() {
    $('#receiptList').innerHTML = receiptItems.map((r, i) => `<div class="receipt-row" data-i="${i}">
        <input type="checkbox" ${r.use ? 'checked' : ''} aria-label="übernehmen">
        <span class="emoji-sm">${ingEmoji(r.ingredient)}</span>
        <input class="rname" value="${esc(r.name)}">
        <span class="price">${L.formatEuro(r.price)}</span>
      </div>`).join('');
    const n = receiptItems.filter((r) => r.use).length;
    $('#receiptExpWrap').hidden = !receiptTotal;
    $('#receiptExpText').textContent = `Bon über ${L.formatEuro(receiptTotal)} als Ausgabe (Lebensmittel) buchen`;
    $('#receiptSave').disabled = !n && !(receiptTotal && $('#receiptAsExpense').checked);
    $('#receiptSave').textContent = n ? `${n} in den Vorrat` : 'Ausgabe buchen';
  }
  $('#receiptList').addEventListener('change', (e) => {
    const row = e.target.closest('.receipt-row');
    if (!row) return;
    const r = receiptItems[row.dataset.i];
    if (e.target.type === 'checkbox') r.use = e.target.checked;
    else { r.name = e.target.value.trim() || r.name; r.ingredient = L.detectIngredient(r.name); }
    renderReceipt();
  });
  $('#receiptAsExpense').addEventListener('change', renderReceipt);
  $('#receiptCancel').onclick = () => receiptDlg.close();
  $('#receiptSave').onclick = () => {
    snapshot();
    const chosen = receiptItems.filter((r) => r.use);
    for (const r of chosen) {
      state.items.push({
        id: uid(), added: today(), name: r.name, ingredient: r.ingredient, qty: 1,
        expiry: r.ingredient ? L.suggestExpiry(r.ingredient) : null, location: defaultLocation(r.ingredient),
        dateType: ['hackfleisch', 'haehnchen', 'fisch', 'lachs'].includes(r.ingredient) ? 'verbrauch' : 'mhd',
        price: r.price, barcode: null, image: null,
      });
      if (r.ingredient) state.shopping = state.shopping.filter((s) => s.done || s.ingredient !== r.ingredient);
    }
    const booked = receiptTotal && $('#receiptAsExpense').checked;
    if (booked) state.expenses.push({ id: uid(), date: today(), amount: receiptTotal, category: 'lebensmittel', note: 'Einkauf (Kassenbon)', created: new Date().toISOString() });
    save(); receiptDlg.close(); render();
    toast(`${chosen.length} Produkte im Vorrat${booked ? ` · ${L.formatEuro(receiptTotal)} als Ausgabe gebucht` : ''} – mit typischer Haltbarkeit. Antippen zum Anpassen.`, { label: 'Rückgängig', fn: undo });
  };

  // ---------- Kochmodus ----------
  const cookDlg = $('#cookDialog');
  let cookRecipe = null;
  let cookIdx = 0;
  let wakeLock = null;
  const timers = []; // { label, end }
  let timerTick = null;

  async function openCookMode(rec) {
    cookRecipe = rec;
    cookIdx = 0;
    renderCook();
    cookDlg.showModal();
    try { if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { /* nicht unterstützt */ }
  }
  function closeCookMode() {
    if (cookDlg.open) cookDlg.close();
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  }
  function renderCook() {
    const steps = cookRecipe.steps;
    $('#cookTitle').textContent = `${cookRecipe.emoji || '🍽️'} ${cookRecipe.name}`;
    $('#cookCount').textContent = `Schritt ${cookIdx + 1} von ${steps.length}`;
    $('#cookStep').textContent = steps[cookIdx];
    $('#cookStepTimers').innerHTML = L.findTimers(steps[cookIdx])
      .map((m) => `<button class="chip" data-min="${m}">⏲️ Timer ${m >= 60 ? L.formatTimer(m * 60).replace(/:00$/, '') + ' Std' : m + ' Min'}</button>`).join('');
    $('#cookPrev').disabled = cookIdx === 0;
    $('#cookNext').textContent = cookIdx === steps.length - 1 ? 'Fertig 🍽️' : 'Weiter →';
    renderTimers();
  }
  $('#cookPrev').onclick = () => { if (cookIdx > 0) { cookIdx--; renderCook(); } };
  $('#cookNext').onclick = () => {
    if (cookIdx < cookRecipe.steps.length - 1) { cookIdx++; renderCook(); return; }
    const rec = cookRecipe;
    closeCookMode();
    toast('Guten Appetit! 😋', { label: 'Zutaten austragen', fn: () => cook(rec) });
  };
  $('#cookClose').onclick = closeCookMode;
  cookDlg.addEventListener('close', () => { if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; } });
  document.addEventListener('visibilitychange', async () => {
    // Wake-Lock geht beim Wechsel der App verloren -> neu anfordern
    if (!document.hidden && cookDlg.open && navigator.wakeLock && !wakeLock) try { wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { /* egal */ }
  });
  $('#cookStepTimers').addEventListener('click', (e) => {
    const c = e.target.closest('[data-min]');
    if (!c) return;
    timers.push({ label: `${cookRecipe.name}, Schritt ${cookIdx + 1}`, end: Date.now() + Number(c.dataset.min) * 60000 });
    if (!timerTick) timerTick = setInterval(tickTimers, 1000);
    renderTimers();
  });
  $('#cookTimers').addEventListener('click', (e) => {
    const b = e.target.closest('[data-stop]');
    if (!b) return;
    timers.splice(Number(b.dataset.stop), 1);
    renderTimers();
  });
  function renderTimers() {
    $('#cookTimers').innerHTML = timers.map((t, i) => {
      const left = (t.end - Date.now()) / 1000;
      return `<div class="timer ${left <= 0 ? 'done' : ''}">⏲️ <b>${left <= 0 ? 'Fertig!' : L.formatTimer(left)}</b> <span class="muted small">${esc(t.label)}</span>
        <button class="icon-sm" data-stop="${i}" aria-label="Timer beenden">✕</button></div>`;
    }).join('');
  }
  function tickTimers() {
    for (const t of timers) {
      if (!t.rang && t.end <= Date.now()) { t.rang = true; alarm(t.label); }
    }
    if (!timers.length) { clearInterval(timerTick); timerTick = null; }
    renderTimers();
  }
  let audioCtx = null;
  /** Kurze Töne (z. B. Timer, Trainingswechsel). */
  function beep(times = 3, freq = 880, len = 0.25) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      for (let i = 0; i < times; i++) {
        const t = i * (len + 0.15);
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.frequency.value = freq; o.connect(g); g.connect(audioCtx.destination);
        g.gain.setValueAtTime(0.25, audioCtx.currentTime + t);
        o.start(audioCtx.currentTime + t); o.stop(audioCtx.currentTime + t + len);
      }
    } catch (e) { /* kein Ton */ }
  }
  function alarm(label) {
    if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 600]);
    beep();
    toast(`⏲️ Timer abgelaufen: ${label}`);
    if ('Notification' in window && Notification.permission === 'granted') {
      navigator.serviceWorker && navigator.serviceWorker.getRegistration()
        .then((reg) => reg ? reg.showNotification('⏲️ Timer abgelaufen', { body: label, tag: 'timer' }) : new Notification('⏲️ Timer abgelaufen', { body: label }))
        .catch(() => {});
    }
  }

  // ---------- Produkt-Dialog ----------
  const dlg = $('#itemDialog');
  const ingSelect = $('#fIngredient');
  ingSelect.innerHTML = '<option value="">– sonstiges –</option>' +
    Object.entries(L.INGREDIENTS)
      .sort((a, b) => a[1].label.localeCompare(b[1].label, 'de'))
      .map(([k, v]) => `<option value="${k}">${v.emoji} ${esc(v.label)}</option>`).join('');
  $('#quickAdd').innerHTML = QUICK.map((k) => `<button type="button" class="chip" data-k="${k}">${ingEmoji(k)} ${esc(ingLabel(k))}</button>`).join('');

  function openItemDialog(item) {
    editingId = item ? item.id : null;
    ingredientTouched = !!item;
    $('#itemTitle').textContent = item ? 'Produkt bearbeiten' : 'Produkt hinzufügen';
    $('#fName').value = item ? item.name : '';
    ingSelect.value = item ? item.ingredient || '' : '';
    setExpiry(item ? item.expiry || '' : '');
    $('#fQty').value = item ? item.qty : 1;
    $('#fLocation').value = item ? item.location : (filterLoc || 'kuehlschrank');
    $('#fBarcode').value = item ? item.barcode || '' : '';
    $('#fImage').value = item ? item.image || '' : '';
    $('#fDateType').value = item ? item.dateType || 'mhd' : 'mhd';
    $('#fPrice').value = item && item.price ? String(item.price).replace('.', ',') : '';
    $('#fNote').value = item ? item.note || '' : '';
    $('#fOpened').value = item ? item.opened || '' : '';
    $('#btnDelete').hidden = !item;
    $('#itemTools').hidden = !item;
    $('#quickAddBox').hidden = !!item;
    $('#quickAddBox').open = false;
    $('#btnOpened').textContent = item && item.opened ? `🥛 geöffnet am ${L.formatDate(item.opened)}` : '🥛 Heute geöffnet';
    $('#dateCandidates').innerHTML = '';
    showPreview(item && item.image ? { image: item.image, name: item.name } : null);
    updateAdvice();
    dlg.showModal();
  }

  function updateAdvice() {
    const k = ingSelect.value;
    const care = L.CARE[k];
    const advice = L.expiredAdvice({ expiry: $('#fExpiry').value, dateType: $('#fDateType').value });
    const parts = [];
    if (advice) parts.push(`<b>${esc(advice)}</b>`);
    if (care) parts.push(`💡 ${esc(care.tip)}`);
    $('#itemAdvice').innerHTML = parts.join('<br>');
    $('#itemAdvice').hidden = !parts.length;
  }

  function showPreview(p) {
    const el = $('#productPreview');
    if (!p) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.innerHTML = `${p.image ? `<img src="${esc(p.image)}" alt="" referrerpolicy="no-referrer">` : ''}
      <div><b>${esc(p.name || 'Unbekanntes Produkt')}</b>${p.info ? `<div class="muted small">${esc(p.info)}</div>` : ''}</div>`;
  }

  const actions = {
    product: () => openItemDialog(null),
    receipt: () => $('#receiptInput').click(),
    shopping: () => { showView('shopping'); setTimeout(() => $('#shopInput').focus(), 50); },
  };
  $('#btnAdd').onclick = () => $('#actionSheet').showModal();
  $('#sheetCancel').onclick = () => $('#actionSheet').close();
  $('#actionSheet').addEventListener('click', (e) => {
    if (e.target === $('#actionSheet')) { $('#actionSheet').close(); return; } // Tipp auf den Hintergrund
    const b = e.target.closest('[data-action]');
    if (!b) return;
    $('#actionSheet').close();
    (actions[b.dataset.action] || (() => {}))();
  });
  $('#btnCancel').onclick = () => dlg.close();
  $('#btnDelete').onclick = () => {
    snapshot();
    const it = state.items.find((i) => i.id === editingId);
    state.items = state.items.filter((i) => i.id !== editingId);
    save(); dlg.close(); render();
    toast(`„${it.name}“ gelöscht`, { label: 'Rückgängig', fn: undo });
  };

  $('#quickAdd').addEventListener('click', (e) => {
    const c = e.target.closest('[data-k]');
    if (!c) return;
    const k = c.dataset.k;
    $('#fName').value = ingLabel(k);
    ingSelect.value = k;
    ingredientTouched = true;
    $('#fLocation').value = defaultLocation(k);
    $('#fDateType').value = ['hackfleisch', 'haehnchen', 'fisch', 'lachs'].includes(k) ? 'verbrauch' : 'mhd';
    setExpiry(L.suggestExpiry(k));
    $('#quickAddBox').open = false;
    toast('Typische Haltbarkeit eingetragen – bei Bedarf anpassen, dann speichern');
  });

  $('#btnOpened').onclick = () => {
    const k = ingSelect.value;
    $('#fOpened').value = today();
    setExpiry(L.afterOpening($('#fExpiry').value || null, k));
    $('#btnOpened').textContent = `🥛 geöffnet am ${L.formatDate(today())}`;
    const care = L.CARE[k];
    toast(`Geöffnet: hält ca. ${care ? care.opened : 3} Tage – Datum angepasst. Speichern nicht vergessen.`);
  };
  $('#btnFreeze').onclick = () => {
    const k = ingSelect.value;
    const iso = L.afterFreezing(k);
    if (!iso) { toast(`${ingLabel(k) || 'Das'} eignet sich nicht gut zum Einfrieren`); return; }
    $('#fLocation').value = 'gefrierfach';
    setExpiry(iso);
    toast(`❄️ Eingefroren hält es bis ca. ${L.formatDate(iso)}. Speichern nicht vergessen.`);
  };
  $('#btnToShop').onclick = () => {
    const name = ingSelect.value ? ingLabel(ingSelect.value) : $('#fName').value;
    toast(addToShopping(name, ingSelect.value || null) ? 'Auf die Einkaufsliste gesetzt 🛒' : 'Steht schon auf der Liste');
    renderSummary();
  };

  $('#fName').addEventListener('input', () => {
    if (ingredientTouched) return;
    const k = L.detectIngredient($('#fName').value);
    if (k) { ingSelect.value = k; updateAdvice(); }
  });
  ingSelect.addEventListener('change', () => { ingredientTouched = true; updateAdvice(); });
  $('#fDateType').addEventListener('change', updateAdvice);

  /** Ablaufdatum setzen und beide Felder (Eintippen + Datumsauswahl) synchron halten. */
  function setExpiry(iso) {
    $('#fExpiry').value = iso || '';
    $('#fExpiryText').value = iso ? L.formatDate(iso) : '';
    $('#expiryHint').textContent = iso ? L.statusText(iso) : '';
    updateAdvice();
  }
  $('#fExpiry').addEventListener('change', () => setExpiry($('#fExpiry').value));
  $('#fExpiryText').addEventListener('input', () => {
    const raw = $('#fExpiryText').value;
    const iso = L.parseTypedDate(raw);
    $('#fExpiry').value = iso || '';
    $('#expiryHint').textContent = iso ? `${L.formatDate(iso)} · ${L.statusText(iso)}` : (raw.trim() ? 'z. B. 051026 für 05.10.2026' : '');
  });
  $('#fExpiryText').addEventListener('blur', () => { const iso = L.parseTypedDate($('#fExpiryText').value); if (iso) setExpiry(iso); });

  $('#quickDates').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    const d = b.dataset.days;
    if (d === 'none') setExpiry('');
    else if (d === 'suggest') setExpiry(L.suggestExpiry(ingSelect.value));
    else {
      const dt = new Date();
      dt.setDate(dt.getDate() + Number(d));
      setExpiry(L.toISODate(dt));
    }
  });
  $('#dateCandidates').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    setExpiry(b.dataset.iso);
    $$('#dateCandidates .chip').forEach((c) => c.classList.toggle('active', c === b));
  });

  $('#itemForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = {
      name: $('#fName').value.trim(),
      ingredient: ingSelect.value || null,
      expiry: $('#fExpiry').value || null,
      qty: Math.max(1, parseInt($('#fQty').value, 10) || 1),
      location: $('#fLocation').value,
      barcode: $('#fBarcode').value || null,
      image: $('#fImage').value || null,
      dateType: $('#fDateType').value,
      price: L.parsePrice($('#fPrice').value),
      note: $('#fNote').value.trim(),
      opened: $('#fOpened').value || null,
    };
    if (!data.name) data.name = data.ingredient ? ingLabel(data.ingredient) : (data.barcode ? 'Produkt ' + data.barcode : 'Produkt');
    if (editingId) {
      Object.assign(state.items.find((i) => i.id === editingId), data);
    } else {
      state.items.push({ id: uid(), added: today(), ...data });
      // Gekauft -> von der Einkaufsliste streichen
      if (data.ingredient) state.shopping = state.shopping.filter((s) => s.done || s.ingredient !== data.ingredient);
    }
    // Produkt merken – beim nächsten Scan desselben Barcodes ist alles schon ausgefüllt
    if (data.barcode) state.products[data.barcode] = { name: data.name, ingredient: data.ingredient, image: data.image, location: data.location, dateType: data.dateType, price: data.price };
    save(); dlg.close(); render();
    toast(editingId ? 'Gespeichert' : `„${data.name}“ hinzugefügt`);
  });

  // ---------- Produktdaten (Open Food Facts) ----------
  async function lookupProduct(code) {
    if (state.products[code]) return { ...state.products[code], known: true };
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    try {
      const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json` +
        '?fields=product_name,product_name_de,generic_name_de,brands,quantity,categories_tags,image_front_small_url';
      const res = await fetch(url, { signal: ctrl.signal });
      const json = await res.json();
      if (json.status !== 1 || !json.product) return null;
      const p = json.product;
      const base = p.product_name_de || p.product_name || p.generic_name_de || '';
      const brand = (p.brands || '').split(',')[0].trim();
      const name = [brand && !L.norm(base).includes(L.norm(brand)) ? brand : '', base, p.quantity || ''].filter(Boolean).join(' ').trim();
      return {
        name,
        ingredient: L.detectIngredient(base + ' ' + (p.generic_name_de || ''), p.categories_tags || []),
        image: p.image_front_small_url || null,
      };
    } catch (e) {
      return { error: true };
    } finally {
      clearTimeout(t);
    }
  }

  async function handleBarcode(code) {
    $('#fBarcode').value = code;
    showPreview({ name: 'Suche Produkt …', info: 'Barcode ' + code });
    const p = await lookupProduct(code);
    if (!p || p.error) {
      showPreview({ name: 'Produkt nicht gefunden', info: `Barcode ${code}${p && p.error ? ' · keine Verbindung' : ''} – bitte Namen eintippen, er wird für das nächste Mal gemerkt.` });
      $('#fName').focus();
      return;
    }
    $('#fName').value = p.name || $('#fName').value;
    if (p.ingredient) { ingSelect.value = p.ingredient; ingredientTouched = true; }
    if (p.location) $('#fLocation').value = p.location;
    if (p.dateType) $('#fDateType').value = p.dateType;
    if (p.price && !$('#fPrice').value) $('#fPrice').value = String(p.price).replace('.', ',');
    updateAdvice();
    $('#fImage').value = p.image || '';
    showPreview({ name: p.name, image: p.image, info: p.known ? 'Schon mal gescannt' : 'Gefunden bei Open Food Facts' });
    if (!$('#fExpiry').value) setTimeout(() => toast('Jetzt das Ablaufdatum scannen 📅'), 400);
  }

  // ---------- Kamera / Scanner ----------
  const video = $('#video');
  const scanDlg = $('#scanner');
  let stream = null;
  let scanMode = null;
  let scanning = false;
  let barcodeDetector = null;
  let zxingReader = null;
  let ocrWorker = null;
  const work = document.createElement('canvas');

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"][data-loaded]`)) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => { s.dataset.loaded = '1'; resolve(); };
      s.onerror = () => { s.remove(); reject(new Error('Laden fehlgeschlagen: ' + src)); };
      document.head.appendChild(s);
    });
  }

  async function openScanner(mode) {
    scanMode = mode;
    // Als eigenes modales Fenster öffnen, damit es über dem Produkt-Dialog liegt und bedienbar ist
    if (!scanDlg.open) scanDlg.showModal();
    $('#scanFrame').className = 'frame ' + mode;
    $('#btnTorch').hidden = true;
    setHint(mode === 'barcode' ? 'Barcode in den Rahmen halten' : 'Ablaufdatum in den Rahmen halten – möglichst gerade und gut beleuchtet');
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false,
      });
      if (scanMode !== mode) { s.getTracks().forEach((t) => t.stop()); return; } // inzwischen geschlossen
      stream = s;
      video.srcObject = stream;
      await video.play();
      const track = stream.getVideoTracks()[0];
      const caps = track.getCapabilities ? track.getCapabilities() : {};
      if (caps.torch) $('#btnTorch').hidden = false;
      if (caps.focusMode && caps.focusMode.includes('continuous')) track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
    } catch (e) {
      setHint('Kamera nicht verfügbar (Berechtigung? https?). Du kannst stattdessen ein 🖼️ Foto wählen.');
      return;
    }
    scanning = true;
    if (mode === 'barcode') barcodeLoop(); else dateLoop();
  }

  function stopCamera() {
    scanning = false;
    scanMode = null;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    video.srcObject = null;
  }
  function closeScanner() {
    stopCamera();
    if (scanDlg.open) scanDlg.close();
  }
  scanDlg.addEventListener('close', stopCamera); // auch bei Zurück-Taste / Esc

  function setHint(t) { $('#scanHint').textContent = t; }

  /** Schneidet den mittleren Bereich (wo der Rahmen ist) aus Video oder Bild aus. */
  function cropToCanvas(src, w, h, fw, fh, maxW) {
    return rectToCanvas(src, { x: (w - w * fw) / 2, y: (h - h * fh) / 2, w: w * fw, h: h * fh }, maxW, false);
  }

  /** Zeichnet einen Bildausschnitt auf die Arbeitsfläche, skaliert auf `width` (bei upscale auch vergrößert). */
  function rectToCanvas(src, r, width, upscale = true) {
    const scale = upscale ? width / r.w : Math.min(1, width / r.w);
    work.width = Math.max(1, Math.round(r.w * scale));
    work.height = Math.max(1, Math.round(r.h * scale));
    const ctx = work.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, work.width, work.height);
    return work;
  }

  /** Bereich des Videobilds, der im Rahmen auf dem Bildschirm zu sehen ist (object-fit: cover), plus etwas Rand. */
  function frameRect() {
    const vw = video.videoWidth, vh = video.videoHeight;
    const v = video.getBoundingClientRect(), f = $('#scanFrame').getBoundingClientRect();
    const scale = Math.max(v.width / vw, v.height / vh);
    const offX = (v.width - vw * scale) / 2, offY = (v.height - vh * scale) / 2;
    let x = (f.left - v.left - offX) / scale, y = (f.top - v.top - offY) / scale;
    let w = f.width / scale, h = f.height / scale;
    x -= w * 0.08; w *= 1.16; y -= h * 0.25; h *= 1.5;
    x = Math.max(0, x); y = Math.max(0, y);
    return { x, y, w: Math.min(w, vw - x), h: Math.min(h, vh - y) };
  }

  async function initBarcode() {
    if (barcodeDetector || zxingReader) return;
    if ('BarcodeDetector' in window) {
      try {
        const formats = await BarcodeDetector.getSupportedFormats();
        if (formats.includes('ean_13')) {
          barcodeDetector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'].filter((f) => formats.includes(f)) });
          return;
        }
      } catch (e) { /* Fallback */ }
    }
    await loadScript(ZXING_URL);
    const Z = window.ZXing;
    const hints = new Map();
    hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E, Z.BarcodeFormat.CODE_128]);
    hints.set(Z.DecodeHintType.TRY_HARDER, true);
    zxingReader = new Z.MultiFormatReader();
    zxingReader.setHints(hints);
  }

  async function detectBarcode(source, w, h, crop = 0.9) {
    if (barcodeDetector) {
      const codes = await barcodeDetector.detect(source);
      return codes.length ? codes[0].rawValue : null;
    }
    const Z = window.ZXing;
    const canvas = cropToCanvas(source, w, h, crop, Math.min(1, crop * 0.67), 1200);
    try {
      const bmp = new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(canvas)));
      return zxingReader.decodeWithState(bmp).getText();
    } catch (e) {
      return null; // kein Code im Bild
    }
  }

  async function barcodeLoop() {
    try { await initBarcode(); } catch (e) { setHint('Barcode-Erkennung konnte nicht geladen werden (offline?).'); return; }
    while (scanning && scanMode === 'barcode') {
      if (video.readyState >= 2) {
        const code = await detectBarcode(video, video.videoWidth, video.videoHeight).catch(() => null);
        if (code && scanning) {
          if (navigator.vibrate) navigator.vibrate(80);
          closeScanner();
          handleBarcode(code);
          return;
        }
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  const DATE_WHITELIST = '0123456789./-: ABCDEFGHIJKLMNOPRSTUVZabcdefghijklmnoprstuvzäÄ';
  function initOcr() {
    if (ocrWorker) return ocrWorker;
    setHint('Texterkennung wird geladen … (nur beim ersten Mal etwas länger)');
    ocrWorker = (async () => {
      await loadScript(TESSERACT_URL);
      const worker = await Tesseract.createWorker('eng', 1, { errorHandler: (e) => console.warn('OCR', e) });
      await worker.setParameters({
        tessedit_pageseg_mode: '6',
        tessedit_char_whitelist: DATE_WHITELIST,
      });
      return worker;
    })();
    ocrWorker.catch(() => { ocrWorker = null; }); // beim nächsten Versuch neu laden
    return ocrWorker;
  }

  /** Erkennt Text in einem Bildausschnitt mit einer Aufbereitungs-Variante (siehe imageprep.js). */
  async function ocrRect(source, rect, variant) {
    const worker = await initOcr();
    const canvas = rectToCanvas(source, rect, variant.width);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    ImagePrep.prepare(img.data, canvas.width, canvas.height, variant);
    ctx.putImageData(img, 0, 0);
    const { data } = await worker.recognize(canvas);
    if (window.__ocrLog) window.__ocrLog.push({ variant, text: data.text, dates: L.parseDates(data.text) });
    return { text: data.text, lines: data.lines || [], scale: canvas.width / rect.w };
  }

  async function dateLoop() {
    try { await initOcr(); } catch (e) { setHint('Texterkennung konnte nicht geladen werden (offline?). Datum bitte von Hand eingeben.'); return; }
    setHint('Ablaufdatum in den Rahmen halten …');
    let tries = 0;
    let voter = L.createDateVoter();
    while (scanning && scanMode === 'date') {
      if (video.readyState >= 2 && video.videoWidth) {
        const variant = ImagePrep.VARIANTS[tries % ImagePrep.VARIANTS.length];
        const { text } = await ocrRect(video, frameRect(), variant);
        if (!scanning || scanMode !== 'date') return;
        const sure = voter.add(text);
        if (sure) { acceptDates(sure); return; }
        tries++;
        // nach zwei Runden durch alle Varianten das Beste nehmen, sonst neu zählen (Kamera bewegt)
        if (tries % (ImagePrep.VARIANTS.length * 2) === 0) {
          if (voter.best().length) { acceptDates(voter.best()); return; }
          voter = L.createDateVoter();
        }
        const seen = text.replace(/\s+/g, ' ').trim().slice(0, 40);
        setHint(tries > 12
          ? 'Noch nichts erkannt. Tipp: näher ran, Licht an 🔦, 🖼️ Foto machen oder Datum unten eintippen.'
          : 'Suche Datum …' + (seen ? ` (lese: „${seen}“)` : ''));
      }
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  /**
   * Datum in einem Foto suchen: erst das ganze Bild, dann gezielt die Textzeilen mit Ziffern
   * (vergrößert und in allen Varianten) – so werden auch kleine Daten auf großen Fotos gefunden.
   */
  async function ocrPhoto(img, onProgress) {
    const full = { x: 0, y: 0, w: img.width, h: img.height };
    const voter = L.createDateVoter();
    const first = await ocrRect(img, full, { width: Math.min(2000, img.width), blur: 0, plain: true });
    let sure = voter.add(first.text);
    if (sure) return sure;
    const second = await ocrRect(img, full, { width: Math.min(2000, img.width), blur: 0 });
    if ((sure = voter.add(second.text))) return sure;
    first.lines = first.lines.concat(second.lines);
    const regions = [];
    for (const line of first.lines) {
      if (!/\d.*\d/.test(line.text)) continue;
      const b = line.bbox, s = first.scale;
      const h = (b.y1 - b.y0) / s;
      // großzügig erweitern: die Zeilenerkennung schneidet bei schwachem Druck oft Teile ab
      const x = Math.max(0, b.x0 / s - 3 * h), y = Math.max(0, b.y0 / s - h);
      regions.push({ x, y, w: Math.min(img.width - x, (b.x1 - b.x0) / s + 6 * h), h: Math.min(img.height - y, h * 3) });
    }
    // Falls Tesseract gar keine Zeilen gefunden hat: Bild in überlappende Streifen teilen
    if (!regions.length) for (let i = 0; i < 4; i++) regions.push({ x: 0, y: img.height * i * 0.25 - (i ? img.height * 0.05 : 0), w: img.width, h: img.height * 0.3 });
    const jobs = [];
    for (const r of regions.slice(0, 4)) for (const v of ImagePrep.VARIANTS) jobs.push([r, { ...v, width: Math.min(1400, Math.max(600, v.width)) }]);
    for (let i = 0; i < jobs.length; i++) {
      if (onProgress) onProgress(i + 1, jobs.length);
      const { text } = await ocrRect(img, ...jobs[i]);
      if ((sure = voter.add(text))) return sure;
    }
    return voter.best();
  }

  /** Kassenbon lesen: ganzer Text erlaubt (nicht nur Datumszeichen), Spaltenlayout. */
  async function ocrReceipt(img) {
    const worker = await initOcr();
    await worker.setParameters({ tessedit_char_whitelist: '', tessedit_pageseg_mode: '4' });
    try {
      let best = [];
      let total = null;
      const full = { x: 0, y: 0, w: img.width, h: img.height };
      for (const v of [{ width: Math.min(1800, Math.max(1000, img.width)), blur: 0, plain: true }, { width: Math.min(1800, Math.max(1000, img.width)), blur: 0 }]) {
        const { text } = await ocrRect(img, full, v);
        const items = L.parseReceipt(text);
        total = total || L.parseReceiptTotal(text);
        if (items.length > best.length) best = items;
        if (best.length >= 3) break;
      }
      return { items: best, total };
    } finally {
      await worker.setParameters({ tessedit_char_whitelist: DATE_WHITELIST, tessedit_pageseg_mode: '6' });
    }
  }

  function acceptDates(dates) {
    if (navigator.vibrate) navigator.vibrate(80);
    closeScanner();
    setExpiry(dates[0]);
    const cands = dates.slice(0, 4);
    $('#dateCandidates').innerHTML = cands.length > 1
      ? '<span class="muted small">Erkannt:</span>' + cands.map((d, i) => `<button type="button" class="chip ${i === 0 ? 'active' : ''}" data-iso="${d}">${L.formatDate(d)}</button>`).join('')
      : '';
    toast(`Datum erkannt: ${L.formatDate(dates[0])} – bitte kurz prüfen`);
  }

  $('#btnScanBarcode').onclick = () => openScanner('barcode');
  $('#btnScanDate').onclick = () => openScanner('date');
  $('#btnCloseScan').onclick = closeScanner;
  $('#btnTorch').onclick = async () => {
    const track = stream && stream.getVideoTracks()[0];
    if (!track) return;
    const on = !$('#btnTorch').classList.contains('active');
    try { await track.applyConstraints({ advanced: [{ torch: on }] }); $('#btnTorch').classList.toggle('active', on); } catch (e) { /* nicht unterstützt */ }
  };

  // Foto statt Live-Kamera (z. B. wenn die Kamera blockiert ist)
  $('#photoInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const mode = scanMode;
    const img = await createImageBitmap(file);
    if (mode === 'barcode') {
      setHint('Suche Barcode im Foto …');
      await initBarcode().catch(() => {});
      const code = await detectBarcode(img, img.width, img.height, 1).catch(() => null);
      if (code) { closeScanner(); handleBarcode(code); } else setHint('Im Foto wurde kein Barcode gefunden.');
    } else {
      setHint('Lese Datum aus dem Foto …');
      try {
        const wasLive = scanning;
        scanning = false; // Live-Erkennung pausieren, damit das Foto schneller geht
        const dates = await ocrPhoto(img, (i, n) => setHint(`Lese Datum aus dem Foto … (${i}/${n})`));
        if (dates.length) acceptDates(dates);
        else {
          setHint('Im Foto wurde kein Datum gefunden. Tipp: Foto nah am Datum aufnehmen oder Datum eintippen.');
          if (wasLive && scanMode === 'date') { scanning = true; dateLoop(); }
        }
      } catch (err) { setHint('Texterkennung nicht verfügbar (offline?).'); }
    }
  });

  // ---------- Einstellungen ----------
  function notifyStateText() {
    if (!('Notification' in window)) return 'Dieser Browser unterstützt keine Benachrichtigungen.';
    return { granted: 'Benachrichtigungen sind aktiv.', denied: 'Benachrichtigungen wurden blockiert (in den Browser-Einstellungen änderbar).', default: '' }[Notification.permission];
  }
  $('#notifyState').textContent = notifyStateText();
  $('#btnNotify').onclick = async () => {
    if (!('Notification' in window)) return;
    await Notification.requestPermission();
    $('#notifyState').textContent = notifyStateText();
    state.lastNotified = null;
    checkNotifications();
  };

  async function checkNotifications() {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const today = L.toISODate(new Date());
    if (state.lastNotified === today) return;
    const due = state.items.filter((i) => { const d = L.daysUntil(i.expiry); return d !== null && d >= 0 && d <= 1; });
    if (!due.length) return;
    state.lastNotified = today; save();
    const body = due.map((i) => `${i.name} – ${L.statusText(i.expiry)}`).join('\n');
    const title = due.length === 1 ? 'Bitte bald verbrauchen' : `${due.length} Produkte bald verbrauchen`;
    try {
      const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration());
      if (reg) reg.showNotification(title, { body, icon: 'icon.svg', tag: 'frischecheck' });
      else new Notification(title, { body, icon: 'icon.svg' });
    } catch (e) { /* ignorieren */ }
  }

  $('#btnExport').onclick = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `frischecheck-${L.toISODate(new Date())}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $('#importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.items)) throw new Error();
      if (!confirm(`Sicherung mit ${data.items.length} Produkten laden? Der aktuelle Vorrat wird ersetzt.`)) return;
      state = { ...defaults(), ...data };
      save(); render(); toast('Sicherung geladen');
    } catch (err) { toast('Das ist keine gültige Sicherungsdatei.'); }
  });
  $('#btnClear').onclick = () => {
    if (!confirm('Wirklich alles löschen – Vorrat, Einkaufsliste, Wochenplan, eigene Rezepte und Statistik?')) return;
    state = defaults();
    save(); render();
  };

  // ---------- Start ----------
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  window.addEventListener('storage', (e) => { if (e.key === STORE) { state = load(); render(); } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); checkNotifications(); } });
  /** Schnittstelle für die Bereiche Sport, Kalender, Ausgaben und Heute (alltag.js). */
  window.App = {
    get state() { return state; },
    L, save, render, toast, esc, uid, today, showView, openItemDialog, findRecipe, sortedItems, ingEmoji, ingLabel,
    beep, listen: SpeechRec ? listen : null, onRender: (fn) => renderHooks.push(fn), actions,
    calendarSources: [],
    get view() { return currentView; },
    notify: async (title, body, tag) => {
      if (!('Notification' in window) || Notification.permission !== 'granted') return false;
      try {
        const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration());
        if (reg) await reg.showNotification(title, { body, icon: 'icon.svg', tag });
        else new Notification(title, { body, icon: 'icon.svg', tag });
        return true;
      } catch (e) { return false; }
    },
  };

  render();
  checkNotifications();

  // Geteilte Einkaufsliste übernehmen (#liste=…)
  if (location.hash.startsWith('#liste=')) {
    const list = L.decodeShare(location.hash.slice(7));
    history.replaceState(null, '', location.pathname + location.search);
    if (Array.isArray(list) && list.length && confirm(`Geteilte Einkaufsliste mit ${list.length} Einträgen übernehmen?\n\n${list.map((i) => '• ' + i.name).join('\n')}`)) {
      let n = 0;
      for (const i of list) if (addToShopping(i.name, i.ingredient, true, i.note)) n++;
      save(); showView('shopping');
      toast(n ? `${n} Einträge übernommen` : 'Stand schon alles auf deiner Liste');
    }
  }
  // App-Verknüpfungen (lange auf das App-Symbol drücken)
  const params = new URLSearchParams(location.search);
  if (params.get('view')) showView(params.get('view'));
  if (params.has('neu')) openItemDialog(null);
})();
