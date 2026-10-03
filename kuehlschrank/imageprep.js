/* Bildvorverarbeitung für die Datumserkennung (reine Funktionen, auch in Node testbar).
   Aufgedruckte Ablaufdaten sind oft Punktmatrix-Druck, kontrastarm oder spiegeln – deshalb
   wird das Bild in mehreren Varianten (Weichzeichnen, lokaler Schwellwert, invertiert) aufbereitet. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ImagePrep = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Varianten, die abwechselnd ausprobiert werden (width = Zielbreite in px). */
  const VARIANTS = [
    { width: 900, blur: 0 },
    { width: 900, blur: 3 },               // Punktmatrix: Punkte verschmelzen
    { width: 600, blur: 1 },
    { width: 1200, blur: 5 },              // grober Punktmatrix-Druck
    { width: 900, blur: 0, invert: true }, // Hell/Dunkel umgekehrt zur automatischen Erkennung
    { width: 700, blur: 2 },
    { width: 900, blur: 3, invert: true },
    { width: 600, blur: 0, plain: true },  // nur Graustufen
  ];

  /** Heller Grund (dunkle Schrift) ist der Normalfall; bei überwiegend dunklem Bild wird umgedreht. */
  function isDarkBackground(g) {
    let sum = 0;
    for (let i = 0; i < g.length; i += 7) sum += g[i];
    return sum / Math.ceil(g.length / 7) < 110;
  }

  function toGray(data, w, h) {
    const g = new Float32Array(w * h);
    for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    return g;
  }

  /** Kontrast strecken (1.–99. Perzentil), robust gegen einzelne Lichtreflexe. */
  function stretch(g) {
    const hist = new Uint32Array(256);
    for (let i = 0; i < g.length; i++) hist[Math.max(0, Math.min(255, g[i] | 0))]++;
    const cut = g.length * 0.01;
    let lo = 0, hi = 255, acc = 0;
    while (lo < 255 && (acc += hist[lo]) < cut) lo++;
    acc = 0;
    while (hi > 0 && (acc += hist[hi]) < cut) hi--;
    const range = Math.max(1, hi - lo);
    for (let i = 0; i < g.length; i++) g[i] = Math.max(0, Math.min(255, ((g[i] - lo) / range) * 255));
    return g;
  }

  /** Mittelwert über ein (2r+1)²-Fenster per Integralbild – O(n) unabhängig von r. */
  function boxMean(g, w, h, r) {
    if (r <= 0) return g;
    const W = w + 1;
    const I = new Float64Array(W * (h + 1));
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) {
        row += g[y * w + x];
        I[(y + 1) * W + x + 1] = I[y * W + x + 1] + row;
      }
    }
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
        const sum = I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0];
        out[y * w + x] = sum / ((x1 - x0) * (y1 - y0));
      }
    }
    return out;
  }

  /**
   * Bereitet RGBA-Pixel (ImageData.data) auf: schwarze Schrift auf weißem Grund.
   * Schreibt das Ergebnis zurück in `data`.
   */
  function prepare(data, w, h, variant) {
    let g = stretch(toGray(data, w, h));
    if (isDarkBackground(g) !== !!variant.invert) for (let i = 0; i < g.length; i++) g[i] = 255 - g[i];
    if (variant.blur) g = boxMean(g, w, h, variant.blur);
    let out = g;
    if (!variant.plain) {
      // lokaler Schwellwert: dunkler als die Umgebung = Schrift (gleicht Schatten/Spiegelungen aus)
      const mean = boxMean(g, w, h, Math.max(8, Math.round(Math.min(w, h) / 6)));
      const offset = variant.blur ? 6 : 12;
      out = new Float32Array(g.length);
      for (let i = 0; i < g.length; i++) out[i] = g[i] < mean[i] - offset ? 0 : 255;
    }
    for (let i = 0, j = 0; j < out.length; i += 4, j++) data[i] = data[i + 1] = data[i + 2] = out[j];
    return data;
  }

  return { VARIANTS, isDarkBackground, toGray, stretch, boxMean, prepare };
});
