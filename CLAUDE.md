# FIN-Decoder

Lokale Lern-Webseite: Man gibt eine FIN (VIN) ein. Bekannte FINs werden aus dem lokalen Speicher angezeigt, unbekannte über die Vincario-API abgefragt und gespeichert (Specs 01 bis 03). Stack ist Node.js. Das Framework (Express oder Node-Bordmittel) ist offen: Schlage es vor und lass es bestätigen, bevor du Code schreibst.

## Specs und Design

- Specs liegen in `docs/specs/NN-name.md`, jeweils eine pro Feature. Lies vor jeder Umsetzung die passende Spec. Weicht dein Plan von der Spec ab, frag nach, statt still abzuweichen.
- Die Stilregeln der Oberfläche stehen in `docs/design/README.md`. Zielnutzer ist der Endanwender mit seinem eigenen Fahrzeug. In der Oberfläche erscheinen keine Hinweise auf die Datenherkunft, nur bei falschem FIN-Format und bei technischen Fehlern eine neutrale Meldung.
- `docs/design/*.png` ist nur lokal (nicht im Repo).

## Arbeitsweise

- Arbeite in kleinen, einzeln überprüfbaren Schritten und halte nach jedem Schritt an.
- Verifikation: Jeder Schritt braucht ein Ergebnis, das du selbst prüfen kannst (Test, Befehl, Aufruf im Browser). Führe die Prüfung aus und zeige die Ausgabe als Beleg, bevor du "fertig" sagst. Behaupte keinen Erfolg ohne Beleg.
- Plan zuerst, wenn mehr als eine Datei betroffen oder der Ansatz unklar ist. Bei Änderungen, die sich in einem Satz beschreiben lassen, direkt umsetzen.
- Wähle die einfachste funktionierende Lösung. Keine zusätzlichen Frameworks, Datenbanken oder Abstraktionen auf Vorrat.
- Ändere nichts außerhalb der Aufgabe. Installiere Pakete und führe löschende Befehle nur nach Rückfrage aus.

## Sicherheit

- IMPORTANT: API-Key und Secret Key stehen nur in `.env` und werden über Umgebungsvariablen gelesen. Nie im Code, in Kommentaren, Logs, Fehlermeldungen oder im Chat. Lies, zeige oder kopiere `.env` nie.
- Der Secret Key dient nur zur Berechnung der Control Sum und wird nie gesendet. API-Aufrufe laufen nur über das Backend, nie aus dem Browser.
- Der API-Key steckt in der Vincario-URL: Logge oder zeige nie vollständige Anfrage-URLs.
- IMPORTANT: Rufe die Vincario-API nur nach meiner ausdrücklichen Freigabe auf, nie in Schleifen oder Tests, und nenne vorher das Restguthaben. Das Trial-Kontingent ist klein.
- Das Repo ist öffentlich: Committe nichts mit Keys, echten FINs oder persönlichen Daten. `.env` und Testdaten stehen in `.gitignore`.

## Git

- Schlage nach jedem erfolgreichen Schritt einen Commit mit kurzer deutscher Nachricht vor und führe ihn erst nach meinem Okay aus.
- Kein `push`, kein `force`, kein Löschen von Branches ohne Zustimmung.

## Befehle

Trage Start-, Test- und Lint-Befehle erst ein, wenn sie existieren.

- _noch offen_

## Fortschritt

Lies zu Beginn jeder Sitzung `PROGRESS.md`. Aktualisiere die Datei nach jedem abgeschlossenen Schritt (nach meinem Okay) in 1–2 Zeilen.

## Bei Kontext-Zusammenfassung

Behalte die Liste der geänderten Dateien, die Testbefehle und den aktuellen Schritt.
