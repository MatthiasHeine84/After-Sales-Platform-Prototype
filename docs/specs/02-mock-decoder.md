# Spec 02: Mock-Decoder und Fahrzeugkarte

## Ziel
Gültige, im Speicher unbekannte FIN: Mock-Decoder liefert einen Datensatz, er wird gespeichert und als Fahrzeugkarte angezeigt. Bekannte FIN: unverändert aus dem Speicher (Spec 01).

## Ablauf
1. validateFin. 2. lookupFin: found, dann Karte. error, dann Meldung "Daten momentan nicht verfügbar." unknown, dann 3.
3. decodeFin(fin) in src/decoder/mock.js liefert {status:'found', data} | {status:'nodata'} | {status:'error'}.
   found: saveFin(fin, data, 'mock'), dann Karte. nodata: Meldung, nichts speichern. error: "Daten momentan nicht verfügbar."
Die Schnittstelle decodeFin(fin) bleibt in Spec 03 gleich, nur die Quelle wechselt.

## Datenformat
data = { decode: [ { label, value }, ... ] }, angelehnt an Vincario (Doku-Stand, ungeprüft gegen echte Antwort).
Speichereintrag wie bisher: { savedAt, source: "mock", data }.

## Mock
Drei erfundene FINs fest im Code (ID.4-ähnlich, Polo-ähnlich, ein Datensatz mit fehlenden Feldern). Keine echten FINs. Jede andere FIN: nodata.
Labels: Make, Make Logo, Model, Model ID, Model Year, Transmission, Transmission (full), Transmission ID, Vehicle Specification, Vehicle ID, Engine Model, Engine Power (kW), Engine (full), Engine Code, Color, Color ID.

## Anzeige (Mapping-Tabelle label -> deutsche Beschriftung, nur diese Felder)
- Titel: Make + Model. Fehlen beide: "Dein Fahrzeug".
- Zeile: Model Year · Engine (full).
- Liste: Getriebe (Transmission (full), sonst Transmission), Motorleistung (Engine Power (kW), Einheit kW), Motorcode (Engine Code), Motormodell (Engine Model), Farbe (Color), Ausstattung (Vehicle Specification).
- Gespeichert, nicht angezeigt: Make Logo (externe Ressource, CSP), Model ID, Transmission ID, Vehicle ID, Color ID.
- Fehlendes Feld: Zeile/Teil entfällt, kein Platzhalter. Kachel "AUTO" bleibt. Alles HTML-escaped.

## Meldung ohne Daten
"Zu dieser Fahrgestellnummer haben wir keine Daten." HTTP 200, nicht gespeichert, kein Herkunftshinweis.

## Speichern
saveFin in src/cache.js. Atomar (temporäre Datei im selben Ordner, dann umbenennen), legt data/ bei Bedarf an. Schreibt nie, wenn lookupFin einen Fehler meldete (beschädigte Datei bleibt unverändert). Schreibfehler: "Daten momentan nicht verfügbar." Keine FIN in Logs oder Fehlern. Server-Aufrufe sequenziell, kein Locking nötig.

## Tests
decodeFin (3 Treffer, 1 nodata), saveFin (neu, bestehende Einträge bleiben, beschädigte Datei bleibt byte-gleich, Schreibfehler), Kartenmapping (fehlende Felder, Getriebe-Fallback, Escaping, IDs und Logo nicht im HTML), Server (unbekannt+Mock-FIN: Karte und danach im Speicher; zweiter Aufruf ohne Decoder-Aufruf; nodata-Meldung, nichts gespeichert).

## Nicht-Ziele
Kein API-Aufruf, kein Key, keine .env. Echtes Schema und Model Year (Stelle 10 unzuverlässig außerhalb Nordamerika) erst in Spec 03 gegen eine echte Antwort prüfen.
