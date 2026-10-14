# Fortschritt

- Spec 01 (FIN-Eingabe und Abgleich mit lokalem Speicher) liegt in `docs/specs/01-fin-cache.md`.
- Design-Stilregeln liegen in `docs/design/README.md`.
- Schritt 1 erledigt: Projektgerüst (`server.js` nur auf 127.0.0.1, `npm start`, `npm test` grün).
- Schritt 2 (Texte, Du-Form, Begriff "Fahrgestellnummer", schlichter Nutzensatz) freigegeben, Wortlaut unten.
- Schritt 3 erledigt: `src/fin.js` (`validateFin`, Codes `empty`/`format`/`chars`), Tests in `test/`, `npm test` grün (7 Tests).
- Schritt 4 erledigt: `src/cache.js` (`lookupFin`: found/unknown/error, nur lesend), Tests in `test/cache.test.js`, `npm test` grün (18 Tests).
- Schritt 5 erledigt: `GET /?fin=` mit `src/page.js` (ungestaltet), Host-Prüfung, Sicherheits-Header, `npm test` grün (29 Tests).
- Nächster Schritt: 6, Gestaltung nach Design-Regeln (`<style>` in `src/page.js`).

## Texte der Oberfläche (freigegeben)

- Beschriftung oben: `MEIN FAHRZEUG`
- Überschrift: `Das steckt in deinem Auto`
- Nutzensatz: `Gib deine Fahrgestellnummer ein und sieh, welches Auto du fährst.`
- Label: `Fahrgestellnummer`, Platzhalter: `17 Zeichen, steht im Fahrzeugschein`
- Button: `Fahrzeug anzeigen`
- Fehler leer: `Bitte gib die 17 Zeichen deiner Fahrgestellnummer ein.`
- Fehler Format: `Die Nummer muss genau 17 Zeichen haben und darf nur Buchstaben und Ziffern enthalten.`
- Fehler I, O, Q: `In dieser Nummer kommen die Buchstaben I, O und Q nicht vor. Bitte prüfe deine Eingabe.`
- Technischer Fehler: `Daten momentan nicht verfügbar.`
- Unbekannte Fahrgestellnummer: kein Text.
