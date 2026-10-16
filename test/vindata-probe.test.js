// Tests für die Hilfsfunktionen der VINdata-Probe (Spec 04a). Nur erfundene Daten, kein Netzwerk.
const test = require('node:test');
const assert = require('node:assert');
const { validateFin } = require('../src/fin');
const {
  parseArgs,
  readApiKey,
  maskFin,
  maskText,
  buildRequest,
  buildUrl,
  buildDryRunLines,
  describeField,
  checkEngineCode,
  compareOptions,
  listFields,
  pickHeaders,
  nextProbeNumber,
} = require('../src/vindata-probe-lib');

const FAKE_FIN = 'ABCDEFGH123456789'; // erfunden, 17 Zeichen, kein I, O, Q
const FAKE_KEY = 'fake-key-0123456789abcdef';

test('FIN-Vorabprüfung: gültig, zu kurz, I/O/Q', () => {
  assert.strictEqual(validateFin(FAKE_FIN).ok, true);
  assert.strictEqual(validateFin('ABCDEFGH1234567').ok, false);
  assert.strictEqual(validateFin('ABCDEFGH12345678I').ok, false);
  assert.strictEqual(validateFin('ABCDEFGH12345678O').code, 'chars');
  assert.strictEqual(validateFin(undefined).ok, false);
});

test('parseArgs: Standard ist Trockenlauf mit vin-decode', () => {
  assert.deepStrictEqual(parseArgs([FAKE_FIN]), {
    fin: FAKE_FIN,
    echt: false,
    endpoint: 'vin-decode',
    lang: undefined,
  });
});

test('parseArgs: --echt, --endpoint und --lang in beliebiger Reihenfolge', () => {
  const r = parseArgs(['--endpoint', 'vin-decode/v1', FAKE_FIN, '--lang', 'de', '--echt']);
  assert.deepStrictEqual(r, { fin: FAKE_FIN, echt: true, endpoint: 'vin-decode/v1', lang: 'de' });
});

test('parseArgs: Fehler bei unbekanntem Schalter, fehlendem Wert, falschen Werten', () => {
  assert.ok(parseArgs([FAKE_FIN, '--info']).error);
  assert.ok(parseArgs([FAKE_FIN, '--endpoint']).error);
  assert.ok(parseArgs([FAKE_FIN, '--endpoint', 'vin-decode/v2']).error);
  assert.ok(parseArgs([FAKE_FIN, '--endpoint', 'vin-decode/v1', '--lang']).error);
  assert.ok(parseArgs([FAKE_FIN, '--endpoint', 'vin-decode/v1', '--lang', 'xx']).error);
  assert.ok(parseArgs([FAKE_FIN, 'ZWEITEFIN']).error);
});

test('parseArgs: --lang nur mit vin-decode/v1', () => {
  assert.ok(parseArgs([FAKE_FIN, '--lang', 'de']).error);
  assert.ok(parseArgs([FAKE_FIN, '--endpoint', 'vin-decode', '--lang', 'de']).error);
});

test('parseArgs: Fehlertexte enthalten weder FIN noch Argumentwerte', () => {
  const errors = [
    parseArgs([FAKE_FIN, '--geheim-' + FAKE_KEY]).error,
    parseArgs([FAKE_FIN, '--endpoint', FAKE_KEY]).error,
    parseArgs([FAKE_FIN, '--endpoint', 'vin-decode/v1', '--lang', FAKE_KEY]).error,
    parseArgs([FAKE_FIN, FAKE_FIN + 'X']).error,
  ];
  for (const text of errors) {
    assert.ok(text);
    assert.ok(!text.includes(FAKE_FIN));
    assert.ok(!text.includes(FAKE_KEY));
  }
});

test('readApiKey: liest nur VINDATA_API_KEY und zählt das übrige Env nicht auf', () => {
  const accessed = [];
  const env = new Proxy(
    { VINDATA_API_KEY: FAKE_KEY, OTHER_SECRET: 'anderes-geheimnis', VINCARIO_API_KEY: 'noch-ein-key' },
    {
      get(target, prop) {
        accessed.push(String(prop));
        return target[prop];
      },
      has(target, prop) {
        accessed.push(String(prop));
        return prop in target;
      },
      ownKeys() {
        throw new Error('Env wurde aufgezählt');
      },
    },
  );
  assert.strictEqual(readApiKey(env), FAKE_KEY);
  assert.deepStrictEqual(accessed, ['VINDATA_API_KEY']);
});

test('readApiKey: fehlend, leer oder kein Objekt ergibt undefined', () => {
  assert.strictEqual(readApiKey({}), undefined);
  assert.strictEqual(readApiKey({ VINDATA_API_KEY: '' }), undefined);
  assert.strictEqual(readApiKey({ VINDATA_API_KEY: 42 }), undefined);
  assert.strictEqual(readApiKey(undefined), undefined);
  assert.strictEqual(readApiKey(null), undefined);
});

test('maskFin: nur die ersten 3 Zeichen', () => {
  assert.strictEqual(maskFin(FAKE_FIN), 'ABC***');
});

test('maskText: Wert, verschachtelter String, Schlüssel, Kleinschreibung', () => {
  const raw = JSON.stringify({
    vin: FAKE_FIN,
    nested: { note: `Fahrzeug ${FAKE_FIN.toLowerCase()} gefunden`, [FAKE_FIN]: 1 },
    list: [FAKE_FIN, { x: `${FAKE_FIN}${FAKE_FIN}` }],
  });
  const masked = maskText(raw, FAKE_FIN);
  assert.ok(!masked.toUpperCase().includes(FAKE_FIN));
  assert.ok(masked.includes('"vin":"ABC***"'));
  assert.ok(masked.includes('"ABC***":1'));
  assert.deepStrictEqual(Object.keys(JSON.parse(masked)), ['vin', 'nested', 'list']);
});

test('maskText: Key wird zu [KEY], ohne Key bleibt der Rest unverändert', () => {
  const text = `Header ${FAKE_KEY} und ${FAKE_KEY}`;
  assert.strictEqual(maskText(text, FAKE_FIN, FAKE_KEY), 'Header [KEY] und [KEY]');
  assert.strictEqual(maskText('nichts zu tun', FAKE_FIN), 'nichts zu tun');
  assert.strictEqual(maskText('nichts zu tun', undefined, undefined), 'nichts zu tun');
});

test('maskText: Nicht-Text wird zu Text, kein Absturz', () => {
  assert.strictEqual(maskText(null, FAKE_FIN), 'null');
  assert.strictEqual(maskText(undefined, FAKE_FIN), 'undefined');
  assert.strictEqual(maskText(12, FAKE_FIN), '12');
});

test('buildRequest: Pfad, Header-Name und Platzhalter statt FIN', () => {
  assert.deepStrictEqual(buildRequest({ endpoint: 'vin-decode' }), {
    host: 'https://vindata.io',
    path: '/api/public/vin-decode',
    query: 'vin=<FIN>',
    headerName: 'x-api-key',
  });
  const v1 = buildRequest({ endpoint: 'vin-decode/v1', lang: 'de' });
  assert.strictEqual(v1.path, '/api/public/vin-decode/v1');
  assert.strictEqual(v1.query, 'vin=<FIN>&lang=de');
});

test('buildUrl: enthält die FIN als vin-Parameter und lang nur bei v1', () => {
  const plain = new URL(buildUrl({ endpoint: 'vin-decode', fin: FAKE_FIN }));
  assert.strictEqual(plain.origin + plain.pathname, 'https://vindata.io/api/public/vin-decode');
  assert.strictEqual(plain.searchParams.get('vin'), FAKE_FIN);
  assert.strictEqual(plain.searchParams.get('lang'), null);
  const v1 = new URL(buildUrl({ endpoint: 'vin-decode/v1', lang: 'fr', fin: FAKE_FIN }));
  assert.strictEqual(v1.pathname, '/api/public/vin-decode/v1');
  assert.strictEqual(v1.searchParams.get('lang'), 'fr');
});

test('Dry-Run: weder FIN noch Key im Text, aber Pfad, Header-Name und Platzhalter', () => {
  const cases = [
    { endpoint: 'vin-decode' },
    { endpoint: 'vin-decode/v1' },
    { endpoint: 'vin-decode/v1', lang: 'de' },
  ];
  for (const c of cases) {
    const text = buildDryRunLines({ ...c, fin: FAKE_FIN, keyPresent: true }).join('\n');
    assert.ok(!text.includes(FAKE_FIN));
    assert.ok(!text.includes(FAKE_FIN.slice(3)));
    assert.ok(!text.includes(FAKE_KEY));
    assert.ok(text.includes(`/api/public/${c.endpoint}?vin=<FIN>`));
    assert.ok(text.includes('x-api-key'));
    assert.ok(text.includes('ABC***'));
  }
  const v1 = buildDryRunLines({ endpoint: 'vin-decode/v1', lang: 'de', fin: FAKE_FIN, keyPresent: false }).join('\n');
  assert.ok(v1.includes('vin=<FIN>&lang=de'));
  assert.ok(v1.includes('VINDATA_API_KEY): nein'));
});

test('Dry-Run: Ausgabe enthält keine Werte aus dem übrigen Env', () => {
  const env = { VINDATA_API_KEY: FAKE_KEY, OTHER_SECRET: 'anderes-geheimnis' };
  const keyPresent = Boolean(readApiKey(env));
  const text = buildDryRunLines({ endpoint: 'vin-decode', fin: FAKE_FIN, keyPresent }).join('\n');
  assert.ok(text.includes('VINDATA_API_KEY): ja'));
  assert.ok(!text.includes(FAKE_KEY));
  assert.ok(!text.includes('anderes-geheimnis'));
});

test('describeField: fehlt, null und vorhanden werden unterschieden', () => {
  const obj = { a: null, b: 0, c: '', d: [1], e: { x: 1 } };
  assert.deepStrictEqual(describeField(obj, 'fehlt'), { state: 'fehlt', type: 'undefined', value: undefined });
  assert.deepStrictEqual(describeField(obj, 'a'), { state: 'null', type: 'null', value: null });
  assert.deepStrictEqual(describeField(obj, 'b'), { state: 'vorhanden', type: 'number', value: 0 });
  assert.deepStrictEqual(describeField(obj, 'c'), { state: 'vorhanden', type: 'string', value: '' });
  assert.strictEqual(describeField(obj, 'd').type, 'array');
  assert.strictEqual(describeField(obj, 'e').type, 'object');
});

test('describeField: kein Objekt oder geerbter Schlüssel gilt als fehlt', () => {
  assert.strictEqual(describeField(undefined, 'a').state, 'fehlt');
  assert.strictEqual(describeField(null, 'a').state, 'fehlt');
  assert.strictEqual(describeField([1], '0').state, 'fehlt');
  assert.strictEqual(describeField({}, 'toString').state, 'fehlt');
});

test('checkEngineCode: Leerzeichen und Länge über 6', () => {
  assert.deepStrictEqual(checkEngineCode('ABC123'), { checked: true, length: 6, hasWhitespace: false, longerThan6: false });
  assert.deepStrictEqual(checkEngineCode('ABC 12'), { checked: true, length: 6, hasWhitespace: true, longerThan6: false });
  assert.deepStrictEqual(checkEngineCode('ABC1234'), { checked: true, length: 7, hasWhitespace: false, longerThan6: true });
  assert.deepStrictEqual(checkEngineCode(''), { checked: true, length: 0, hasWhitespace: false, longerThan6: false });
});

test('checkEngineCode: Nicht-Text wird nicht geprüft', () => {
  for (const v of [null, undefined, 123, ['ABC']]) {
    assert.deepStrictEqual(checkEngineCode(v), { checked: false });
  }
});

test('compareOptions: Längen, P-Code-Anteil, leere Codes, identisch', () => {
  const options = [
    { code: 'p1a2', description: 'GEHEIMER TEXT A' },
    { code: 'P3B4', description: 'GEHEIMER TEXT B' },
    { code: 'xyz', description: 'GEHEIMER TEXT C' },
    { code: null, description: 'GEHEIMER TEXT D' },
    { code: '', description: 'GEHEIMER TEXT E' },
    { description: 'GEHEIMER TEXT F' },
    'kein Objekt',
  ];
  const all = [...options, { code: 'p5c6', description: 'x' }];
  const r = compareOptions(options, all);
  assert.deepStrictEqual(r.options, {
    isArray: true,
    length: 7,
    nonEmpty: 3,
    emptyCodes: 4,
    pCodes: 1,
    pCodesIgnoreCase: 2,
    pShare: 1 / 3,
  });
  assert.strictEqual(r.allOptions.length, 8);
  assert.strictEqual(r.allOptions.pCodes, 2);
  assert.strictEqual(r.identical, false);
  assert.ok(!JSON.stringify(r).includes('GEHEIMER'));
});

test('compareOptions: gleiche Inhalte sind identisch, auch bei anderer Schlüsselreihenfolge', () => {
  const a = [{ code: 'p1a2', description: 'x' }];
  const b = [{ description: 'x', code: 'p1a2' }];
  assert.strictEqual(compareOptions(a, b).identical, true);
  assert.strictEqual(compareOptions([], []).identical, true);
  assert.strictEqual(compareOptions([], []).options.pShare, null);
});

test('compareOptions: fehlend oder kein Array ist kein Absturz', () => {
  const r = compareOptions(undefined, null);
  assert.deepStrictEqual(r.options, { isArray: false, type: 'undefined' });
  assert.deepStrictEqual(r.allOptions, { isArray: false, type: 'null' });
  assert.strictEqual(r.identical, false);
});

test('listFields: Pfad, Typ, Array-Länge, Elementfelder zusammengefasst', () => {
  const body = {
    source: 'live',
    cached_at: null,
    vehicle: {
      year: 2020,
      options: [
        { code: 'p1a2', description: 'a' },
        { code: null, description: 'b' },
        { code: 'p3b4', description: 'c' },
      ],
      tags: [],
    },
    other: [[1], [1, 2, 3]],
  };
  assert.deepStrictEqual(listFields(body), [
    '$ | object',
    'source | string',
    'cached_at | null',
    'vehicle | object',
    'vehicle.year | number',
    'vehicle.options | array | Länge 3',
    'vehicle.options[] | object',
    'vehicle.options[].code | string',
    'vehicle.options[].description | string',
    'vehicle.options[].code | null',
    'vehicle.tags | array | Länge 0',
    'other | array | Länge 2',
    'other[] | array | Länge 1-3',
    'other[][] | number',
  ]);
});

test('listFields: Wurzel als Array oder Skalar, Schlüssel bleiben unmaskiert', () => {
  assert.deepStrictEqual(listFields([1]), ['$ | array | Länge 1', '$[] | number']);
  assert.deepStrictEqual(listFields('x'), ['$ | string']);
  assert.ok(listFields({ [FAKE_FIN]: 1 }).includes(`${FAKE_FIN} | number`));
  assert.ok(!maskText(listFields({ [FAKE_FIN]: 1 }).join('\n'), FAKE_FIN).includes(FAKE_FIN));
});

test('pickHeaders: nur Limit-, Verbrauchs- und retry-after-Header, keine Cookies', () => {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'X-RateLimit-Remaining': '99',
    'X-Usage-Count': '5',
    'x-credits-left': '17',
    'X-Quota': '1000',
    'Retry-After': '30',
    'Set-Cookie': 'sid=geheim',
    'X-Usage-Cookie': 'geheim',
    Server: 'x',
  });
  assert.deepStrictEqual(pickHeaders(headers), [
    ['retry-after', '30'],
    ['x-credits-left', '17'],
    ['x-quota', '1000'],
    ['x-ratelimit-remaining', '99'],
    ['x-usage-count', '5'],
  ]);
});

test('pickHeaders: einfaches Objekt, kein Objekt, nichts passend', () => {
  assert.deepStrictEqual(pickHeaders({ 'X-Remaining': 3, Date: 'heute' }), [['x-remaining', '3']]);
  assert.deepStrictEqual(pickHeaders(undefined), []);
  assert.deepStrictEqual(pickHeaders(new Headers({ Server: 'x' })), []);
});

test('nextProbeNumber: zählt hoch, auch über maskierte Dateien, ignoriert Fremdes', () => {
  assert.strictEqual(nextProbeNumber([]), 1);
  assert.strictEqual(nextProbeNumber(['vindata-probe-1.json', 'vindata-probe-1.masked.json']), 2);
  assert.strictEqual(nextProbeNumber(['vindata-probe-3.masked.json', 'vindata-probe-2.json']), 4);
  assert.strictEqual(nextProbeNumber(['probe-9.json', 'probe-info-4.json', 'vindata-probe-x.json', 'notes.txt']), 1);
  assert.strictEqual(nextProbeNumber(undefined), 1);
});
