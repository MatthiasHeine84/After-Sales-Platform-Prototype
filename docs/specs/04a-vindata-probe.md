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
- `source` und `cached_at` (bei v1: "fehlt").
- Fahrzeugobjekt: `vehicle` bzw. bei v1 `normalized` (die Ausgabe nennt, welches).
- Für `year`, `production_date`, `series`, `model`, `variant`, `engine_code`, `engine_description`, `system_power_kw`, `transmission_type`, `transmission_code`, `body_type`, `fuel_type`: Wert, Typ, Unterscheidung null/fehlt.
- `engine_code`: enthält er Leerzeichen oder mehr als 6 Zeichen?
- `options` und `all_options`: Länge beider, inhaltlich identisch, Anteil der Codes nach `/^p[0-9a-z]{3}$/` (ohne `i`; zusätzlich Anzahl, die nur mit `i` passt), Anzahl Einträge mit leerem Code. Keine Beschreibungstexte.
- Vollständige Feldliste (Pfad, Typ, Array-Länge), ebenfalls maskiert.

## Hilfsfunktionen
Liegen in `src/vindata-probe-lib.js` (im Repo, reine Funktionen ohne Netz, Dateien und Logs), damit die Tests auch im gepushten Repo laufen. Das CLI `scratch/probe-vindata.js` ist gitignored.

## Testplan (`test/vindata-probe.test.js`, node:test, kein Netz, Fake-Daten und Fake-FIN)
- Maskierung: Wert, verschachtelter String, Schlüssel, Kleinschreibung, Key zu `[KEY]`.
- Feldliste: Objekte, Arrays mit Länge, null/Zahl/String.
- Dry-Run: Ausgabe enthält weder Fake-Key noch die übergebene FIN (auch nicht für v1 und mit `lang`), aber Pfad und Header-Name; bei v1 nur der Platzhalter `vin=<FIN>`.
- FIN-Vorabprüfung: zu kurz, I/O/Q, gültig.
- Argumente: unbekannter Schalter, `--lang` mit `vin-decode`, ungültiger Code.
- `compareOptions`, `checkEngineCode`, `describeField` (fehlt/null/vorhanden).
- `pickHeaders`: erfasst `ratelimit`, `usage`, `remaining`, `credit`, `quota`, `retry-after`; ignoriert Cookies.
- `nextProbeNumber`: zählt hoch, überschreibt nie.
- Fake-Env: Die Key-Auswahl liest nur `VINDATA_API_KEY`; ein Fake-Env mit weiteren Variablen (andere Keys, Secrets) taucht in keiner Ausgabe der Lib auf.

## Auswertungspunkte
- Welche der 12 Fahrzeugfelder sind gefüllt, null oder fehlend; Format von `engine_code`.
- Bedeutung von `options` gegenüber `all_options`; Anteil der P-Codes; leere Codes.
- Unterschiede `vin-decode` und `v1` (Struktur, `lang`, Dauer).
- `source` cache oder live; `cached_at`.
- Credits und Limit-Header; Fehlerform (400/401/403/429/502, nicht-JSON).

## Offene Punkte
Kosten pro Abruf und Monatslimit (Dashboard), Nutzungsbedingungen (Speichern, öffentliches Repo, Quellenangabe), Abweichungen der Fehlerform bei v1.
