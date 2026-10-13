# FIN-Decoder

Lokale Lern-Webseite: Man gibt eine FIN (VIN) ein, sie wird lokal in ihre Bestandteile zerlegt, dazu werden technische Fahrzeugdaten aus der Vincario-API angezeigt. Der Stack ist offen: Untersuche das Projekt, schlage einen Stack vor und lass ihn bestätigen, bevor du Code schreibst.

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
