// Tests für den Mock-Decoder. Nur erfundene FINs, kein Netzwerk.
const test = require('node:test');
const assert = require('node:assert');
const { decodeFin } = require('../src/decoder/mock');
const { validateFin } = require('../src/fin');

const MOCK_FINS = ['TESTMKA0000000001', 'TESTMKA0000000002', 'TESTMKA0000000003'];

const KNOWN_LABELS = [
  'Make', 'Make Logo', 'Model', 'Model ID', 'Model Year', 'Transmission', 'Transmission (full)',
  'Transmission ID', 'Vehicle Specification', 'Vehicle ID', 'Engine Model', 'Engine Power (kW)',
  'Engine (full)', 'Engine Code', 'Color', 'Color ID',
];

test('Die drei Mock-FINs bestehen die Formatprüfung', () => {
  for (const fin of MOCK_FINS) {
    assert.deepStrictEqual(validateFin(fin), { ok: true, fin });
  }
});

test('Mock-FINs liefern found mit decode-Liste aus label und value', () => {
  for (const fin of MOCK_FINS) {
    const result = decodeFin(fin);
    assert.strictEqual(result.status, 'found', fin);
    assert.ok(Array.isArray(result.data.decode), fin);
    assert.ok(result.data.decode.length > 0, fin);
    for (const item of result.data.decode) {
      assert.deepStrictEqual(Object.keys(item).sort(), ['label', 'value'], fin);
      assert.ok(KNOWN_LABELS.includes(item.label), `${fin}: ${item.label}`);
    }
  }
});

test('Erster Datensatz hat alle 16 Felder, dritter hat fehlende Felder', () => {
  const full = decodeFin(MOCK_FINS[0]).data.decode.map((item) => item.label);
  assert.deepStrictEqual(full, KNOWN_LABELS);

  const sparse = decodeFin(MOCK_FINS[2]).data.decode.map((item) => item.label);
  assert.ok(sparse.length < KNOWN_LABELS.length);
  assert.ok(!sparse.includes('Engine (full)'));
  assert.ok(!sparse.includes('Color'));
});

test('Andere FINs und Sonderwerte: nodata', () => {
  for (const input of ['ZZZZZZZZ987654321', 'TESTMKA0000000004', 'constructor', '__proto__', 'toString', '', undefined, null, 42]) {
    assert.deepStrictEqual(decodeFin(input), { status: 'nodata' }, String(input));
  }
});

test('Rückgabe ist eine Kopie: Änderungen wirken nicht auf spätere Aufrufe', () => {
  const first = decodeFin(MOCK_FINS[0]);
  first.data.decode[0].value = 'GEÄNDERT';
  first.data.decode.pop();
  const second = decodeFin(MOCK_FINS[0]);
  assert.strictEqual(second.data.decode[0].value, 'Testmarke');
  assert.strictEqual(second.data.decode.length, KNOWN_LABELS.length);
});
