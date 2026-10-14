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

## 03b Live-Anbindung (Entwurf)
- Entscheidungen: Kein Umschalter. Der Server nutzt immer den Vincario-Decoder für gültige, im Speicher unbekannte FINs. Der Mock bleibt nur für Tests (Injektion).
- Obergrenze 3 echte Abrufe pro Serverstart (im Arbeitsspeicher). Danach "Daten momentan nicht verfügbar." (500) ohne API-Aufruf.
- Schnittstelle bleibt decodeFin(fin), jetzt asynchron (await in server.js). Aufruf mit fetch, Timeout 8 Sekunden, keine Pakete.
- Gleichzeitige Abrufe derselben FIN werden zusammengefasst (ein API-Aufruf).
- API-Fehler oder "keine Daten": nicht speichern. Quelle im Eintrag: source "vincario".
- Nie loggen: URL, Keys, FIN, Antworttext. Fehler nach außen nur neutral.
- Tests ohne Netzwerk, mit injiziertem Fake-fetch und den Fixtures aus 03a.
- Offene Punkte aus der Probe: Fehlercodes, Modelljahr (Stelle 10), Doppelung Engine (full) und Motorleistung, Credit-Kosten, Vincario-T&C (Zwischenspeichern und Quellenangabe unklar).
