// Tests für den Vincario-Decoder. Nur Fake-fetch und Fake-Keys: kein Netzwerk, keine Dateien, keine echten FINs.
const test = require('node:test');
const assert = require('node:assert');
const { createVincarioDecoder } = require('../src/decoder/vincario');

const FIN = 'TESTVNA0000000001'; // erfunden
const API_KEY = 'testapikey123'; // erfunden
const SECRET_KEY = 'testsecret456'; // erfunden
// Control Sum unabhängig berechnet: erste 10 Zeichen von sha1("TESTVNA0000000001|decode|testapikey123|testsecret456")
const EXPECTED_URL = `https://api.vincario.com/3.2/${API_KEY}/a01b7dfc42/decode/${FIN}.json`;

const HIT = {
  price: 0,
  price_currency: 'EUR',
  balance: { 'API VIN Decode': 17 },
  decode: [
    { label: 'Make', value: 'Testmarke', id: 1 },
    { label: 'Model', value: 'Testmodell', id: 2 },
    { label: 'Model Year', value: 2022 },
  ],
};

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

// Fake-fetch: merkt sich jeden Aufruf; handler liefert die Antwort (oder wirft)
function fakeFetch(handler = () => json(HIT)) {
  const fn = async (url, options) => {
    fn.calls.push({ url, options });
    return handler(url, options);
  };
  fn.calls = [];
  return fn;
}

const decoderWith = (fetchFn, options = {}) =>
  createVincarioDecoder({ fetchFn, apiKey: API_KEY, secretKey: SECRET_KEY, ...options });

test('Treffer: found mit source vincario und nur decode, price und balance entfallen', async () => {
  const decodeFin = decoderWith(fakeFetch());
  const result = await decodeFin(FIN);
  assert.deepStrictEqual(Object.keys(result).sort(), ['data', 'source', 'status']);
  assert.strictEqual(result.status, 'found');
  assert.strictEqual(result.source, 'vincario');
  assert.deepStrictEqual(Object.keys(result.data), ['decode']);
  assert.deepStrictEqual(result.data.decode, HIT.decode);
  const text = JSON.stringify(result);
  for (const word of ['price', 'balance', 'EUR', API_KEY, SECRET_KEY]) assert.ok(!text.includes(word), word);
});

test('URL, Control Sum und Aufrufoptionen: exakt wie in der Probe', async () => {
  const fetchFn = fakeFetch();
  await decoderWith(fetchFn)(FIN);
  assert.strictEqual(fetchFn.calls.length, 1);
  assert.strictEqual(fetchFn.calls[0].url, EXPECTED_URL);
  assert.strictEqual(fetchFn.calls[0].options.redirect, 'error');
  assert.ok(fetchFn.calls[0].options.signal instanceof AbortSignal);
});

test('Eingabe wird wie im Server normalisiert: Kleinbuchstaben und Leerzeichen ergeben dieselbe URL', async () => {
  const fetchFn = fakeFetch();
  await decoderWith(fetchFn)(` ${FIN.toLowerCase()} `);
  assert.strictEqual(fetchFn.calls[0].url, EXPECTED_URL);
});

test('"Not recognized" ist nodata, auch bei HTTP 200', async () => {
  const fetchFn = fakeFetch(() => json({ error: true, message: 'Not recognized' }));
  assert.deepStrictEqual(await decoderWith(fetchFn)(FIN), { status: 'nodata' });
});

test('Andere Fehlerform mit HTTP 200 ist error (Status allein reicht nicht)', async () => {
  const shapes = [
    { error: true, message: 'Something else' },
    { error: 'Not recognized' },
    { error: true },
    { error: true, message: 'not recognized' },
    { error: true, message: 'Invalid control sum' },
  ];
  for (const body of shapes) {
    const result = await decoderWith(fakeFetch(() => json(body)))(FIN);
    assert.deepStrictEqual(result, { status: 'error' }, JSON.stringify(body));
  }
});

test('HTTP-Fehler ist error, auch mit gültigem Body und mit "Not recognized"', async () => {
  for (const [body, status] of [[HIT, 500], [HIT, 404], [{ error: true, message: 'Not recognized' }, 400]]) {
    const result = await decoderWith(fakeFetch(() => json(body, status)))(FIN);
    assert.deepStrictEqual(result, { status: 'error' }, String(status));
  }
});

test('Kaputtes JSON oder falsche Form des Bodys: error', async () => {
  for (const text of ['{ kaputt', '', '[]', 'null', '"text"', '42']) {
    const result = await decoderWith(fakeFetch(() => new Response(text, { status: 200 })))(FIN);
    assert.deepStrictEqual(result, { status: 'error' }, text);
  }
});

test('Timeout: error, der Versuch zählt; das übergebene signal bricht den Aufruf wirklich ab', async () => {
  // AbortSignal.timeout hält den Prozess nicht am Leben: ein eigener Timer hält den Event-Loop bis zum Abbruch offen
  const fetchFn = fakeFetch(
    (url, { signal }) =>
      new Promise((resolve, reject) => {
        const keepAlive = setTimeout(() => {}, 5000);
        signal.addEventListener('abort', () => {
          clearTimeout(keepAlive);
          reject(signal.reason);
        });
      }),
  );
  const result = await decoderWith(fetchFn, { timeoutMs: 20 })(FIN);
  assert.deepStrictEqual(result, { status: 'error' });
  assert.strictEqual(fetchFn.calls.length, 1);
});

test('Wurf von fetch: error ohne Text, auch wenn die Meldung die URL enthält', async (t) => {
  const logged = ['log', 'info', 'warn', 'error', 'debug'].map((name) => t.mock.method(console, name, () => {}));
  const fetchFn = fakeFetch((url) => {
    throw new Error(`Verbindung zu ${url} fehlgeschlagen`);
  });
  const result = await decoderWith(fetchFn)(FIN);
  assert.deepStrictEqual(result, { status: 'error' });
  const text = JSON.stringify(result);
  for (const secret of [API_KEY, SECRET_KEY, FIN, 'Verbindung']) assert.ok(!text.includes(secret), secret);
  for (const spy of logged) assert.strictEqual(spy.mock.callCount(), 0);
});

test('Antwort ohne Model: nodata', async () => {
  const bodies = [
    { decode: [{ label: 'Make', value: 'Testmarke' }, { label: 'Model Year', value: 2022 }] },
    { decode: [] },
    { decode: [null, 'Model', 5, { value: 'ohne Label' }] },
  ];
  for (const body of bodies) {
    const result = await decoderWith(fakeFetch(() => json(body)))(FIN);
    assert.deepStrictEqual(result, { status: 'nodata' }, JSON.stringify(body));
  }
});

test('decode fehlt oder ist kein Array: error', async () => {
  for (const body of [{}, { decode: 'text' }, { decode: {} }, { decode: null }, { price: 0 }]) {
    const result = await decoderWith(fakeFetch(() => json(body)))(FIN);
    assert.deepStrictEqual(result, { status: 'error' }, JSON.stringify(body));
  }
});

test('Zähler: drei Versuche, der vierte ruft nicht auf und liefert error', async () => {
  const fetchFn = fakeFetch();
  const decodeFin = decoderWith(fetchFn);
  for (let i = 0; i < 3; i += 1) assert.strictEqual((await decodeFin(FIN)).status, 'found');
  assert.strictEqual(fetchFn.calls.length, 3);
  assert.deepStrictEqual(await decodeFin(FIN), { status: 'error' });
  assert.deepStrictEqual(await decodeFin('TESTVNA0000000002'), { status: 'error' });
  assert.strictEqual(fetchFn.calls.length, 3);
});

test('Zähler: Fehlversuche (HTTP-Fehler, nodata, Wurf) zählen mit', async () => {
  const answers = [
    () => json(HIT, 500),
    () => json({ error: true, message: 'Not recognized' }),
    () => {
      throw new Error('weg');
    },
  ];
  const fetchFn = fakeFetch(() => answers.shift()());
  const decodeFin = decoderWith(fetchFn);
  assert.strictEqual((await decodeFin(FIN)).status, 'error');
  assert.strictEqual((await decodeFin(FIN)).status, 'nodata');
  assert.strictEqual((await decodeFin(FIN)).status, 'error');
  assert.deepStrictEqual(await decodeFin(FIN), { status: 'error' });
  assert.strictEqual(fetchFn.calls.length, 3);
});

test('Zähler: maxCalls ist einstellbar', async () => {
  const fetchFn = fakeFetch();
  const decodeFin = decoderWith(fetchFn, { maxCalls: 1 });
  assert.strictEqual((await decodeFin(FIN)).status, 'found');
  assert.deepStrictEqual(await decodeFin(FIN), { status: 'error' });
  assert.strictEqual(fetchFn.calls.length, 1);
});

test('Deduplizierung: zwei gleichzeitige Aufrufe derselben FIN, ein fetch, ein Versuch', async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const fetchFn = fakeFetch(async () => {
    await gate;
    return json(HIT);
  });
  const decodeFin = decoderWith(fetchFn);

  const first = decodeFin(FIN);
  const second = decodeFin(` ${FIN.toLowerCase()} `);
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.strictEqual(fetchFn.calls.length, 1);
  assert.strictEqual(a.status, 'found');
  assert.deepStrictEqual(a, b);

  // Nur ein Versuch verbraucht: zwei weitere gehen noch, der vierte nicht
  assert.strictEqual((await decodeFin(FIN)).status, 'found'); // Eintrag wurde entfernt: neuer Aufruf
  assert.strictEqual((await decodeFin(FIN)).status, 'found');
  assert.deepStrictEqual(await decodeFin(FIN), { status: 'error' });
  assert.strictEqual(fetchFn.calls.length, 3);
});

test('Deduplizierung: verschiedene FINs gleichzeitig sind getrennte Aufrufe; Eintrag wird auch nach Fehler entfernt', async () => {
  const fetchFn = fakeFetch(() => json(HIT, 500));
  const decodeFin = decoderWith(fetchFn);
  await Promise.all([decodeFin(FIN), decodeFin('TESTVNA0000000002')]);
  assert.strictEqual(fetchFn.calls.length, 2);
  await decodeFin(FIN);
  assert.strictEqual(fetchFn.calls.length, 3);
});

test('Fehlende Keys: error ohne Aufruf, kein Zähler verbraucht', async () => {
  const cases = [{}, { apiKey: API_KEY }, { secretKey: SECRET_KEY }, { apiKey: '', secretKey: SECRET_KEY }, { apiKey: 5, secretKey: SECRET_KEY }];
  for (const keys of cases) {
    const fetchFn = fakeFetch();
    const result = await createVincarioDecoder({ fetchFn, ...keys })(FIN);
    assert.deepStrictEqual(result, { status: 'error' }, JSON.stringify(Object.keys(keys)));
    assert.strictEqual(fetchFn.calls.length, 0);
  }
  assert.deepStrictEqual(await createVincarioDecoder({ fetchFn: fakeFetch() })(FIN), { status: 'error' });
});

test('Ungültige FIN: error ohne Aufruf und ohne Zähler (die FIN steht im URL-Pfad)', async () => {
  const fetchFn = fakeFetch();
  const decodeFin = decoderWith(fetchFn);
  const bad = ['', 'ABC', undefined, null, 42, {}, `${FIN.slice(0, 16)}/`, `${FIN.slice(0, 14)}../`, 'TESTVNA0000000OO1', `${FIN}?x=1`];
  for (const input of bad) assert.deepStrictEqual(await decodeFin(input), { status: 'error' }, String(input));
  assert.strictEqual(fetchFn.calls.length, 0);
  // der Zähler ist unberührt: drei gültige Versuche gehen noch
  for (let i = 0; i < 3; i += 1) assert.strictEqual((await decodeFin(FIN)).status, 'found');
  assert.strictEqual(fetchFn.calls.length, 3);
});

test('Ausgaben enthalten weder Key noch FIN: nichts auf der Konsole, nichts in Fehler- und nodata-Ergebnissen', async (t) => {
  const logged = ['log', 'info', 'warn', 'error', 'debug'].map((name) => t.mock.method(console, name, () => {}));
  const answers = [
    () => json({ error: true, message: `Key ${API_KEY} Secret ${SECRET_KEY} FIN ${FIN}` }),
    () => json({ error: true, message: 'Not recognized' }),
    () => {
      throw new Error(`Aufruf ${EXPECTED_URL} fehlgeschlagen`);
    },
    () => new Response(`kaputt ${API_KEY} ${FIN}`, { status: 200 }),
    () => json(HIT),
  ];
  const decodeFin = decoderWith(fakeFetch(() => answers.shift()()), { maxCalls: 10 });
  const results = [];
  for (let i = 0; i < 5; i += 1) results.push(await decodeFin(FIN));

  assert.deepStrictEqual(results.slice(0, 4), [{ status: 'error' }, { status: 'nodata' }, { status: 'error' }, { status: 'error' }]);
  for (const result of results) {
    const text = JSON.stringify(result);
    assert.ok(!text.includes(API_KEY), text);
    assert.ok(!text.includes(SECRET_KEY), text);
  }
  for (const result of results.slice(0, 4)) assert.ok(!JSON.stringify(result).includes(FIN));
  for (const spy of logged) assert.strictEqual(spy.mock.callCount(), 0);
});
