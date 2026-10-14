# Fortschritt

- Spec 01 (FIN-Eingabe und Abgleich mit lokalem Speicher) liegt in `docs/specs/01-fin-cache.md`.
- Design-Stilregeln liegen in `docs/design/README.md`.
- Schritt 1 erledigt: Projektgerüst (`server.js` nur auf 127.0.0.1, `npm start`, `npm test` grün).
- Schritt 2 (Texte, Du-Form, Begriff "Fahrgestellnummer", schlichter Nutzensatz) freigegeben, Wortlaut unten.
- Schritt 3 erledigt: `src/fin.js` (`validateFin`, Codes `empty`/`format`/`chars`), Tests in `test/`, `npm test` grün (7 Tests).
- Schritt 4 erledigt: `src/cache.js` (`lookupFin`: found/unknown/error, nur lesend), Tests in `test/cache.test.js`, `npm test` grün (18 Tests).
- Schritt 5 erledigt: `GET /?fin=` mit `src/page.js` (ungestaltet), Host-Prüfung, Sicherheits-Header, `npm test` grün (29 Tests).
- Schritt 6 erledigt: Gestaltung nach Design-Regeln als `<style>` in `src/page.js`, CSP-Header, Hinweistext statt Platzhalter, `npm test` grün (32 Tests; früher irrtümlich mit 31 angegeben).
- Spec 02 (Mock-Decoder und Fahrzeugkarte) liegt in `docs/specs/02-mock-decoder.md`; FIN ohne Daten bekommt eine Meldung (ersetzt "kein Text" aus Spec 01).
- Spec 02 umgesetzt (Code und Tests): `src/decoder/mock.js` (Fake-FINs `TESTMKA0000000001` bis `...03`), `saveFin` mit `readStore` in `src/cache.js`, Kartenmapping und `notice` in `src/page.js`, Verdrahtung in `server.js` (`createServer({cacheFile, decode})`). `npm test` grün (73 Tests: fin 7, cache 21, decoder 5, card 16, server 24).
- Manueller Browser-Check erledigt (Desktop und schmal): Mock-FIN `...01` und `...03` (fehlende Felder) zeigen die Karte ohne Herkunftshinweis, gültige Nicht-Mock-FIN nur den Hinweis ohne Karte, `ABC` die Formatmeldung. Hash-Messung war unsauber: H1 und H2 wurden beide erst nach Schritt 2 genommen. Die Speicherdatei enthält genau die zwei erwarteten Einträge. Der Beleg, dass ein zweiter Aufruf nichts schreibt, läuft über den Servertest "Zweiter Aufruf … ohne Decoder-Aufruf" und das unveränderte `savedAt`, nicht über den Hash.
- **Spec 02 abgeschlossen.**
- Hinweis für Spec 03: `decode` wird asynchron. In `server.js` (`decodeAndStore`) muss dann `await` an den Decoder-Aufruf, die Handler-Funktion wird `async`. Gleichzeitige Abrufe derselben FIN zu einem Aufruf zusammenfassen, sonst doppelte API-Kosten (Trial-Kontingent ist klein). Außerdem entfällt dann die Annahme "Server-Aufrufe sequenziell" aus Spec 02 (Locking beim Speichern neu bewerten).
- Hinweis für Spec 03: Doppelung auf der Karte. `Engine (full)` steht in der Zeile unter dem Titel, `Engine Power (kW)` in der Liste (Mock: "Elektro 150 kW" und "150 kW"). Nach Verprobung mit einer echten Antwort entscheiden, ob Zeile oder Liste gekürzt wird.
- Hinweis für Spec 03b (aus der Probe): Der erste echte Aufruf brach mit 8 s Timeout ab (`TimeoutError`), Vincario hat ihn trotzdem abgerechnet (Guthaben 20 auf 19). Timeout 8 s war zu kurz bzw. die Antwort kam nicht an, der Credit war trotzdem weg. Folgen für 03b: Timeout neu festlegen (Probe nutzt 30 s, Dauer wird gemessen); die Obergrenze zählt Versuche, nicht erfolgreiche Antworten; kein automatischer Retry.
- 03a Probe 1 (ID.4) ausgewertet (`data/probe-1.masked.json`): Dauer 288 ms. Der erste Aufruf lief in den 8-s-Timeout ohne Antwort, kostete aber 1 Credit (20 auf 19); die Wiederholung derselben FIN kostete nichts. Die Antwort hat die Schlüssel `price` (0), `price_currency` ("EUR"), `balance` (Objekt, nur Zahlen, `API VIN Decode` = 19) und `decode` mit 41 Einträgen. Einträge sind `{label, value}`, manche mit zusätzlichem `id`. Es sind technische Daten (Make, Model, Model Year, Body, Trim, Fuel Type, Transmission, Maße, Gewichte, Make Logo), aber kein Motor, keine Farbe und keine Ausstattung.
- 03a: Von den 16 Labels aus Spec 02 fehlen 11 in der echten Antwort: Model ID, Transmission (full), Transmission ID, Vehicle Specification, Vehicle ID, Engine Model, Engine Power (kW), Engine (full), Engine Code, Color, Color ID. Vorhanden sind Make, Make Logo, Model, Model Year, Transmission. Folge: Das Kartenmapping muss auf echte Labels umgestellt werden (z. B. Zeile aus Model Year · Fuel Type, Liste aus Body, Trim, Transmission). Die Doppelung Engine (full) / Motorleistung entfällt für diese Antwort. Fehlerform steht noch aus (bisher kein Fehlerfall mit Antwort gesehen).
- 03a Probe 2 (Polo, `data/probe-2.masked.json`): Dauer 836 ms, 30 Labels, Guthaben danach 18 (`balance` in der Antwort zeigt 18). Credits: 1 pro neue FIN (2 Fälle: ID.4 20 auf 19, Polo 19 auf 18), Wiederholung derselben FIN ohne Abzug (1 Fall). Die Feldsätze unterscheiden sich stark zwischen den Fahrzeugen: 26 Labels gemeinsam, 15 nur beim ID.4 (u. a. Body, Trim, Fuel Type - Primary, Transmission, Plant Country), 4 nur beim Polo (Vehicle ID, drei Fuel Consumption). Gesichert in beiden sind nur Make, Model, Model Year, Product Type und Make Logo (plus Maße, Gewichte, Räder). Von den 16 Labels aus Spec 02 fehlen in beiden Antworten 10: Model ID, Transmission (full), Transmission ID, Vehicle Specification, Engine Model, Engine Power (kW), Engine (full), Engine Code, Color, Color ID. Folge: Das Mapping darf nur Make und Model als Pflicht behandeln, alles andere optional.
- 03a `info`-Proben (`--info`, Aufruf `decode/info`): (1) `info` ist kostenlos, Dauer 160 bis 240 ms, das Guthaben blieb bei 18. (2) Fehler kommen mit HTTP 200 und dem Body `{error, message}`; der Statuscode allein erkennt sie nicht, 03b muss `body.error` prüfen. (3) Erfundene FINs ergeben "Not recognized". (4) Bei erkanntem Hersteller, aber geänderter Modellstelle liefert `info` nur 10 Labels, darunter kein Model. (5) Zwei reale VW-FINs derselben Schicht lieferten identische Daten: Die Daten scheinen bei zwei Proben pro Baureihe und Modelljahr zu gelten, nicht pro Fahrzeug. (6) Offen: Abbuchung und Fehlerformat von `decode` bei Nicht-Treffern (nur `info` wurde mit Nicht-Treffern geprobt).
- Nächster Schritt: Spec 03 (Vincario-Anbindung), Plan zuerst und vorher das Restguthaben nennen.

## Texte der Oberfläche (freigegeben)

- Beschriftung oben: `MEIN FAHRZEUG`
- Überschrift: `Das steckt in deinem Auto`
- Nutzensatz: `Gib deine Fahrgestellnummer ein und sieh die technischen Daten deines Fahrzeugs.`
- Label: `Fahrgestellnummer`, darunter sichtbarer Hinweistext (kein Platzhalter, per `aria-describedby` am Feld): `17 Zeichen, siehe Zulassungsbescheinigung Feld E`
- Button: `Fahrzeug anzeigen`
- Fehler leer: `Bitte gib die 17 Zeichen deiner Fahrgestellnummer ein.`
- Fehler Format: `Die Nummer muss genau 17 Zeichen haben und darf nur Buchstaben und Ziffern enthalten.`
- Fehler I, O, Q: `Die Fahrgestellnummer darf keine Buchstaben I, O und Q enthalten. Bitte prüfe deine Eingabe.`
- Technischer Fehler: `Daten momentan nicht verfügbar.`
- Fahrgestellnummer ohne Daten (seit Spec 02): `Zu dieser Fahrgestellnummer haben wir keine Daten.` (gleiche Optik wie die anderen Hinweise, aber `role="status"`, HTTP 200, nichts wird gespeichert)
