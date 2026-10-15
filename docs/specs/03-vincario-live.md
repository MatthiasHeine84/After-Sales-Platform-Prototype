# Spec 03: Vincario live

## Aufteilung
03a Probe: zwei echte Abrufe, um das Antwortformat zu sehen. 03b Live-Anbindung auf Basis der Probe. 03b wird nach 03a finalisiert.

## 03a Probe
Freigabe: genau zwei echte decode-Aufrufe (ID.4 und Polo), von Matthias selbst im eigenen Terminal ausgeführt. Jeder weitere Aufruf braucht eine neue Freigabe.
- Skript scratch/probe.js (Ordner scratch/ in .gitignore, nicht im Repo). Aufruf: node scratch/probe.js <FIN>. Die FIN kommt nur als Argument, nie im Code.
- Keys aus .env über process.loadEnvFile(): VINCARIO_API_KEY und VINCARIO_SECRET_KEY. Fehlen sie: klare Meldung ohne Werte. Das Skript liest .env nur selbst, Claude Code liest .env nie.
- Control Sum: erste 10 Zeichen von sha1("<VIN in Großbuchstaben>|decode|<apiKey>|<secretKey>"). URL-Aufbau vor dem Aufruf gegen das NodeJS-Beispiel im Repo Vincario/api-code-sample prüfen. Weicht er ab, stoppen und melden.
- Ausgabe: Rohantwort in data/probe-<Nr>.json (gitignored). Auf dem Terminal nur: HTTP-Status, Schlüssel der obersten Ebene, Liste der Labels aus decode mit Werttyp, FIN maskiert (nur erste 3 und letzte 2 Zeichen). Nie die URL, nie Keys, nie die ungekürzte FIN ausgeben oder loggen. Fehlerfall: Status und Fehlerstruktur ausgeben, ebenfalls ohne URL.
- Timeout 8 Sekunden, kein Retry, keine Schleife.
- Erkenntnisse danach in PROGRESS.md: echte Labels (Abgleich mit Spec 02: Make, Make Logo, Model, Model ID, Model Year, Transmission, Transmission (full), Transmission ID, Vehicle Specification, Vehicle ID, Engine Model, Engine Power (kW), Engine (full), Engine Code, Color, Color ID), Fehlerform, Credit-Kosten pro Abruf (Zahl liefert Matthias aus dem Dashboard), Unterschiede ID.4 und Polo.
- Danach: Fixtures für Tests mit Fake-FIN aus der Rohantwort ableiten, ohne echte FIN und ohne personenbezogene Daten. Mock und Kartenmapping an die echten Labels anpassen.

## 03b Live-Anbindung
Entscheidungen: Kein Umschalter. Der Server nutzt immer den Vincario-Decoder für gültige, im Speicher unbekannte FINs. Der Mock liegt nur noch unter `test/helpers/` und wird im Test injiziert. Nur `decode`, kein `info` (F21 verworfen, F25).

### Decoder
- Datei `src/decoder/vincario.js` mit `createVincarioDecoder({ fetchFn, apiKey, secretKey, maxCalls: 3, timeoutMs: 15000 })`. Liefert `async decodeFin(fin)` mit dem Ergebnisformat des Mocks (`{status:'found', data}` | `{status:'nodata'}` | `{status:'error'}`), bei `found` zusätzlich `source: "vincario"`. Aufruf mit fetch, keine Pakete.
- Keys: Der Server liest sie beim Start aus `.env` (`process.loadEnvFile()`), nur im Startblock, nie beim Import. Fehlen sie, antwortet der Decoder mit `error`. Die Startmeldung nennt nur "konfiguriert" oder "nicht konfiguriert", nie Werte.
- Aufruf: URL und Control Sum exakt wie in `scratch/probe.js` (bewährt): Control Sum = erste 10 Zeichen von sha1("<FIN>|decode|<apiKey>|<secretKey>"). Die FIN steht im URL-Pfad und wird im Decoder erneut mit `validateFin` geprüft (ungültig: `error`, ohne Zähler, ohne Aufruf). `redirect: 'error'`, Timeout über `AbortSignal.timeout`.
- Zähler: Jeder Versuch zählt vor dem fetch, auch Timeouts und Fehler. Beim vierten Versuch kein Aufruf und `error` ("Daten momentan nicht verfügbar.", 500). Zähler pro Serverstart, im Arbeitsspeicher. Fehlende Keys und ungültige FINs zählen nicht (kein Aufruf).
- Deduplizierung: Gleichzeitige Aufrufe derselben FIN teilen sich ein Promise (Map, Eintrag im `finally` entfernen) und zählen als ein Versuch.
- Auswertung der Antwort:
  - HTTP-Fehler, kein gültiges JSON oder Timeout: `error`.
  - `body.error` gesetzt: `message === "Not recognized"` ist `nodata`, jede andere Fehlerform ist `error`. Fehler kommen mit HTTP 200, der Status allein reicht nicht.
  - `decode` fehlt oder ist kein Array: `error`.
  - Kein Eintrag mit Label "Model": `nodata`.
  - Sonst `found` mit `{ decode }`. `price` und `balance` werden verworfen.

### Server und Speichern
- `decodeAndStore` und der Handler werden async, `await` am Decoder-Aufruf. Ein Wurf oder abgelehntes Promise ergibt `error` (500, neutrale Meldung).
- Die Quelle im Speichereintrag kommt aus dem Decoder-Ergebnis (`source`), nicht mehr fest aus `server.js`. Ein Ergebnis ohne `source` als nicht-leerer Text gilt als unbrauchbar (500).
- Fehler und `nodata` werden nie gespeichert.
- Standard ohne übergebenen Decoder: ein Vincario-Decoder ohne Keys. Er liefert immer `error` und ruft nie `fetch` auf, damit Tests die echte API nie treffen können.
- `saveFin` schreibt synchron (Lesen, Prüfen, Schreiben ohne `await`): kein Locking nötig. Die FIN-Prüfung beim Speichern (`found`, wenn die FIN inzwischen vorhanden ist) deckt die Lücke durch das asynchrone `decode` ab.

### Sicherheit
- Nie loggen oder ausgeben: URL, Keys, FIN, Antworttext, Fehlermeldungen des fetch (können die URL enthalten). Nach außen nur neutrale Meldungen.

### Tests (ohne Netzwerk, mit Fake-fetch)
Treffer; "Not recognized" (nodata, nichts gespeichert); andere Fehlerform; HTTP 500; kaputtes JSON; Timeout; Antwort ohne Model; Zähler (vierter Versuch ohne fetch, Fehlversuche zählen); Deduplizierung (zwei gleichzeitige Aufrufe, ein fetch); fehlende Keys; URL und Control Sum gegen einen berechneten Fake-Wert; Ausgaben enthalten weder Key noch FIN. Server: Treffer wird mit source "vincario" gespeichert; Standard ohne Decoder ruft nie `fetch` auf.

### Live-Test
Nur durch Matthias im eigenen Terminal, ein Abruf mit seiner FIN (1 Credit, Guthaben laut Dashboard 18 auf 17). Nicht Teil der Umsetzungsschritte.

### Offene Punkte
- Fehlercodes: bekannt ist nur "Not recognized" (aus `info`-Proben); Abbuchung und Fehlerformat von `decode` bei Nicht-Treffern sind ungeprüft.
- Modelljahr (Stelle 10) außerhalb Nordamerika unzuverlässig.
- Ein Versuch kann abgerechnet werden, auch bei Timeout (Probe 1). Deshalb zählt die Obergrenze Versuche und es gibt keinen automatischen Retry.
- Vincario-T&C (Zwischenspeichern und Quellenangabe unklar).
