// Tests für den Speicher-Abgleich. Nur erfundene FINs, Temp-Dateien, kein Netzwerk.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { lookupFin } = require('../src/cache');
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
