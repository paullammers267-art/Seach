# Beförderungsunternehmen in der Umgebung

> Ebenfalls in diesem Repository: **[🥬 Frischecheck](kuehlschrank/)** – Ablaufdaten scannen, Kühlschrank-Vorrat verwalten, passende Rezepte finden.

Web-App, die alle Beförderungsunternehmen rund um einen Standort auf einer Karte und als Liste anzeigt:

- 🚕 Taxi & Mietwagen · 🚌 Bus & Reisen · 🚑 Krankentransport · 📦 Umzüge
- 🛵 Kurier & Express · 🚚 Spedition & Logistik · 🚐 Shuttle & Limousine · Taxistände (optional)

## Funktionen

- Suche per **Adresse/Ort**, per **„Mein Standort“** (GPS/Browser) oder per **Klick auf die Karte**
- Umkreis 2–50 km, Ergebnisse nach Entfernung sortiert
- Kategorie-Filter und Freitextfilter
- Telefon, E-Mail, Website, Öffnungszeiten, Adresse, Routenlink
- **CSV-Export** (für Excel, Semikolon-getrennt)
- Direktlinks: `index.html?q=Köln` oder `index.html?lat=50.94&lon=6.96&r=10000`

Die Daten stammen aus [OpenStreetMap](https://www.openstreetmap.org) (Overpass API, Geocoding über Nominatim) –
kostenlos, ohne API-Schlüssel. Nicht jedes Unternehmen ist in OpenStreetMap eingetragen.

## Starten

Keine Installation nötig – `index.html` im Browser öffnen. Für „Mein Standort“ verlangen Browser
eine sichere Umgebung (https oder localhost), daher am besten einen lokalen Server starten:

```bash
npx serve .          # oder: python3 -m http.server 8000
```

Dann http://localhost:3000 (bzw. :8000) aufrufen. Alternativ lässt sich der Ordner direkt über GitHub Pages veröffentlichen.

## Online stellen (GitHub Pages)

Im Repository unter **Settings → Pages → Build and deployment**: Source „Deploy from a branch“,
Branch `claude/befoerderungsunternehmen-software-qhqg0h`, Ordner `/ (root)` → Save.
Nach 1–2 Minuten ist die App erreichbar unter
`https://paullammers267-art.github.io/Seach/` (z. B. direkt für Ahaus: `…/Seach/?q=Ahaus&r=20000`).

## Tests

```bash
npm test
```

## Aufbau

| Datei | Inhalt |
|---|---|
| `index.html` | Seitenaufbau |
| `app.js` | Karte (Leaflet), Suche, Liste, Filter, Export |
| `categories.js` | Overpass-Abfrage, Erkennung der Kategorien, Entfernung, CSV |
| `style.css` | Layout (auch mobil und im Dark Mode) |
| `test/` | Tests für die Kategorisierung |
