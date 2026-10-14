// Lokaler Speicher (JSON-Datei): lookupFin liest nur, saveFin schreibt (atomar, nie bei beschädigter Datei).
// Keine Exceptions nach außen, keine Logs mit Inhalten, keine FIN in Fehlern.

const crypto = require('node:crypto');
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

// Liest die Speicherdatei. Ergebnis: { store } | { error } (error = fertiges Fehlerergebnis).
// Fehlende, leere oder nur aus Leerraum bestehende Datei zählt als leerer Speicher.
function readStore(filePath) {
  let text;
  try {
    const buffer = fs.readFileSync(filePath);
    // fatal: ungültiges UTF-8 wirft einen Fehler; ein BOM am Anfang wird dabei entfernt
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch (err) {
    if (err && err.code === 'ENOENT') return { store: {} };
    return { error: unavailable() };
  }

  if (text.trim() === '') return { store: {} };

  let store;
  try {
    store = JSON.parse(text);
  } catch {
    return { error: unavailable() };
  }
  if (!isPlainObject(store)) return { error: unavailable() };
  return { store };
}

// Ergebnis: { status: 'found', data } | { status: 'unknown' } | { status: 'error', code, message }
// 'unknown' nur, wenn die Datei fehlt, leer ist oder die FIN nicht vorkommt.
function lookupFin(fin, filePath = DEFAULT_FILE) {
  const { store, error } = readStore(filePath);
  if (error) return error;

  // hasOwn statt store[fin]: "constructor" oder "__proto__" sollen nie treffen
  if (!Object.hasOwn(store, fin)) return { status: 'unknown' };

  const entry = store[fin];
  if (!isPlainObject(entry) || !isPlainObject(entry.data)) return unavailable();

  // Nur die Fahrzeugdaten nach außen geben, nie source oder savedAt
  return { status: 'found', data: entry.data };
}

// Speichert { savedAt, source, data } unter der FIN. Ergebnis:
// { status: 'saved' } | { status: 'found', data } (FIN gab es schon, nichts geändert) | { status: 'error', code, message }
// Schreibt nie, wenn die Datei beschädigt ist oder der vorhandene Eintrag dieser FIN defekt ist.
// Andere Einträge werden unverändert übernommen, auch wenn einer davon selbst fehlerhaft ist.
function saveFin(fin, data, source, filePath = DEFAULT_FILE) {
  if (typeof fin !== 'string' || typeof source !== 'string' || !isPlainObject(data)) return unavailable();

  const { store, error } = readStore(filePath);
  if (error) return error;

  if (Object.hasOwn(store, fin)) {
    const entry = store[fin];
    if (!isPlainObject(entry) || !isPlainObject(entry.data)) return unavailable();
    return { status: 'found', data: entry.data };
  }

  // defineProperty statt store[fin] = ...: ein Schlüssel wie "__proto__" bliebe sonst wirkungslos
  const next = { ...store };
  Object.defineProperty(next, fin, {
    value: { savedAt: new Date().toISOString(), source, data },
    enumerable: true,
    writable: true,
    configurable: true,
  });

  // Erst in eine Temp-Datei im selben Ordner schreiben, dann umbenennen: nie eine halb geschriebene Datei
  const dir = path.dirname(filePath);
  const tmp = path.join(dir, `.${path.basename(filePath)}.${crypto.randomBytes(8).toString('hex')}.tmp`);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, { flag: 'wx' });
    fs.renameSync(tmp, filePath);
  } catch {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      // Aufräumen ist best effort; der Fehler an den Aufrufer bleibt neutral
    }
    return unavailable();
  }
  return { status: 'saved' };
}

module.exports = { lookupFin, saveFin };
