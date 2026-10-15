# Spec 02: Mock-Decoder und Fahrzeugkarte

## Ziel
Gültige, im Speicher unbekannte FIN: Mock-Decoder liefert einen Datensatz, er wird gespeichert und als Fahrzeugkarte angezeigt. Bekannte FIN: unverändert aus dem Speicher (Spec 01).

## Ablauf
1. validateFin. 2. lookupFin: found, dann Karte. error, dann Meldung "Daten momentan nicht verfügbar." unknown, dann 3.
3. decodeFin(fin) in src/decoder/mock.js liefert {status:'found', data} | {status:'nodata'} | {status:'error'}.
   found: saveFin(fin, data, 'mock'), dann Karte. nodata: Meldung, nichts speichern. error: "Daten momentan nicht verfügbar."
Die Schnittstelle decodeFin(fin) bleibt in Spec 03 gleich, nur die Quelle wechselt.

## Datenformat
data = { decode: [ { label, value, id? }, ... ] }. Aufbau wie in den echten Vincario-Antworten der Proben (03a): manche Einträge tragen zusätzlich eine Zahl `id`. Werte können Text, Zahl, Text-Zahl (z. B. "5") oder Liste sein.
Speichereintrag wie bisher: { savedAt, source: "mock", data }.

## Mock
Drei erfundene FINs fest im Code: TESTMKA0000000001 bis TESTMKA0000000003. Keine echten FINs. Jede andere FIN: nodata.
- 01: die Labels der ID.4-Probe (41 Einträge, Reihenfolge, `id`-Felder und Werttypen wie in der Probe).
- 02: die Labels der Polo-Probe (30 Einträge, ebenso).
- 03: nur Make, Model, Model Year.
Aus den Proben werden nur Labels, `id`-Felder und Werttypen übernommen, nie Werte. Alle Werte sind erfunden: VIN = die Fake-FIN, Check Digit und Sequential Number Fake-Werte, Make = "Testmarke", Make Logo = https://example.invalid/..., Model in 01 mit zwei Namen ("Testmodell E, Testmodell F"), `id`-Zahlen erfunden.

## Anzeige (Entscheidung F24: nur Titel und Model Year)
- Titel: Make + Model, Model unverändert (auch mit mehreren Namen wie "ID.4, ID.5"). Nur Make oder nur Model: nur das. Fehlen beide: "Dein Fahrzeug".
- Darunter eine Zeile mit Model Year. Fehlt Model Year: keine Zeile.
- Keine Liste, kein Motor, Getriebe, keine Farbe und keine Ausstattung.
- Gespeichert, nicht angezeigt: alle anderen Felder, u. a. Trim, Body, Fuel Type, Transmission, Maße, Make Logo (externe Ressource, CSP) und alle `id`-Felder.
- Fehlendes Feld: Teil entfällt, kein Platzhalter. Kachel "AUTO" bleibt. Alles HTML-escaped.

## Meldung ohne Daten
"Zu dieser Fahrgestellnummer haben wir keine Daten." HTTP 200, nicht gespeichert, kein Herkunftshinweis.

## Speichern
saveFin in src/cache.js. Atomar (temporäre Datei im selben Ordner, dann umbenennen), legt data/ bei Bedarf an. Schreibt nie, wenn lookupFin einen Fehler meldete (beschädigte Datei bleibt unverändert). Schreibfehler: "Daten momentan nicht verfügbar." Keine FIN in Logs oder Fehlern. Server-Aufrufe sequenziell, kein Locking nötig.

## Tests
decodeFin (3 Treffer, 1 nodata; die erwarteten Labellisten stehen fest im Test, nicht aus den Proben gelesen, da data/ nicht im Repo ist; keine Probe-Werte in den Fixtures), saveFin (neu, bestehende Einträge bleiben, beschädigte Datei bleibt byte-gleich, Schreibfehler), Kartenmapping (alle Felder, nur Make, nur Model, ohne Model Year, Mehrfachmodell, Escaping; Trim, Body, Fuel Type, Transmission, Maße, Make Logo und IDs nicht im HTML; Mock-Datensätze 01 und 02 samt Listenwerten stürzen nicht ab und ergeben nur Titel und Jahr-Zeile), Server (unbekannt+Mock-FIN: Karte und danach im Speicher; zweiter Aufruf ohne Decoder-Aufruf; nodata-Meldung, nichts gespeichert).

## Nicht-Ziele
Kein API-Aufruf, kein Key, keine .env. Echtes Schema und Model Year (Stelle 10 unzuverlässig außerhalb Nordamerika) erst in Spec 03 gegen eine echte Antwort prüfen.
