/* Frischecheck – Oberfläche, Speicherung, Kamera-Scanner (Barcode + Datum per Texterkennung). */
(() => {
  'use strict';
  const L = window.FridgeLogic;
  const RECIPES = window.FridgeRecipes;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const STORE = 'frischecheck.v1';
  const LOCATIONS = { kuehlschrank: '🧊 Kühlschrank', gefrierfach: '❄️ Gefrierfach', vorrat: '🗄️ Vorrat' };
  const ZXING_URL = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
  const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

  // ---------- Zustand ----------
  let state = load();
  let undoSnapshot = null;
  let filterLoc = '';
  let editingId = null;
  let ingredientTouched = false;

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE));
      if (s && Array.isArray(s.items)) return { products: {}, stats: { consumed: 0, wasted: 0 }, ...s };
    } catch (e) { /* leerer Start */ }
    return { items: [], products: {}, stats: { consumed: 0, wasted: 0 }, lastNotified: null };
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { toast('Speichern fehlgeschlagen'); }
  }
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ingLabel = (k) => (L.INGREDIENTS[k] ? L.INGREDIENTS[k].label : k);
  const ingEmoji = (k) => (L.INGREDIENTS[k] ? L.INGREDIENTS[k].emoji : '📦');

  function sortedItems() {
    return [...state.items].sort((a, b) => {
      if (!a.expiry && !b.expiry) return a.name.localeCompare(b.name, 'de');
      if (!a.expiry) return 1;
      if (!b.expiry) return -1;
      return a.expiry.localeCompare(b.expiry);
    });
  }

  // ---------- Toast ----------
  let toastTimer;
  function toast(msg, action) {
    const el = $('#toast');
    el.innerHTML = esc(msg) + (action ? ` <button class="link">${esc(action.label)}</button>` : '');
    el.hidden = false;
    if (action) el.querySelector('button').onclick = () => { action.fn(); el.hidden = true; };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), action ? 6000 : 3000);
  }

  // ---------- Navigation ----------
  function showView(name) {
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + name));
    $$('.tab[data-view]').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
    render();
  }
  $$('.tab[data-view]').forEach((t) => (t.onclick = () => showView(t.dataset.view)));

  // ---------- Rendern ----------
  function render() {
    renderSummary();
    renderStock();
    renderRecipes();
    renderStats();
  }

  function renderSummary() {
    const c = { expired: 0, today: 0, soon: 0 };
    state.items.forEach((i) => { const s = L.status(i.expiry); if (s in c) c[s]++; });
    const parts = [];
    if (c.expired) parts.push(`<span class="pill expired">${c.expired} abgelaufen</span>`);
    if (c.today) parts.push(`<span class="pill today">${c.today} heute</span>`);
    if (c.soon) parts.push(`<span class="pill soon">${c.soon} bald</span>`);
    if (!parts.length) parts.push(`<span class="pill ok">${state.items.length} Produkte · alles frisch</span>`);
    $('#summary').innerHTML = parts.join('');
  }

  function renderStock() {
    const q = L.norm($('#search').value.trim());
    const list = sortedItems().filter((i) =>
      (!filterLoc || i.location === filterLoc) &&
      (!q || L.norm(i.name + ' ' + ingLabel(i.ingredient)).includes(q)));
    const el = $('#stockList');
    if (!state.items.length) {
      el.innerHTML = `<div class="empty"><div class="big-emoji">🧊</div>
        <p><b>Dein Kühlschrank ist noch leer.</b></p>
        <p class="muted">Tippe unten auf <b>＋ Scannen</b>, scanne den Barcode und das Ablaufdatum eines Produkts.</p></div>`;
      return;
    }
    if (!list.length) { el.innerHTML = '<p class="muted center">Nichts gefunden.</p>'; return; }
    el.innerHTML = list.map((i) => {
      const st = L.status(i.expiry);
      const img = i.image
        ? `<img src="${esc(i.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
        : `<span class="emoji">${ingEmoji(i.ingredient)}</span>`;
      return `<article class="item ${st}" data-id="${esc(i.id)}">
        <div class="thumb">${img}</div>
        <div class="info" data-act="edit">
          <div class="name">${esc(i.name)}${i.qty > 1 ? ` <span class="qty">×${i.qty}</span>` : ''}</div>
          <div class="meta">${LOCATIONS[i.location] || ''}${i.expiry ? ' · ' + L.formatDate(i.expiry) : ''}</div>
          <div class="badge ${st}">${L.statusText(i.expiry)}</div>
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

  function snapshot() { undoSnapshot = JSON.stringify({ items: state.items, stats: state.stats }); }
  function undo() {
    if (!undoSnapshot) return;
    Object.assign(state, JSON.parse(undoSnapshot));
    undoSnapshot = null;
    save(); render();
  }

  /** Nimmt ein Stück aus dem Vorrat (Menge −1, bei 0 entfernt). */
  function takeOut(id, kind, quiet) {
    const it = state.items.find((i) => i.id === id);
    if (!it) return;
    if (!quiet) snapshot();
    state.stats[kind] = (state.stats[kind] || 0) + 1;
    if (it.qty > 1) it.qty--;
    else state.items = state.items.filter((i) => i.id !== id);
    save(); render();
    if (!quiet) toast(kind === 'wasted' ? `„${it.name}“ weggeworfen` : `„${it.name}“ verbraucht 👍`, { label: 'Rückgängig', fn: undo });
  }

  $('#search').addEventListener('input', renderStock);
  $('#locFilter').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    filterLoc = b.dataset.loc;
    $$('#locFilter .chip').forEach((c) => c.classList.toggle('active', c === b));
    renderStock();
  });

  // ---------- Rezepte ----------
  function chefkochUrl(words) {
    return 'https://www.chefkoch.de/rs/s0/' + words.map((w) => encodeURIComponent(w.toLowerCase())).join('+') + '/Rezepte.html';
  }

  function renderRecipes() {
    const urgentItems = sortedItems().filter((i) => i.expiry && L.daysUntil(i.expiry) <= 3);
    const urgentIngs = [...new Set(urgentItems.map((i) => i.ingredient).filter(Boolean))];
    const ub = $('#urgentBox');
    if (urgentItems.length) {
      ub.innerHTML = `<div class="card warn">
        <h2>Jetzt verbrauchen</h2>
        <div class="chips">${urgentItems.map((i) => `<span class="chip static ${L.status(i.expiry)}">${ingEmoji(i.ingredient)} ${esc(i.name)} · ${L.statusText(i.expiry)}</span>`).join('')}</div>
        ${urgentIngs.length ? `<a class="btn small" target="_blank" rel="noopener" href="${chefkochUrl(urgentIngs.slice(0, 3).map(ingLabel))}">Mehr Rezepte mit ${esc(urgentIngs.slice(0, 3).map(ingLabel).join(', '))} auf Chefkoch ↗</a>` : ''}
      </div>`;
    } else ub.innerHTML = '';

    const res = L.suggestRecipes(RECIPES, state.items, new Date(), { minCoverage: $('#showAll').checked ? 0.25 : 0.5 });
    const el = $('#recipeList');
    if (!state.items.length) { el.innerHTML = '<p class="muted center">Füge Produkte hinzu, dann schlage ich passende Rezepte vor.</p>'; return; }
    if (!res.length) {
      el.innerHTML = `<p class="muted center">Mit deinem aktuellen Vorrat passt noch kein Rezept aus meiner Sammlung.
        Aktiviere oben „auch Rezepte zeigen …“ oder ordne deinen Produkten eine Zutat zu.</p>`;
      return;
    }
    el.innerHTML = res.slice(0, 30).map((r) => {
      const ing = (k) => `<span class="ing ${r.urgent.includes(k) ? 'urgent' : ''}">${ingEmoji(k)} ${esc(ingLabel(k))}</span>`;
      const pct = Math.round(r.coverage * 100);
      return `<article class="recipe card" data-id="${r.recipe.id}">
        <div class="recipe-head">
          <span class="recipe-emoji">${r.recipe.emoji}</span>
          <div>
            <h3>${esc(r.recipe.name)}</h3>
            <div class="muted small">⏱ ${r.recipe.minutes} Min · ${pct === 100 ? 'alles da ✅' : pct + ' % vorhanden'}${r.urgent.length ? ' · <b class="urgent-text">rettet ' + r.urgent.length + ' bald ablaufende Zutat' + (r.urgent.length > 1 ? 'en' : '') + '</b>' : ''}</div>
          </div>
        </div>
        <div class="ings"><span class="label">Hast du:</span> ${[...r.used, ...r.extras].map(ing).join(' ')}</div>
        ${r.missing.length ? `<div class="ings missing"><span class="label">Fehlt:</span> ${r.missing.map((k) => `<span class="ing">${ingEmoji(k)} ${esc(ingLabel(k))}</span>`).join(' ')}</div>` : ''}
        <details>
          <summary>Zubereitung</summary>
          <ol>${r.recipe.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
          <p class="muted small">Salz, Pfeffer, Öl und Gewürze setze ich als vorhanden voraus.</p>
          <div class="row">
            <button class="btn small primary" data-cook="${r.recipe.id}">🍽️ Gekocht – Hauptzutaten austragen</button>
            <a class="btn small" target="_blank" rel="noopener" href="${chefkochUrl([r.recipe.name])}">Varianten auf Chefkoch ↗</a>
          </div>
        </details>
      </article>`;
    }).join('');
  }
  $('#showAll').addEventListener('change', renderRecipes);

  $('#recipeList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cook]');
    if (!b) return;
    const recipe = RECIPES.find((r) => r.id === b.dataset.cook);
    snapshot();
    const names = [];
    for (const k of recipe.ingredients) {
      const it = sortedItems().find((i) => i.ingredient === k); // das am frühesten ablaufende
      if (it) { names.push(it.name); takeOut(it.id, 'consumed', true); }
    }
    toast(names.length ? `Ausgetragen: ${names.join(', ')}` : 'Nichts ausgetragen', { label: 'Rückgängig', fn: undo });
  });

  function renderStats() {
    const { consumed = 0, wasted = 0 } = state.stats;
    const total = consumed + wasted;
    const rate = total ? Math.round((consumed / total) * 100) : null;
    $('#stats').innerHTML = `
      <div class="statgrid">
        <div><b>${state.items.length}</b><span>im Vorrat</span></div>
        <div><b>${consumed}</b><span>verbraucht</span></div>
        <div><b>${wasted}</b><span>weggeworfen</span></div>
        <div><b>${rate === null ? '–' : rate + ' %'}</b><span>gerettet</span></div>
      </div>`;
  }

  // ---------- Produkt-Dialog ----------
  const dlg = $('#itemDialog');
  const ingSelect = $('#fIngredient');
  ingSelect.innerHTML = '<option value="">– sonstiges –</option>' +
    Object.entries(L.INGREDIENTS)
      .sort((a, b) => a[1].label.localeCompare(b[1].label, 'de'))
      .map(([k, v]) => `<option value="${k}">${v.emoji} ${esc(v.label)}</option>`).join('');

  function openItemDialog(item) {
    editingId = item ? item.id : null;
    ingredientTouched = !!item;
    $('#itemTitle').textContent = item ? 'Produkt bearbeiten' : 'Produkt hinzufügen';
    $('#fName').value = item ? item.name : '';
    ingSelect.value = item ? item.ingredient || '' : '';
    $('#fExpiry').value = item ? item.expiry || '' : '';
    $('#fQty').value = item ? item.qty : 1;
    $('#fLocation').value = item ? item.location : (filterLoc || 'kuehlschrank');
    $('#fBarcode').value = item ? item.barcode || '' : '';
    $('#fImage').value = item ? item.image || '' : '';
    $('#btnDelete').hidden = !item;
    $('#dateCandidates').innerHTML = '';
    showPreview(item && item.image ? { image: item.image, name: item.name } : null);
    dlg.showModal();
  }

  function showPreview(p) {
    const el = $('#productPreview');
    if (!p) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.innerHTML = `${p.image ? `<img src="${esc(p.image)}" alt="" referrerpolicy="no-referrer">` : ''}
      <div><b>${esc(p.name || 'Unbekanntes Produkt')}</b>${p.info ? `<div class="muted small">${esc(p.info)}</div>` : ''}</div>`;
  }

  $('#btnAdd').onclick = () => openItemDialog(null);
  $('#btnCancel').onclick = () => dlg.close();
  $('#btnDelete').onclick = () => {
    snapshot();
    const it = state.items.find((i) => i.id === editingId);
    state.items = state.items.filter((i) => i.id !== editingId);
    save(); dlg.close(); render();
    toast(`„${it.name}“ gelöscht`, { label: 'Rückgängig', fn: undo });
  };

  $('#fName').addEventListener('input', () => {
    if (ingredientTouched) return;
    const k = L.detectIngredient($('#fName').value);
    if (k) ingSelect.value = k;
  });
  ingSelect.addEventListener('change', () => (ingredientTouched = true));

  $('#quickDates').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    const d = b.dataset.days;
    if (d === 'none') $('#fExpiry').value = '';
    else if (d === 'suggest') $('#fExpiry').value = L.suggestExpiry(ingSelect.value);
    else {
      const dt = new Date();
      dt.setDate(dt.getDate() + Number(d));
      $('#fExpiry').value = L.toISODate(dt);
    }
  });
  $('#dateCandidates').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    $('#fExpiry').value = b.dataset.iso;
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
    };
    if (!data.name) data.name = data.ingredient ? ingLabel(data.ingredient) : (data.barcode ? 'Produkt ' + data.barcode : 'Produkt');
    if (editingId) {
      Object.assign(state.items.find((i) => i.id === editingId), data);
    } else {
      state.items.push({ id: uid(), added: L.toISODate(new Date()), ...data });
    }
    // Produkt merken – beim nächsten Scan desselben Barcodes ist alles schon ausgefüllt
    if (data.barcode) state.products[data.barcode] = { name: data.name, ingredient: data.ingredient, image: data.image, location: data.location };
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
    const cw = Math.round(w * fw), ch = Math.round(h * fh);
    const scale = Math.min(1, maxW / cw);
    work.width = Math.round(cw * scale);
    work.height = Math.round(ch * scale);
    const ctx = work.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, (w - cw) / 2, (h - ch) / 2, cw, ch, 0, 0, work.width, work.height);
    return work;
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

  function initOcr() {
    if (ocrWorker) return ocrWorker;
    setHint('Texterkennung wird geladen … (nur beim ersten Mal etwas länger)');
    ocrWorker = (async () => {
      await loadScript(TESSERACT_URL);
      const worker = await Tesseract.createWorker('eng', 1, { errorHandler: (e) => console.warn('OCR', e) });
      await worker.setParameters({
        tessedit_pageseg_mode: '6',
        tessedit_char_whitelist: '0123456789./-: ABCDEFGHIJKLMNOPRSTUVZabcdefghijklmnoprstuvzäÄ',
      });
      return worker;
    })();
    ocrWorker.catch(() => { ocrWorker = null; }); // beim nächsten Versuch neu laden
    return ocrWorker;
  }

  /** Graustufen + Kontrast verbessert die Texterkennung auf glänzenden Verpackungen deutlich. */
  function enhance(canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;
    let min = 255, max = 0;
    for (let i = 0; i < d.length; i += 4) {
      const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      d[i] = g;
      if (g < min) min = g;
      if (g > max) max = g;
    }
    const range = Math.max(1, max - min);
    for (let i = 0; i < d.length; i += 4) {
      const v = ((d[i] - min) / range) * 255;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  async function ocrDates(source, w, h, fw, fh) {
    const worker = await initOcr();
    const canvas = enhance(cropToCanvas(source, w, h, fw, fh, 1400));
    const { data } = await worker.recognize(canvas);
    return { dates: L.parseDates(data.text), text: data.text };
  }

  async function dateLoop() {
    try { await initOcr(); } catch (e) { setHint('Texterkennung konnte nicht geladen werden (offline?). Datum bitte von Hand eingeben.'); return; }
    setHint('Ablaufdatum in den Rahmen halten …');
    let tries = 0;
    while (scanning && scanMode === 'date') {
      if (video.readyState >= 2) {
        const { dates, text } = await ocrDates(video, video.videoWidth, video.videoHeight, 0.8, 0.3);
        if (!scanning) return;
        if (dates.length) { acceptDates(dates); return; }
        tries++;
        const seen = text.replace(/\s+/g, ' ').trim().slice(0, 40);
        setHint(tries > 4
          ? 'Noch nichts erkannt. Tipp: näher ran, Licht an 🔦, oder Datum unten von Hand wählen.'
          : 'Suche Datum …' + (seen ? ` (lese: „${seen}“)` : ''));
      }
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  function acceptDates(dates) {
    if (navigator.vibrate) navigator.vibrate(80);
    closeScanner();
    $('#fExpiry').value = dates[0];
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
        const { dates } = await ocrDates(img, img.width, img.height, 1, 1);
        if (dates.length) acceptDates(dates); else setHint('Im Foto wurde kein Datum gefunden. Tipp: Foto nah am Datum aufnehmen.');
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
      state = { products: {}, stats: { consumed: 0, wasted: 0 }, ...data };
      save(); render(); toast('Sicherung geladen');
    } catch (err) { toast('Das ist keine gültige Sicherungsdatei.'); }
  });
  $('#btnClear').onclick = () => {
    if (!confirm('Wirklich den gesamten Vorrat, gemerkte Produkte und die Statistik löschen?')) return;
    state = { items: [], products: {}, stats: { consumed: 0, wasted: 0 }, lastNotified: null };
    save(); render();
  };

  // ---------- Start ----------
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  window.addEventListener('storage', (e) => { if (e.key === STORE) { state = load(); render(); } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); checkNotifications(); } });
  render();
  checkNotifications();
})();
