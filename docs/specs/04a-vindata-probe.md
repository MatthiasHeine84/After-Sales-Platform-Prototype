# Spec 04a: VINdata-Probe

## Zweck
Vor einer Anbindung von VINdata.io das echte Antwortformat kennenlernen (wie Spec 03a bei Vincario). Quelle der API-Beschreibung: vindata.io/openapi.yaml. Die Probe ist ein Einmal-Skript und baut nichts in den Server ein.

Freigabe: Echte Aufrufe (`--echt`) führt nur Matthias im eigenen Terminal aus, nie Claude Code. Jeder Aufruf braucht eine eigene Freigabe, vorher wird das Restguthaben genannt.

## API-Fakten (aus openapi.yaml)
- Host `https://vindata.io/api/public`, Auth nur per Header `x-api-key` (Query-Key wird nicht akzeptiert).
- `GET /vin-decode?vin=<FIN>`: Top-level `vin`, `source` (cache|live), `cached_at`, `vehicle`. `options` und `all_options` liegen in `vehicle`, Element `{code, description}`. Kein `lang`.
- `GET /vin-decode/v1?vin=<FIN>[&lang=xx]`: Top-level `version`, `vin`, `normalized`, `enriched`, `meta`. Die Fahrzeugfelder liegen in `normalized`, kein `source`/`cached_at`. `lang` nur hier: de, fr, es, it, nl, pl, pt, sv, da, no, fi, cs.
- Fehler: `{error, details}`; 400, 401, 403, 429, 502. Für v1 sind keine Fehler dokumentiert.
- Die Antwort enthält die FIN im Klartext. Deshalb wird auch die Terminalausgabe maskiert.

## Aufruf
```
node scratch/probe-vindata.js <FIN> [--echt] [--endpoint vin-decode|vin-decode/v1] [--lang xx]
```
```
node scratch/probe-vindata.js --auswerten data/vindata-probe-N.json [<FIN>]
```
- `--auswerten <Pfad>`: Auswertung einer vorhandenen Datei ohne Netz. Der Pfad muss unter `data/` liegen (nur `.json`, Links aus `data/` heraus werden abgelehnt). Kein Key, kein `fetch`, keine neuen Dateien, Ausgabe wie bei `--echt` (ohne Status und Header, die stehen nicht in der Datei), alles maskiert. Die FIN dient nur zum Maskieren: aus dem Argument, sonst aus dem Feld `vin` der Datei. Ist sie nicht bestimmbar, bricht das Skript ab, statt unmaskiert auszugeben. Eine bereits maskierte Datei (`vin` mit `***`) wird ohne FIN ausgewertet. Nicht zusammen mit `--echt`.
- Ohne `--echt`: Dry-Run. Zeigt Pfad ohne `vin`-Wert (bei v1 nur der Platzhalter `vin=<FIN>`), Header-Name, FIN nur als `ABC***`, "Key vorhanden: ja/nein". Kein Netzaufruf, nie ein Key-Wert.
- Standard-Endpoint: `vin-decode`. `--lang` nur mit `vin-decode/v1` und nur mit den oben genannten Codes.
- Unbekannte Schalter, ungültiger `--lang`, `--lang` mit `vin-decode`: Abbruch vor dem Lesen des Keys.
- FIN-Vorabprüfung mit `validateFin` (`src/fin.js`). Sie prüft nur das Muster `^[A-HJ-NPR-Z0-9]{17}$` (keine Prüfziffer, kein Herstellercode). Ungültig: nichts wird gesendet. Ein Schalter `--nur-muster` ist daher nicht nötig.
- Key: `process.loadEnvFile()` im Skript, ausschließlich `VINDATA_API_KEY`. `process.env` wird nie vollständig ausgegeben, geloggt oder an Funktionen weitergereicht. Fehlt der Key: Dry-Run meldet "nein" (Exit 0), `--echt` bricht ab.
- Ein `fetch` (GET), `redirect: 'error'`, Timeout 15 s, kein Retry. Bei Fehlern im fetch nur Fehlername und `cause.code`, nie `err.message`.

## Dateien
- Rohantwort `data/vindata-probe-N.json` (gitignored, enthält die FIN), maskiert `data/vindata-probe-N.masked.json` (FIN: erste 3 Zeichen plus `***`, auch in verschachtelten Strings und Schlüsseln; der Key-Wert wird zu `[KEY]`). N zählt hoch, es wird nie überschrieben.
- Gilt für jede Antwort: 4xx/5xx, Fehlerantworten und Antworten ohne gültiges JSON (HTML, leerer Body). Bei "kein JSON" gibt das Skript Status und Content-Type aus, meldet "kein JSON" und wertet keine Felder aus.
- `data/` und `scratch/` stehen in `.gitignore` (geprüft).

## Terminalausgabe bei `--echt`
HTTP-Status, Dauer in ms, Content-Type, nur Header mit `ratelimit`, `usage`, `remaining`, `credit`, `quota` im Namen sowie `retry-after` (keine Cookies). Bei Fehlern `error` und `details` (maskiert, gekürzt). Sonst:
- `source` und `cachedAt` (auch als `cached_at` gefunden; bei v1: "fehlt").
- Fahrzeugobjekt: `vehicle` bzw. bei v1 `normalized` (die Ausgabe nennt, welches).
- Feldnamen: Die Auswertung akzeptiert snake_case und camelCase und nennt die gefundene Schreibweise, wenn sie vom angefragten Namen (camelCase) abweicht (siehe Befunde Lauf 1).
- Für `year`, `productionDate`, `series`, `model`, `variant`, `typeCode`, `engineCode`, `engineDescription`, `systemPowerKw`, `transmissionType`, `transmissionCode`, `bodyType`, `fuelType`, `driveType`, `steeringSide`: Wert, Typ, Unterscheidung null/fehlt.
- Anzahl Felder im Fahrzeugobjekt (ohne `options` und `allOptions`), davon null, davon nicht null.
- `engineCode`: enthält er Leerzeichen oder mehr als 6 Zeichen? Beginnt `engineDescription` mit dem `engineCode` (exakt, und ohne Leerraum verglichen)?
- `options` und `allOptions` (auch als `all_options` gefunden): Länge beider, inhaltlich identisch, Anteil der Codes nach `/^p[0-9a-z]{3}$/` (ohne `i`; zusätzlich Anzahl, die nur mit `i` passt), Anzahl Einträge mit leerem Code. Keine Beschreibungstexte.
- Vollständige Feldliste (Pfad, Typ, Array-Länge), ebenfalls maskiert.

## Hilfsfunktionen
Liegen in `src/vindata-probe-lib.js` (im Repo, reine Funktionen ohne Netz, Dateien und Logs), damit die Tests auch im gepushten Repo laufen. Das CLI `scratch/probe-vindata.js` ist gitignored.

## Testplan (`test/vindata-probe.test.js`, node:test, kein Netz, Fake-Daten und Fake-FIN)
- Maskierung: Wert, verschachtelter String, Schlüssel, Kleinschreibung, Key zu `[KEY]`.
- Feldliste: Objekte, Arrays mit Länge, null/Zahl/String.
- Dry-Run: Ausgabe enthält weder Fake-Key noch die übergebene FIN (auch nicht für v1 und mit `lang`), aber Pfad und Header-Name; bei v1 nur der Platzhalter `vin=<FIN>`.
- FIN-Vorabprüfung: zu kurz, I/O/Q, gültig.
- Argumente: unbekannter Schalter, `--lang` mit `vin-decode`, ungültiger Code.
- `compareOptions` (auch `all_options`), `checkEngineCode`, `checkEngineDescription`, `describeField` (fehlt/null/vorhanden, snake_case und camelCase, gefundene Schreibweise), `countVehicleFields`.
- Auswertung (`evaluateResponse`, gemeinsame Logik von `--echt` und `--auswerten`) mit Fake-Antworten in beiden Schreibweisen und für v1 (`normalized`): FIN und Beschreibungstexte nie im Klartext; Fehlerantwort (error/details), HTTP-Fehler, kein JSON (HTML, leer), unerwartete Form.
- Pfadprüfung für `--auswerten` (`resolveDataFile`, `isInsideDir`): nur `.json` unter `data/`, abgelehnt: außerhalb, `..`, Verzeichnis selbst, andere Endung, leer.
- `pickHeaders`: erfasst `ratelimit`, `usage`, `remaining`, `credit`, `quota`, `retry-after`; ignoriert Cookies.
- `nextProbeNumber`: zählt hoch, überschreibt nie.
- Fake-Env: Die Key-Auswahl liest nur `VINDATA_API_KEY`; ein Fake-Env mit weiteren Variablen (andere Keys, Secrets) taucht in keiner Ausgabe der Lib auf.

## Auswertungspunkte
- Welche der 15 Fahrzeugfelder sind gefüllt, null oder fehlend; Format von `engineCode`.
- Bedeutung von `options` gegenüber `allOptions`; Anteil der P-Codes; leere Codes.
- Unterschiede `vin-decode` und `v1` (Struktur, `lang`, Dauer).
- `source` cache oder live; `cachedAt`.
- Credits und Limit-Header; Fehlerform (400/401/403/429/502, nicht-JSON).

## Befunde Lauf 1
Ein echter Aufruf von `vin-decode` (Datei `data/vindata-probe-1.json`, nicht im Repo). Die Auswertung erfolgte durch Matthias; Claude Code hat die Datei nicht gelesen. Die Werte unten stammen aus seinem Befund.

- **Feldnamen: camelCase statt snake_case.** Die API liefert `productionDate`, `engineCode`, `engineDescription`, `systemPowerKw`, `transmissionType`, `transmissionCode`, `fuelType`, `typeCode`, `driveType`, `steeringSide`, `options`, `allOptions`. Die OpenAPI-Datei nennt snake_case (diese Spec weicht davon ab). Die erste Auswertung meldete deshalb fälschlich "fehlt". Seitdem prüft die Auswertung beide Schreibweisen (siehe oben).
- **Cache-Treffer zählt als API-Call.**
- **Keine Limit-Header.**
- **Antwortzeit:** 3,1 s bei `source` "cache".
- **Optionen:** `options` und `allOptions` haben je 160 Einträge, darunter ein fehlerhafter Code (`ls9r/`, entspricht nicht dem Muster `p` plus 3 Zeichen).
- **Vorhanden:** `transmissionCode` und `engineCode`. **Fehlt:** `bodyType`.
- **Feature-Flags:** rund 150 Felder sind immer null.

## Offene Punkte
Kosten pro Abruf und Monatslimit (Dashboard), Nutzungsbedingungen (Speichern, öffentliches Repo, Quellenangabe), Abweichungen der Fehlerform bei v1.
