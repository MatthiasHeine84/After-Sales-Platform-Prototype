// Tests für den Mock-Decoder. Nur erfundene FINs, kein Netzwerk.
// Die erwarteten Labellisten stehen fest hier im Test (nicht aus data/ gelesen): data/ ist nicht im Repo.
const test = require('node:test');
const assert = require('node:assert');
const { decodeFin } = require('../src/decoder/mock');
const { validateFin } = require('../src/fin');

const MOCK_FINS = ['TESTMKA0000000001', 'TESTMKA0000000002', 'TESTMKA0000000003'];

// Labels der ID.4-Probe (41), in Reihenfolge
const LABELS_01 = [
  'VIN', 'Make', 'Model', 'Model Year', 'Product Type', 'Body', 'Trim', 'Fuel Type - Primary', 'Transmission',
  'Manufacturer', 'Manufacturer Address', 'Plant Country', 'Make Logo', 'Engine Manufacturer', 'CO2 Emission (g/km)',
  'Number Wheels', 'Number of Axles', 'Number of Doors', 'Number of Seats', 'Power Steering', 'Rear Brakes',
  'Suspension', 'Steering Type', 'Wheel Size', 'Wheel Size Array', 'Wheelbase (mm)', 'Wheelbase Array (mm)',
  'Height (mm)', 'Length (mm)', 'Width (mm)', 'Track Front (mm)', 'Track Rear (mm)', 'Max Speed (km/h)',
  'Weight Empty (kg)', 'Max Weight (kg)', 'Max roof load (kg)', 'Permitted towbar download (kg)',
  'Permitted trailer load without brakes (kg)', 'ABS', 'Check Digit', 'Sequential Number',
];

// Labels der Polo-Probe (30), in Reihenfolge
const LABELS_02 = [
  'VIN', 'Vehicle ID', 'Make', 'Model', 'Model Year', 'Product Type', 'Make Logo',
  'Fuel Consumption Combined (l/100km)', 'Fuel Consumption Extra Urban (l/100km)', 'Fuel Consumption Urban (l/100km)',
  'CO2 Emission (g/km)', 'Number of Axles', 'Number of Seats', 'Power Steering', 'Steering Type', 'Wheel Size',
  'Wheel Size Array', 'Wheelbase (mm)', 'Wheelbase Array (mm)', 'Height (mm)', 'Length (mm)', 'Width (mm)',
  'Max Speed (km/h)', 'Weight Empty (kg)', 'Max Weight (kg)', 'Max roof load (kg)', 'Permitted towbar download (kg)',
  'ABS', 'Check Digit', 'Sequential Number',
];

const LABELS_03 = ['Make', 'Model', 'Model Year'];

// Einträge mit zusätzlichem id-Feld laut Proben
const IDS_01 = ['Make', 'Model', 'Product Type', 'Body', 'Fuel Type - Primary', 'Transmission'];
const IDS_02 = ['Make', 'Model', 'Product Type'];

const decodeList = (fin) => decodeFin(fin).data.decode;
const labelsOf = (fin) => decodeList(fin).map((item) => item.label);
const valueOf = (fin, label) => decodeList(fin).find((item) => item.label === label).value;

test('Die drei Mock-FINs bestehen die Formatprüfung', () => {
  for (const fin of MOCK_FINS) {
    assert.deepStrictEqual(validateFin(fin), { ok: true, fin });
  }
});

test('Mock-FINs liefern found mit decode-Liste aus label, value und optional id', () => {
  for (const fin of MOCK_FINS) {
    const result = decodeFin(fin);
    assert.strictEqual(result.status, 'found', fin);
    assert.ok(Array.isArray(result.data.decode), fin);
    for (const item of result.data.decode) {
      const keys = Object.keys(item).sort();
      assert.ok(['label,value', 'id,label,value'].includes(keys.join()), `${fin}: ${keys}`);
      assert.strictEqual(typeof item.label, 'string');
      // Werttypen wie in den Proben: Text, Zahl oder Liste
      assert.ok(['string', 'number'].includes(typeof item.value) || Array.isArray(item.value), `${fin}: ${item.label}`);
    }
  }
});

test('Labellisten: 01 wie ID.4-Probe (41), 02 wie Polo-Probe (30), 03 nur Make, Model, Model Year', () => {
  assert.strictEqual(LABELS_01.length, 41);
  assert.strictEqual(LABELS_02.length, 30);
  assert.deepStrictEqual(labelsOf(MOCK_FINS[0]), LABELS_01);
  assert.deepStrictEqual(labelsOf(MOCK_FINS[1]), LABELS_02);
  assert.deepStrictEqual(labelsOf(MOCK_FINS[2]), LABELS_03);
});

test('id-Felder nur dort, wo die Proben eines haben, und als Zahl', () => {
  const withId = (fin) => decodeList(fin).filter((item) => 'id' in item);
  assert.deepStrictEqual(withId(MOCK_FINS[0]).map((item) => item.label), IDS_01);
  assert.deepStrictEqual(withId(MOCK_FINS[1]).map((item) => item.label), IDS_02);
  assert.deepStrictEqual(withId(MOCK_FINS[2]), []);
  for (const fin of MOCK_FINS) for (const item of withId(fin)) assert.strictEqual(typeof item.id, 'number');
});

test('Werttypen wie in den Proben: Zahl, Text, Text-Zahl, Liste', () => {
  const [one, two] = MOCK_FINS;
  assert.strictEqual(typeof valueOf(one, 'Model Year'), 'number');
  assert.strictEqual(typeof valueOf(one, 'Number of Seats'), 'string'); // Text-Zahl
  assert.strictEqual(typeof valueOf(one, 'CO2 Emission (g/km)'), 'number');
  assert.ok(Array.isArray(valueOf(one, 'Wheel Size Array')));
  assert.ok(Array.isArray(valueOf(one, 'Wheelbase Array (mm)')));
  assert.strictEqual(typeof valueOf(two, 'Vehicle ID'), 'number');
  assert.ok(Array.isArray(valueOf(two, 'Wheel Size Array')));
});

test('Alle Werte erfunden: VIN = Fake-FIN, Logo example.invalid, Make Testmarke, Mehrfachmodell in 01', () => {
  for (const fin of MOCK_FINS.slice(0, 2)) {
    assert.strictEqual(valueOf(fin, 'VIN'), fin);
    assert.ok(valueOf(fin, 'Make Logo').startsWith('https://example.invalid/'), fin);
    assert.strictEqual(valueOf(fin, 'Check Digit'), '0');
  }
  for (const fin of MOCK_FINS) assert.strictEqual(valueOf(fin, 'Make'), 'Testmarke');
  assert.strictEqual(valueOf(MOCK_FINS[0], 'Model'), 'Testmodell E, Testmodell F');
  assert.strictEqual(valueOf(MOCK_FINS[0], 'Sequential Number'), '000001');
  assert.strictEqual(valueOf(MOCK_FINS[1], 'Sequential Number'), '000002');
});

test('Keine Probe-Werte in den Fixtures: keine echten Marken, Modelle, Hersteller, Adressen oder API-Hosts', () => {
  const all = JSON.stringify(MOCK_FINS.map((fin) => decodeFin(fin).data));
  for (const word of ['Volkswagen', 'VOLKSWAGEN', 'Polo', 'ID.4', 'ID.5', 'Wolfsburg', 'WOLFSBURG', 'Germany', 'vincario', 'Vincario']) {
    assert.ok(!all.includes(word), word);
  }
});

test('Andere FINs und Sonderwerte: nodata', () => {
  for (const input of ['ZZZZZZZZ987654321', 'TESTMKA0000000004', 'constructor', '__proto__', 'toString', '', undefined, null, 42]) {
    assert.deepStrictEqual(decodeFin(input), { status: 'nodata' }, String(input));
  }
});

test('Rückgabe ist eine Kopie: Änderungen wirken nicht auf spätere Aufrufe', () => {
  const first = decodeFin(MOCK_FINS[0]);
  first.data.decode[1].value = 'GEÄNDERT';
  first.data.decode[24].value.push('GEÄNDERT'); // Wheel Size Array: Listenwert
  first.data.decode.pop();
  const second = decodeFin(MOCK_FINS[0]);
  assert.strictEqual(second.data.decode[1].value, 'Testmarke');
  assert.deepStrictEqual(valueOf(MOCK_FINS[0], 'Wheel Size Array'), ['100/10 R10 10X', '110/11 R11 11X']);
  assert.strictEqual(second.data.decode.length, LABELS_01.length);
});
