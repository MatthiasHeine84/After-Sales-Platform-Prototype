// HTML der Landingpage als Text. Reine Funktion: kein Netzwerk, keine Dateien.
// Alle Werte von außen (Eingabe, Fahrzeugdaten) werden escaped.
// Gestaltung folgt in Schritt 6 als <style>-Element hier, nicht als Datei.

const MAX_ECHO = 64;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatValue(value) {
  return typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
}

function renderData(data) {
  const rows = Object.entries(data)
    .map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(formatValue(value))}</dd>`)
    .join('');
  return `<dl>${rows}</dl>`;
}

// input: Text, der im Feld stehen soll (wird auf 64 Zeichen gekürzt)
// error: Meldungstext oder undefined; data: Objekt mit Fahrzeugfeldern oder undefined
function renderPage({ input = '', error, data } = {}) {
  const echo = escapeHtml(String(input).slice(0, MAX_ECHO));
  const errorHtml = error ? `<p role="alert">${escapeHtml(error)}</p>` : '';
  const dataHtml = data ? renderData(data) : '';

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mein Fahrzeug</title>
</head>
<body>
<main>
<p>MEIN FAHRZEUG</p>
<h1>Das steckt in deinem Auto</h1>
<p>Gib deine Fahrgestellnummer ein und sieh, welches Auto du fährst.</p>
<form method="get" action="/">
<label for="fin">Fahrgestellnummer</label>
<input id="fin" name="fin" type="text" maxlength="40" autocomplete="off" placeholder="17 Zeichen, steht im Fahrzeugschein" value="${echo}">
<button type="submit">Fahrzeug anzeigen</button>
</form>
${errorHtml}
${dataHtml}
</main>
</body>
</html>
`;
}

module.exports = { renderPage };
