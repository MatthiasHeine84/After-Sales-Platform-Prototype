// Tests für den Speicher-Abgleich. Nur erfundene FINs, Temp-Dateien, kein Netzwerk.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { lookupFin, saveFin } = require('../src/cache');
const { MESSAGES } = require('../src/fin');

const FAKE_FIN = 'ABCDEFGH123456789'; // erfunden
const OTHER_FIN = 'ZZZZZZZZ987654321'; // erfunden
const UNAVAILABLE = { status: 'error', code: 'unavailable', message: MESSAGES.unavailable };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fin-cache-test-'));
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

let counter = 0;
function writeFile(content) {
  const file = path.join(dir, `cache-${counter++}.json`);
  fs.writeFileSync(file, content);
  return file;
}

const RECORD = { savedAt: '2026-01-01', source: 'mock', data: { make: 'Testmarke', model: 'Testmodell' } };
const STORE = JSON.stringify({ [FAKE_FIN]: RECORD });

test('Treffer liefert nur data, nie source oder savedAt', () => {
  const result = lookupFin(FAKE_FIN, writeFile(STORE));
  assert.deepStrictEqual(result, { status: 'found', data: RECORD.data });
});

test('Unbekannte FIN: unknown, Datei bleibt unverändert', () => {
  const file = writeFile(STORE);
  const before = fs.readFileSync(file);
  assert.deepStrictEqual(lookupFin(OTHER_FIN, file), { status: 'unknown' });
  assert.ok(before.equals(fs.readFileSync(file)));
});

test('Datei fehlt: unknown, Datei wird nicht angelegt', () => {
  const file = path.join(dir, 'gibt-es-nicht.json');
  assert.deepStrictEqual(lookupFin(FAKE_FIN, file), { status: 'unknown' });
  assert.strictEqual(fs.existsSync(file), false);
});

test('Leere Datei oder nur Leerraum: unknown', () => {
  assert.deepStrictEqual(lookupFin(FAKE_FIN, writeFile('')), { status: 'unknown' });
  assert.deepStrictEqual(lookupFin(FAKE_FIN, writeFile('  \n ')), { status: 'unknown' });
});

test('Defektes JSON: error, Datei bleibt unverändert', () => {
  const file = writeFile('{ kaputt');
  const before = fs.readFileSync(file);
  assert.deepStrictEqual(lookupFin(FAKE_FIN, file), UNAVAILABLE);
  assert.ok(before.equals(fs.readFileSync(file)));
});

test('Inhalt ist kein Objekt ([], null, Zahl, Text): error', () => {
  for (const content of ['[]', 'null', '42', '"text"']) {
    assert.deepStrictEqual(lookupFin(FAKE_FIN, writeFile(content)), UNAVAILABLE, content);
  }
});

test('Datei mit BOM wird gelesen', () => {
  const file = writeFile(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(STORE)]));
  assert.deepStrictEqual(lookupFin(FAKE_FIN, file), { status: 'found', data: RECORD.data });
});

test('Ungültige Kodierung: error', () => {
  const file = writeFile(Buffer.from([0x7b, 0xff, 0xfe, 0x7d]));
  assert.deepStrictEqual(lookupFin(FAKE_FIN, file), UNAVAILABLE);
});

test('Pfad ist ein Ordner: error, nicht unknown', () => {
  assert.deepStrictEqual(lookupFin(FAKE_FIN, dir), UNAVAILABLE);
});

test('Eintrag ohne data-Objekt: error', () => {
  for (const entry of [{ savedAt: '2026-01-01' }, { data: 'text' }, { data: null }, { data: [] }, 'text', null]) {
    const file = writeFile(JSON.stringify({ [FAKE_FIN]: entry }));
    assert.deepStrictEqual(lookupFin(FAKE_FIN, file), UNAVAILABLE, JSON.stringify(entry));
  }
});

test('constructor und __proto__ treffen nie', () => {
  const file = writeFile('{}');
  assert.deepStrictEqual(lookupFin('constructor', file), { status: 'unknown' });
  assert.deepStrictEqual(lookupFin('__proto__', file), { status: 'unknown' });
});

// ---- saveFin ----

const NEW_DATA = { decode: [{ label: 'Make', value: 'Testmarke' }] };

// Eigener Unterordner pro Test, damit man prüfen kann, dass keine Temp-Dateien liegen bleiben
function freshDir() {
  return fs.mkdtempSync(path.join(dir, 'save-'));
}

test('saveFin: neue FIN in fehlender Datei, legt den Ordner an, lookupFin findet sie', () => {
  const file = path.join(freshDir(), 'unterordner', 'tiefer', 'cache.json');
  assert.deepStrictEqual(saveFin(FAKE_FIN, NEW_DATA, 'mock', file), { status: 'saved' });
  assert.deepStrictEqual(lookupFin(FAKE_FIN, file), { status: 'found', data: NEW_DATA });

  const entry = JSON.parse(fs.readFileSync(file, 'utf8'))[FAKE_FIN];
  assert.deepStrictEqual(Object.keys(entry).sort(), ['data', 'savedAt', 'source']);
  assert.strictEqual(entry.source, 'mock');
  assert.ok(!Number.isNaN(Date.parse(entry.savedAt)));
});

test('saveFin: leere und nur aus Leerraum bestehende Datei zählen als leerer Speicher', () => {
  for (const content of ['', '  \n\t ']) {
    const file = path.join(freshDir(), 'cache.json');
    fs.writeFileSync(file, content);
    assert.deepStrictEqual(saveFin(FAKE_FIN, NEW_DATA, 'mock', file), { status: 'saved' });
    assert.deepStrictEqual(lookupFin(FAKE_FIN, file), { status: 'found', data: NEW_DATA });
  }
});

test('saveFin: Einträge anderer FINs bleiben unverändert, auch ein fehlerhafter', () => {
  const file = path.join(freshDir(), 'cache.json');
  const others = { [FAKE_FIN]: RECORD, KAPUTT00000000001: 'kein Objekt', LEER0000000000001: null };
  fs.writeFileSync(file, JSON.stringify(others));
  assert.deepStrictEqual(saveFin(OTHER_FIN, NEW_DATA, 'mock', file), { status: 'saved' });

  const after = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const key of Object.keys(others)) assert.deepStrictEqual(after[key], others[key], key);
  assert.deepStrictEqual(after[OTHER_FIN].data, NEW_DATA);
  assert.strictEqual(Object.keys(after).length, 4);
});

test('saveFin: vorhandene FIN wird nicht überschrieben, Datei bleibt byte-gleich', () => {
  const file = writeFile(STORE);
  const before = fs.readFileSync(file);
  const result = saveFin(FAKE_FIN, { decode: [{ label: 'Make', value: 'Anders' }] }, 'mock', file);
  assert.deepStrictEqual(result, { status: 'found', data: RECORD.data });
  assert.ok(before.equals(fs.readFileSync(file)));
});

test('saveFin: defekter Eintrag der eigenen FIN: Fehler, Datei byte-gleich', () => {
  for (const entry of ['kaputt', null, { source: 'mock' }, { data: [] }]) {
    const file = writeFile(JSON.stringify({ [FAKE_FIN]: entry }));
    const before = fs.readFileSync(file);
    assert.deepStrictEqual(saveFin(FAKE_FIN, NEW_DATA, 'mock', file), UNAVAILABLE);
    assert.ok(before.equals(fs.readFileSync(file)));
  }
});

test('saveFin: beschädigte Datei bleibt byte-gleich, kein Schreiben, keine Temp-Datei', () => {
  const bad = [Buffer.from('{ kaputt'), Buffer.from('[]'), Buffer.from('"text"'), Buffer.from([0xff, 0xfe, 0x41])];
  for (const content of bad) {
    const folder = freshDir();
    const file = path.join(folder, 'cache.json');
    fs.writeFileSync(file, content);
    assert.deepStrictEqual(saveFin(FAKE_FIN, NEW_DATA, 'mock', file), UNAVAILABLE);
    assert.ok(content.equals(fs.readFileSync(file)));
    assert.deepStrictEqual(fs.readdirSync(folder), ['cache.json']);
  }
});

test('saveFin: Schreibfehler und Umbenennen-Fehler: neutraler Fehler, Datei unverändert, nichts bleibt liegen', (t) => {
  for (const method of ['writeFileSync', 'renameSync']) {
    const folder = freshDir();
    const file = path.join(folder, 'cache.json');
    fs.writeFileSync(file, STORE);
    const before = fs.readFileSync(file);

    t.mock.method(fs, method, () => {
      throw new Error(`Simulierter Fehler in ${method} für ${FAKE_FIN}`);
    });
    const result = saveFin(OTHER_FIN, NEW_DATA, 'mock', file);
    t.mock.restoreAll();

    assert.deepStrictEqual(result, UNAVAILABLE, method);
    assert.ok(!JSON.stringify(result).includes(OTHER_FIN), method);
    assert.ok(before.equals(fs.readFileSync(file)), method);
    assert.deepStrictEqual(fs.readdirSync(folder), ['cache.json'], method);
  }
});

test('saveFin: nach Erfolg liegt nur die Speicherdatei im Ordner (Temp-Datei weg)', () => {
  const folder = freshDir();
  const file = path.join(folder, 'cache.json');
  saveFin(FAKE_FIN, NEW_DATA, 'mock', file);
  saveFin(OTHER_FIN, NEW_DATA, 'mock', file);
  assert.deepStrictEqual(fs.readdirSync(folder), ['cache.json']);
  assert.strictEqual(Object.keys(JSON.parse(fs.readFileSync(file, 'utf8'))).length, 2);
});

test('saveFin: ungültige Argumente: Fehler, es entsteht keine Datei', () => {
  const folder = freshDir();
  const file = path.join(folder, 'cache.json');
  for (const [fin, data, source] of [
    [undefined, NEW_DATA, 'mock'],
    [FAKE_FIN, null, 'mock'],
    [FAKE_FIN, [], 'mock'],
    [FAKE_FIN, 'text', 'mock'],
    [FAKE_FIN, NEW_DATA, undefined],
  ]) {
    assert.deepStrictEqual(saveFin(fin, data, source, file), UNAVAILABLE);
  }
  assert.deepStrictEqual(fs.readdirSync(folder), []);
});

test('saveFin: Schlüssel __proto__ wird als normaler Eintrag gespeichert, ohne Prototyp zu ändern', () => {
  const file = path.join(freshDir(), 'cache.json');
  assert.deepStrictEqual(saveFin('__proto__', NEW_DATA, 'mock', file), { status: 'saved' });
  assert.strictEqual(Object.getPrototypeOf({}).decode, undefined);
  assert.deepStrictEqual(lookupFin('__proto__', file), { status: 'found', data: NEW_DATA });
});
