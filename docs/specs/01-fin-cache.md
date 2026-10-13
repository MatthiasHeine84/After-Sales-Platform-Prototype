# Spec 01: FIN-Eingabe und Abgleich mit lokalem Speicher

Status: Entwurf, 13.10.2026

## Ziel
Der Nutzer gibt eine FIN ein. Die App prüft das Format und gleicht die FIN mit dem lokalen Speicher ab. Ist die FIN bekannt, werden die gespeicherten Daten angezeigt, ohne API-Anfrage. Das schont das Trial-Kontingent (Log F03).

## Entscheidungen
- Stack: Node.js, Backend plus eine HTML-Seite. Die Wahl des Frameworks (Express oder nur Node-Bordmittel) wird im Planmodus bestätigt.
- Speicher: JSON-Datei `data/vin-cache.json`. `data/` steht in `.gitignore`. Eine Datenbank ist für diesen Umfang unnötig.
- Die Zerlegung in WMI, VDS und VIS und die Prüfziffer entfallen.

## Umfang
In Spec 01:
- Eingabefeld und Button.
- Normalisierung: Leerzeichen entfernen, Großbuchstaben.
- Formatprüfung (Log F04): genau 17 Zeichen, nur A–Z und 0–9, kein I, O, Q.
- Abgleich mit dem Speicher.
- Treffer: gespeicherten Datensatz anzeigen (einfache Feld/Wert-Liste, Gestaltung siehe UI-Vorgaben), ohne Hinweis auf die Herkunft.
- Kein Treffer: keine Meldung (neutraler Zustand, siehe Offene Fragen).

Nicht in Spec 01:
- Jeder API-Aufruf, auch Mock-Decoder (Spec 02) und Vincario live (Spec 03).
- Auswahl und Gestaltung der Fahrzeugfelder (Spec 02).
- Datensätze bearbeiten, löschen oder aktualisieren.
- Login, mehrere Nutzer.

## UI-Vorgaben
- Die Seite ist eine Landingpage für den Endanwender mit seinem eigenen Fahrzeug, kein Fachpersonal. Sie enthält eine kurze Überschrift mit einem Satz zum Nutzen und die Eingabe als Mittelpunkt. Texte ohne Fachbegriffe (kein "FIN-Decoder", kein "Cache"); der Wortlaut wird in Schritt 2 vorgeschlagen und freigegeben.
- Die Seite läuft nur lokal auf `localhost` über einen kleinen Node-Prozess. Kein Hosting, keine Erreichbarkeit aus dem Netzwerk.
- Es erscheinen keine Hinweise auf die Herkunft der Daten: weder "aus Speicher" noch Anbieter- oder API-Namen.
- Hinweise erscheinen nur bei falschem Format der FIN (Kriterium 1) und bei technischen Fehlern (Kriterium 5).
- Gestaltung nach `docs/design/README.md` (Stilregeln) und `docs/design/referenz-garage.png` (lokal, nicht im Repo). Sprache der Oberfläche: Deutsch.
- Technische Fehler (defekte Speicherdatei, später API-Ausfall): eine neutrale Meldung ohne Quellenbezug, z. B. "Daten momentan nicht verfügbar".

## Datensatz (Vorschlag)
Schlüssel ist die normalisierte FIN. Pro Eintrag: `savedAt` (Datum), `source` ("mock" oder "vincario"), `data` (Objekt mit den Fahrzeugfeldern). Die Feldstruktur wird mit der ersten echten Antwort in Spec 03 final festgelegt.

## Akzeptanzkriterien
1. Leere, zu kurze oder zu lange Eingabe, Sonderzeichen sowie I, O, Q ergeben eine verständliche Fehlermeldung. Es findet kein Abgleich statt.
2. Kleinbuchstaben und Leerzeichen werden normalisiert. Die Eingabe verhält sich wie die große Schreibweise.
3. FIN im Speicher: Datensatz wird angezeigt. Nirgends erscheint ein Hinweis, woher die Daten stammen.
4. FIN nicht im Speicher: keine Meldung, die Datei bleibt unverändert.
5. Datei fehlt oder ist leer: kein Absturz, Verhalten wie "nicht gespeichert". Datei ist kein gültiges JSON: neutrale Meldung ohne Quellenbezug, die Datei wird nicht überschrieben.
6. Automatisierte Tests decken die Punkte 1 bis 5 ab, ohne Netzwerkzugriff. `npm test` läuft grün durch.
7. Tests und Fixtures nutzen ausschließlich erfundene FINs. Die echten FINs (ID.4, Polo) werden nur manuell in `data/` eingetragen und tauchen nie in `git status` auf.

## Sicherheit und Datenschutz
- Keine API-Keys oder `.env`-Zugriffe in diesem Schritt.
- Das Repo ist öffentlich: keine echten FINs im Code, in Tests oder in Commits.

## Offene Fragen
- Neutraler Zustand bei gültiger, unbekannter FIN in Spec 01: leere Seite reicht, weil es noch keine Datenquelle gibt. Ab Spec 02 erneut klären.
- Vincario-Bedingungen: Könnte eine Quellenangabe verlangt sein? Das würde der Vorgabe "keine Herkunftshinweise" widersprechen. Prüfen vor Spec 03.
- Vincario-Nutzungsbedingungen: Ist das Zwischenspeichern von API-Antworten erlaubt? Zu klären vor Spec 03 und vor dem Speichern echter Antworten.
- Express oder Node-Bordmittel: Empfehlung im Planmodus.

## Ausblick
- Spec 02: Mock-Decoder als Datenquelle. Bei unbekannter FIN wird ein Mock-Datensatz geholt, gespeichert und angezeigt. Dazu die Feldauswahl (Hersteller, Modell, Karosserie, Motor/Kraftstoff, Antrieb, Getriebe, Abgasnorm, Maße, Gewichte). Das Modelljahr erst nach Abgleich mit einer echten Antwort.
- Spec 03: Vincario live statt Mock, nur nach ausdrücklicher Freigabe, gedeckelt.
