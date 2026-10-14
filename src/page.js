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
.info { flex: 1; min-width: 0; overflow-wrap: anywhere; }
h2 { margin: 0 0 4px; font-size: 1.5rem; line-height: 1.2; font-weight: 800; }
.subline { margin: 0 0 16px; color: var(--text-muted); }
dl {
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

// Anzeigbarer Text oder undefined: nur nicht-leere Texte und endliche Zahlen zählen.
// Objekte, Listen, null, Wahrheitswerte und leere Texte gelten als fehlend (nie als JSON anzeigen).
function toText(value) {
  if (typeof value === 'string') return value.trim() === '' ? undefined : value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

// Label -> Wert aus data.decode. Doppelte Labels: der erste gewinnt. Alles Unpassende wird übersprungen.
function readFields(data) {
  const fields = new Map();
  const list = data && typeof data === 'object' ? data.decode : undefined;
  if (!Array.isArray(list)) return fields;
  for (const item of list) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue;
    if (typeof item.label !== 'string' || fields.has(item.label)) continue;
    fields.set(item.label, toText(item.value));
  }
  return fields;
}

// Nur diese Felder werden angezeigt (Spec 02). Nicht angezeigt: Make Logo, Model ID, Transmission ID, Vehicle ID, Color ID.
// Jede Zeile: deutsche Beschriftung und die Quell-Labels in Reihenfolge der Bevorzugung (erstes vorhandenes zählt).
const LIST_ROWS = [
  { title: 'Getriebe', labels: ['Transmission (full)', 'Transmission'] },
  { title: 'Motorleistung', labels: ['Engine Power (kW)'], suffix: ' kW' },
  { title: 'Motorcode', labels: ['Engine Code'] },
  { title: 'Motormodell', labels: ['Engine Model'] },
  { title: 'Farbe', labels: ['Color'] },
  { title: 'Ausstattung', labels: ['Vehicle Specification'] },
];

function firstOf(fields, labels) {
  for (const label of labels) {
    const value = fields.get(label);
    if (value !== undefined) return value;
  }
  return undefined;
}

function renderCard(data) {
  const fields = readFields(data);
  const title = [fields.get('Make'), fields.get('Model')].filter(Boolean).join(' ') || 'Dein Fahrzeug';
  const subtitle = [fields.get('Model Year'), fields.get('Engine (full)')].filter(Boolean).join(' · ');

  const rows = LIST_ROWS.map(({ title: name, labels, suffix = '' }) => {
    const value = firstOf(fields, labels);
    return value === undefined ? '' : `<dt>${escapeHtml(name)}</dt><dd>${escapeHtml(value + suffix)}</dd>`;
  }).join('');

  return `<section class="card">
<div class="tile" aria-hidden="true">AUTO</div>
<div class="info">
<h2>${escapeHtml(title)}</h2>
${subtitle ? `<p class="subline">${escapeHtml(subtitle)}</p>` : ''}${rows ? `<dl>${rows}</dl>` : ''}
</div>
</section>`;
}

// input: Text, der im Feld stehen soll (wird auf 64 Zeichen gekürzt)
// error: Fehlermeldung (role="alert") oder undefined; notice: neutrale Meldung (role="status") oder undefined
// data: Datensatz { decode: [{ label, value }] } oder undefined
function renderPage({ input = '', error, notice, data } = {}) {
  const echo = escapeHtml(String(input).slice(0, MAX_ECHO));
  const errorHtml = error
    ? `<p class="notice" role="alert">${escapeHtml(error)}</p>`
    : notice
      ? `<p class="notice" role="status">${escapeHtml(notice)}</p>`
      : '';
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
