# 🥬 Frischecheck – Kühlschrank & Ablaufdaten

Web-App (installierbar aufs Handy), mit der du deinen Vorrat im Blick behältst:

- **Barcode scannen** → Produktname, Bild und Zutat kommen automatisch von [Open Food Facts](https://world.openfoodfacts.org).
  Unbekannte Produkte tippst du einmal ein – beim nächsten Scan sind sie gemerkt.
- **Ablaufdatum scannen** per Texterkennung (MHD, „verbrauchen bis“, `12.10.26`, `10/2026`, `18 OKT 2026` …).
  Werden mehrere Daten erkannt, kannst du das richtige antippen. Alternativ: Schnellauswahl (+3 Tage, +1 Woche, „typisch“ …).
- **Vorrat** nach Ablaufdatum sortiert, farbig markiert (abgelaufen / heute / bald), getrennt nach Kühlschrank, Gefrierfach, Vorrat.
  ✓ = verbraucht, 🗑 = weggeworfen (mit Rückgängig), Statistik „gerettet“.
- **Rezeptvorschläge** aus dem, was da ist – Rezepte, die bald ablaufende Zutaten retten, stehen oben.
  Filter (⭐ Favoriten, 🥕 vegetarisch, ⚡ bis 20 Min, ✍️ eigene), Suche, „Gekocht“ trägt die Zutaten aus.
- **Eigene Rezepte** anlegen und bearbeiten.
- **📅 Wochenplan**: Rezepte auf die nächsten 7 Tage legen, fehlende Zutaten mit einem Tipp auf die Einkaufsliste.
- **🛒 Einkaufsliste**: mehrere Einträge per Komma, Vorschläge, abhaken, Gekauftes direkt in den Vorrat, Liste teilen (z. B. WhatsApp).
  **Immer im Haus**: Ist ein Grundnahrungsmittel aufgebraucht, landet es automatisch auf der Liste; sonst fragt die App „Nachkaufen?“.
- **🥛 Geöffnet / ❄️ Einfrieren** passen das Ablaufdatum automatisch an (typische Haltbarkeit je Lebensmittel).
- **MHD oder Verbrauchsdatum**: abgelaufenes MHD → „oft noch gut, prüfen“, Verbrauchsdatum → „nicht mehr essen“.
- **⚡ Schnellauswahl** häufiger Lebensmittel ohne Scannen, Sortierung, Notizen, Preise, Bereich „Bad & Haushalt“ (z. B. Medikamente).
- **Statistik** pro Monat, Wert der weggeworfenen Lebensmittel, was am häufigsten im Müll landet.
- **Ratgeber**: MHD vs. Verbrauchsdatum, Kühlschrank-Zonen, Einfrieren, Lagertipps für ~60 Lebensmittel.
- **Erinnerung** beim Öffnen, wenn etwas heute/morgen abläuft (Browser-Benachrichtigung).
- Funktioniert offline (außer Produktsuche), Sicherung als JSON exportieren/importieren. Alle Daten bleiben auf dem Gerät.

## Benutzen

Die Kamera funktioniert nur über **https** (oder localhost). Mit GitHub Pages ist die App erreichbar unter
`https://paullammers267-art.github.io/Seach/kuehlschrank/` → im Browser-Menü „Zum Startbildschirm hinzufügen“.

Lokal: `npx serve kuehlschrank` und http://localhost:3000 öffnen.

## Aufbau

| Datei | Inhalt |
|---|---|
| `index.html`, `style.css` | Oberfläche (mobil, Dark Mode) |
| `app.js` | Speicherung, Kamera-Scanner (BarcodeDetector bzw. ZXing, Tesseract.js), Open Food Facts |
| `logic.js` | Datumserkennung, Ablauf-Status, Zuordnung Produkt → Zutat, Rezept-Bewertung, Haltbarkeit nach Öffnen/Einfrieren, Statistik |
| `imageprep.js` | Bildaufbereitung für die Texterkennung (Punktmatrix, Kontrast, Hell/Dunkel) |
| `recipes.js` | ~45 Rezepte |
| `sw.js`, `manifest.webmanifest` | Offline & Installation |

Tests: `npm test` (im Hauptordner).
