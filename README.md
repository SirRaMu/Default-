# Kopfrechnen Trainer

Eine kleine, installierbare Web-App zum Kopfrechnen üben – Addition, Subtraktion,
Multiplikation und Division, mit wählbarer Rechenart, Schwierigkeit und Modus.
Läuft im Browser und lässt sich auf iPad und iPhone/Android als eigenständige
App auf den Home-Bildschirm installieren (PWA, funktioniert auch offline).

## Struktur

```
index.html        Grundgerüst mit 3 Screens (Setup, Übung, Ergebnis)
css/style.css      Design (mobile-first, große Touch-Ziele, Dark-Mode)
js/app.js          Gesamte App-Logik (Zustandsmaschine, Aufgabengenerator, Verlauf)
manifest.json      PWA-Manifest (Name, Icons, Startbildschirm)
sw.js              Service Worker für Offline-Nutzung
icons/             App-Icons in allen benötigten Größen
```

### Ablauf der App

1. **Start-Screen**: Rechenart (Addition/Subtraktion/Multiplikation/Division/Gemischt,
   mehrfach wählbar), Schwierigkeit (Leicht/Mittel/Schwer/Experte) und Modus
   (Anzahl Aufgaben oder Zeit-Sprint) auswählen.
2. **Übungs-Screen**: Aufgabe lösen über ein großes Zahlenfeld, direktes Feedback
   (richtig/falsch), laufende Statistik (Treffer, Serie, Fortschritt/Timer).
3. **Ergebnis-Screen**: Trefferquote, Ø Zeit pro Aufgabe, beste Serie, Liste der
   falsch beantworteten Aufgaben zum Nachüben. Einstellungen und die letzten
   10 Ergebnisse werden lokal auf dem Gerät gespeichert (`localStorage`).

### Schwierigkeitsgrade

Jede Rechenart hat eigene Zahlenbereiche je Stufe (z. B. Addition 1–20 bei
"Leicht" bis 100–10000 bei "Experte"; Division liefert immer ganzzahlige
Ergebnisse, Subtraktion nie negative Zwischenergebnisse).

## Nutzung auf iPad / iPhone / Android

Die App ist reines HTML/CSS/JavaScript ohne Build-Schritt oder Server-Backend –
sie muss nur irgendwo per HTTPS (oder http://localhost) erreichbar gemacht werden:

### Option A: GitHub Pages (empfohlen, kostenlos)

1. Im Repository unter **Settings → Pages** als Quelle den Branch `main`
   (Ordner `/root`) auswählen.
2. Nach ein paar Minuten ist die App unter
   `https://<dein-github-name>.github.io/<repo-name>/` erreichbar.
3. Den Link auf dem iPad/iPhone in **Safari** öffnen.

### Option B: Lokal testen

```bash
python3 -m http.server 8080
# dann im Browser: http://localhost:8080
```

### Als App installieren

- **iPhone/iPad (Safari):** Seite öffnen → Teilen-Symbol → **"Zum Home-Bildschirm"**.
- **Android (Chrome):** Seite öffnen → Menü (⋮) → **"App installieren"** /
  **"Zum Startbildschirm hinzufügen"**.

Danach startet die App im Vollbild ohne Browser-Leiste, mit eigenem Icon, und
funktioniert dank Service Worker auch ohne Internetverbindung.
