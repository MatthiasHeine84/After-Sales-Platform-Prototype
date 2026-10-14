// Abgleich einer FIN mit dem lokalen Speicher (JSON-Datei). Nur lesen, nie schreiben.
// Keine Exceptions nach außen, keine Logs mit Inhalten.

const fs = require('node:fs');
const path = require('node:path');
const { MESSAGES } = require('./fin');

const DEFAULT_FILE = path.join(__dirname, '..', 'data', 'vin-cache.json');

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unavailable() {
  return { status: 'error', code: 'unavailable', message: MESSAGES.unavailable };
}

// Ergebnis: { status: 'found', data } | { status: 'unknown' } | { status: 'error', code, message }
// 'unknown' nur, wenn die Datei fehlt, leer ist oder die FIN nicht vorkommt.
function lookupFin(fin, filePath = DEFAULT_FILE) {
  let text;
  try {
    const buffer = fs.readFileSync(filePath);
    // fatal: ungültiges UTF-8 wirft einen Fehler; ein BOM am Anfang wird dabei entfernt
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch (err) {
    if (err && err.code === 'ENOENT') return { status: 'unknown' };
    return unavailable();
  }

  if (text.trim() === '') return { status: 'unknown' };

  let store;
  try {
    store = JSON.parse(text);
  } catch {
    return unavailable();
  }
  if (!isPlainObject(store)) return unavailable();

  // hasOwn statt store[fin]: "constructor" oder "__proto__" sollen nie treffen
  if (!Object.hasOwn(store, fin)) return { status: 'unknown' };

  const entry = store[fin];
  if (!isPlainObject(entry) || !isPlainObject(entry.data)) return unavailable();

  // Nur die Fahrzeugdaten nach außen geben, nie source oder savedAt
  return { status: 'found', data: entry.data };
}

module.exports = { lookupFin };
