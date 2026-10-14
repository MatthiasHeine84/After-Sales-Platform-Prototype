// HTML der Landingpage als Text. Reine Funktion: kein Netzwerk, keine Dateien.
// Alle Werte von außen (Eingabe, Fahrzeugdaten) werden escaped.
// Die Gestaltung steht als <style>-Element hier: keine statischen Dateien, keine externen Schriften.

const MAX_ECHO = 64;

const STYLE = `
:root {
  color-scheme: dark;
  --bg: #0a1020;
  --surface: #111b2e;
  --line: #4a628a;
  --line-soft: #24344f;
  --text: #eef3fb;
  --text-muted: #b4c2d9;
  --text-field: #a9b8d0;
  --accent: #8db4f0;
  --button-bg: #f2f6fc;
  --button-text: #0a1020;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  line-height: 1.5;
}
main { max-width: 960px; margin: 0 auto; padding: 48px 20px 64px; }
.eyebrow {
  margin: 0 0 8px;
  color: var(--accent);
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.14em;
}
h1 {
  margin: 0 0 12px;
  font-size: clamp(2rem, 6vw, 3rem);
  line-height: 1.1;
  font-weight: 800;
  text-transform: uppercase;
}
.lead { margin: 0 0 32px; color: var(--text-muted); font-size: 1.125rem; }
label { display: block; margin-bottom: 4px; font-weight: 600; }
.hint { margin: 0 0 8px; color: var(--text-field); font-size: 0.875rem; }
.row { display: flex; gap: 12px; }
input[type="text"] {
  flex: 1;
  min-width: 0;
  min-height: 44px;
  padding: 10px 14px;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--line);
  border-radius: 8px;
  font: inherit;
}
button {
  min-height: 44px;
  padding: 10px 20px;
  background: var(--button-bg);
  color: var(--button-text);
  border: 1px solid var(--button-bg);
  border-radius: 8px;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
input:focus-visible, button:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
.notice {
  margin: 20px 0 0;
  padding: 14px 16px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.card {
  display: flex;
  gap: 24px;
  margin-top: 32px;
  padding: 24px;
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: 12px;
}
.tile {
  flex: none;
  display: grid;
  place-items: center;
  width: 88px;
  height: 66px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 8px;
  color: var(--accent);
  font-size: 1.4rem;
  letter-spacing: 0.04em;
}
dl {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(110px, max-content) 1fr;
  gap: 8px 24px;
  margin: 0;
  overflow-wrap: anywhere;
}
dt { color: var(--text-field); }
dd { margin: 0; font-weight: 600; }
@media (max-width: 560px) {
  main { padding-top: 32px; }
  .row { flex-direction: column; }
  .card { flex-direction: column; gap: 16px; padding: 20px; }
}
`;

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

function renderCard(data) {
  const rows = Object.entries(data)
    .map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(formatValue(value))}</dd>`)
    .join('');
  return `<section class="card">
<div class="tile" aria-hidden="true">AUTO</div>
<dl>${rows}</dl>
</section>`;
}

// input: Text, der im Feld stehen soll (wird auf 64 Zeichen gekürzt)
// error: Meldungstext oder undefined; data: Objekt mit Fahrzeugfeldern oder undefined
function renderPage({ input = '', error, data } = {}) {
  const echo = escapeHtml(String(input).slice(0, MAX_ECHO));
  const errorHtml = error ? `<p class="notice" role="alert">${escapeHtml(error)}</p>` : '';
  const dataHtml = data ? renderCard(data) : '';

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>Mein Fahrzeug</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<p class="eyebrow">MEIN FAHRZEUG</p>
<h1>Das steckt in deinem Auto</h1>
<p class="lead">Gib deine Fahrgestellnummer ein und sieh die technischen Daten deines Fahrzeugs.</p>
<form method="get" action="/">
<label for="fin">Fahrgestellnummer</label>
<p class="hint" id="fin-hint">17 Zeichen, siehe Zulassungsbescheinigung Feld E</p>
<div class="row">
<input id="fin" name="fin" type="text" maxlength="40" autocomplete="off" aria-describedby="fin-hint" value="${echo}">
<button type="submit">Fahrzeug anzeigen</button>
</div>
</form>
${errorHtml}
${dataHtml}
</main>
</body>
</html>
`;
}

module.exports = { renderPage };
