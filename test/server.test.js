// Server-Tests: Seite, Abgleich, Fehlerfälle, Schutz. Nur erfundene FINs, Temp-Dateien, nur 127.0.0.1.
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer, HOST } = require('../server');
const { MESSAGES } = require('../src/fin');
const { decodeFin: mockDecodeFin } = require('./helpers/mock-decoder');

const FAKE_FIN = 'ABCDEFGH123456789'; // erfunden
const OTHER_FIN = 'ZZZZZZZZ987654321'; // erfunden
const STORE = JSON.stringify({
  [FAKE_FIN]: {
    savedAt: '2026-01-01',
    source: 'mock',
    data: { decode: [{ label: 'Make', value: 'Testmarke' }, { label: 'Model', value: '<b>fett</b>' }] },
  },
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fin-server-test-'));
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

function tempFile(content) {
  const file = path.join(dir, `cache-${Math.random().toString(36).slice(2)}.json`);
  if (content !== undefined) fs.writeFileSync(file, content);
  return file;
}

// Startet den Server mit eigener Speicherdatei, führt fn(port) aus und beendet den Server wieder
// Standard-Decoder im Test ist der Mock; options.decode überschreibt ihn
async function withServer(cacheFile, fn, options = {}) {
  const server = createServer({ cacheFile, decode: mockDecodeFin, ...options });
  await new Promise((resolve) => server.listen(0, HOST, resolve));
  try {
    return await fn(server.address().port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

// Eigener Request, damit Pfad und Host-Header unverändert ankommen (fetch normalisiert beides)
function request(port, { method = 'GET', reqPath = '/', host } = {}) {
  return new Promise((resolve, reject) => {
    const headers = { Host: host ?? `127.0.0.1:${port}` };
    const req = http.request({ host: HOST, port, method, path: reqPath, headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

const query = (value) => `/?fin=${encodeURIComponent(value)}`;

test('Server antwortet auf 127.0.0.1 mit 200', async () => {
  const server = createServer({ cacheFile: tempFile() });
  await new Promise((resolve) => server.listen(0, HOST, resolve));
  try {
    assert.strictEqual(server.address().address, '127.0.0.1');
    const res = await fetch(`http://127.0.0.1:${server.address().port}/`);
    assert.strictEqual(res.status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('Seite ohne Eingabe: Texte und Formular, keine Meldung', async () => {
  await withServer(tempFile(STORE), async (port) => {
    const res = await request(port);
    assert.strictEqual(res.status, 200);
    for (const text of [
      'MEIN FAHRZEUG',
      'Das steckt in deinem Auto',
      'Gib deine Fahrgestellnummer ein und sieh die technischen Daten deines Fahrzeugs.',
      'Fahrzeug anzeigen',
    ]) {
      assert.ok(res.body.includes(text), text);
    }
    assert.ok(!res.body.includes('role="alert"'));
    // Hinweis steht sichtbar im Text und ist mit dem Feld verbunden; das Feld hat keinen Platzhalter
    assert.ok(res.body.includes('<p class="hint" id="fin-hint">17 Zeichen, siehe Zulassungsbescheinigung Feld E</p>'));
    assert.ok(res.body.includes('aria-describedby="fin-hint"'));
    assert.ok(!res.body.includes('placeholder'));
    assert.ok(res.body.includes('lang="de"'));
    assert.ok(res.body.includes('name="viewport"'));
    assert.ok(res.body.includes('<label for="fin">'));
    assert.ok(res.body.includes('maxlength="40"'));
    assert.ok(!res.body.includes('maxlength="17"'));
    assert.ok(res.body.includes('autocomplete="off"'));
  });
});

test('Sicherheits-Header sind gesetzt', async () => {
  await withServer(tempFile(STORE), async (port) => {
    const { headers } = await request(port);
    assert.strictEqual(headers['cache-control'], 'no-store');
    assert.strictEqual(headers['referrer-policy'], 'no-referrer');
    assert.strictEqual(headers['x-content-type-options'], 'nosniff');
    assert.strictEqual(
      headers['content-security-policy'],
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",
    );
  });
});

test('Seite lädt nichts nach: ein style, kein link, kein script, keine Adressen', async () => {
  await withServer(tempFile(STORE), async (port) => {
    for (const reqPath of ['/', query(FAKE_FIN), query('ABC')]) {
      const { body } = await request(port, { reqPath });
      assert.strictEqual(body.match(/<style>/g).length, 1, reqPath);
      assert.ok(!/<link\b/i.test(body), reqPath);
      assert.ok(!/<script\b/i.test(body), reqPath);
      assert.ok(!/https?:\/\//i.test(body), reqPath);
      assert.ok(body.includes('<meta name="color-scheme" content="dark">'), reqPath);
      assert.ok(body.includes('color-scheme: dark'), reqPath);
    }
  });
});

test('Symbolkachel AUTO nur bei Treffer, für Screenreader versteckt', async () => {
  await withServer(tempFile(STORE), async (port) => {
    const hit = await request(port, { reqPath: query(FAKE_FIN) });
    assert.ok(hit.body.includes('<div class="tile" aria-hidden="true">AUTO</div>'));

    for (const reqPath of ['/', query(OTHER_FIN), query('ABC')]) {
      const { body } = await request(port, { reqPath });
      assert.ok(!body.includes('class="tile"'), reqPath);
      assert.ok(!body.includes('class="card"'), reqPath);
    }
    const unknown = await request(port, { reqPath: query(OTHER_FIN) });
    assert.ok(!unknown.body.includes('role="alert"'));
  });
});

test('Eingabefehler: Status 200 mit der freigegebenen Meldung', async () => {
  await withServer(tempFile(STORE), async (port) => {
    const cases = [
      ['', MESSAGES.empty],
      ['   ', MESSAGES.empty],
      ['ABC', MESSAGES.format],
      ['ABCDEFGH12345678!', MESSAGES.format],
      ['ABCDEFGHI23456789'.replace('I', 'O'), MESSAGES.chars],
    ];
    for (const [input, message] of cases) {
      const res = await request(port, { reqPath: query(input) });
      assert.strictEqual(res.status, 200, input);
      assert.ok(res.body.includes(message), input);
    }
  });
});

test('Treffer: Felder sichtbar, ohne Herkunftshinweise; Schreibweise egal', async () => {
  await withServer(tempFile(STORE), async (port) => {
    const upper = await request(port, { reqPath: query(FAKE_FIN) });
    const messy = await request(port, { reqPath: query(' abcdefgh 12345 6789 ') });
    assert.strictEqual(upper.status, 200);
    assert.ok(upper.body.includes('Testmarke'));
    assert.ok(messy.body.includes('Testmarke'));
    assert.ok(!upper.body.includes('role="alert"'));
    for (const word of ['source', 'savedAt', 'mock', 'cache', 'Cache', 'vincario']) {
      assert.ok(!upper.body.includes(word), word);
    }
  });
});

test('Unbekannte FIN ohne Mock-Daten: kein alert, keine Karte, Datei unverändert', async () => {
  const file = tempFile(STORE);
  const before = fs.readFileSync(file);
  await withServer(file, async (port) => {
    const res = await request(port, { reqPath: query(OTHER_FIN) });
    assert.strictEqual(res.status, 200);
    assert.ok(!res.body.includes('role="alert"'));
    assert.ok(!res.body.includes('<dl>'));
  });
  assert.ok(before.equals(fs.readFileSync(file)));
});

test('Defekte Speicherdatei: Status 500, neutrale Meldung, Datei unverändert', async () => {
  const file = tempFile('{ kaputt');
  const before = fs.readFileSync(file);
  await withServer(file, async (port) => {
    const res = await request(port, { reqPath: query(FAKE_FIN) });
    assert.strictEqual(res.status, 500);
    assert.ok(res.body.includes('Daten momentan nicht verfügbar.'));
  });
  assert.ok(before.equals(fs.readFileSync(file)));
});

test('HTML in Eingabe und Daten wird escaped', async () => {
  await withServer(tempFile(STORE), async (port) => {
    const evil = await request(port, { reqPath: query('<script>alert(1)</script>') });
    assert.ok(!evil.body.includes('<script>'));
    assert.ok(evil.body.includes('&lt;script&gt;'));

    const data = await request(port, { reqPath: query(FAKE_FIN) });
    assert.ok(!data.body.includes('<b>fett</b>'));
    assert.ok(data.body.includes('&lt;b&gt;fett&lt;/b&gt;'));
  });
});

test('Zurückgespiegelte Eingabe wird auf 64 Zeichen gekürzt', async () => {
  await withServer(tempFile(STORE), async (port) => {
    const res = await request(port, { reqPath: query('A'.repeat(200)) });
    assert.ok(res.body.includes(`value="${'A'.repeat(64)}"`));
    assert.ok(!res.body.includes('A'.repeat(65)));
  });
});

test('Fremder Host-Header: 403, passende Hosts: 200', async () => {
  await withServer(tempFile(STORE), async (port) => {
    for (const host of ['evil.example', 'evil.example:80', `evil.example:${port}`, '127.0.0.1', 'localhost']) {
      assert.strictEqual((await request(port, { host })).status, 403, host);
    }
    assert.strictEqual((await request(port, { host: `localhost:${port}` })).status, 200);
    assert.strictEqual((await request(port, { host: `127.0.0.1:${port}` })).status, 200);
  });
});

test('Unbekannte Pfade und Dateien: 404', async () => {
  await withServer(tempFile(STORE), async (port) => {
    for (const reqPath of ['/nope', '/.env', '/data/vin-cache.json', '/../.env', '/%2e%2e/.env', '/server.js']) {
      assert.strictEqual((await request(port, { reqPath })).status, 404, reqPath);
    }
  });
});

test('Andere Methoden: 405', async () => {
  await withServer(tempFile(STORE), async (port) => {
    for (const method of ['POST', 'PUT', 'DELETE']) {
      const res = await request(port, { method });
      assert.strictEqual(res.status, 405, method);
      assert.strictEqual(res.headers.allow, 'GET');
    }
  });
});

// ---- Spec 02: Decoder, Speichern, Hinweis ohne Daten ----

const { decodeFin } = require('./helpers/mock-decoder');

const MOCK_FIN = 'TESTMKA0000000001'; // erfunden, vom Mock-Decoder bekannt
const MESSAGE_UNAVAILABLE = '<p class="notice" role="alert">Daten momentan nicht verfügbar.</p>';
const MESSAGE_NODATA = '<p class="notice" role="status">Zu dieser Fahrgestellnummer haben wir keine Daten.</p>';

// Decoder, der mitzählt, wie oft er gefragt wurde
function countingDecoder(inner = decodeFin) {
  const decoder = (fin) => {
    decoder.calls += 1;
    return inner(fin);
  };
  decoder.calls = 0;
  return decoder;
}

// Meldung im Fehler-Absatz (nicht das Eingabefeld, das die Eingabe zurückspiegelt)
const alertOf = (body) => (body.match(/<p class="notice" role="alert">.*?<\/p>/s) || [])[0];

test('Unbekannte Mock-FIN: Karte, danach im Speicher, andere Einträge bleiben', async () => {
  const file = tempFile(STORE);
  await withServer(file, async (port) => {
    const res = await request(port, { reqPath: query(MOCK_FIN) });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.includes('<h2>Testmarke Testmodell E, Testmodell F</h2>'));
    assert.ok(res.body.includes('<p class="subline">2022</p>'));
    assert.ok(res.body.includes('<div class="tile" aria-hidden="true">AUTO</div>'));
    assert.ok(!res.body.includes('role="alert"'));
    assert.ok(!res.body.includes('role="status"'));
    // Weder Herkunft noch versteckte Felder noch das Logo erscheinen
    for (const word of ['source', 'savedAt', 'mock', 'Mock', 'cache', 'vincario', 'example.invalid', 'Testkraftstoff', 'Testgetriebe', '<dl>']) {
      assert.ok(!res.body.includes(word), word);
    }
  });

  const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepStrictEqual(Object.keys(stored).sort(), [FAKE_FIN, MOCK_FIN].sort());
  assert.deepStrictEqual(stored[FAKE_FIN], JSON.parse(STORE)[FAKE_FIN]);
  assert.strictEqual(stored[MOCK_FIN].source, 'mock');
  assert.deepStrictEqual(stored[MOCK_FIN].data, decodeFin(MOCK_FIN).data);
});

test('Zweiter Aufruf derselben FIN kommt aus dem Speicher, ohne Decoder-Aufruf', async () => {
  const file = tempFile();
  const decode = countingDecoder();
  await withServer(file, async (port) => {
    const first = await request(port, { reqPath: query(MOCK_FIN) });
    assert.strictEqual(decode.calls, 1);
    assert.ok(first.body.includes('<h2>Testmarke Testmodell E, Testmodell F</h2>'));
    const afterFirst = fs.readFileSync(file);

    const second = await request(port, { reqPath: query(` ${MOCK_FIN.toLowerCase()} `) });
    assert.strictEqual(decode.calls, 1);
    assert.strictEqual(second.status, 200);
    assert.ok(second.body.includes('<h2>Testmarke Testmodell E, Testmodell F</h2>'));
    assert.ok(afterFirst.equals(fs.readFileSync(file)));
  }, { decode });
});

test('Decoder wird nur bei gültiger, im Speicher unbekannter FIN gefragt', async () => {
  const decode = countingDecoder();
  await withServer(tempFile(STORE), async (port) => {
    for (const reqPath of ['/', query(''), query('ABC'), query(FAKE_FIN), query('<script>')]) {
      await request(port, { reqPath });
    }
    assert.strictEqual(decode.calls, 0);
    await request(port, { reqPath: query(OTHER_FIN) });
    assert.strictEqual(decode.calls, 1);
  }, { decode });
});

test('FIN ohne Daten: Hinweis mit role="status", Status 200, nichts gespeichert', async () => {
  // Fall 1: Datei existiert nicht und wird nicht angelegt. Fall 2: Datei mit Inhalt bleibt byte-gleich.
  const missing = tempFile();
  const existing = tempFile(STORE);
  const before = fs.readFileSync(existing);

  for (const file of [missing, existing]) {
    await withServer(file, async (port) => {
      const res = await request(port, { reqPath: query(OTHER_FIN) });
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.includes(MESSAGE_NODATA));
      assert.ok(!res.body.includes('role="alert"'));
      assert.ok(!res.body.includes('class="card"'));
      assert.ok(!res.body.includes('class="tile"'));
      for (const word of ['source', 'mock', 'Mock', 'cache', 'vincario']) assert.ok(!res.body.includes(word), word);
    });
  }
  assert.ok(!fs.existsSync(missing));
  assert.ok(before.equals(fs.readFileSync(existing)));
});

test('Beschädigte Speicherdatei: 500, Decoder wird nicht gefragt, Datei byte-gleich', async () => {
  const file = tempFile('{ kaputt');
  const before = fs.readFileSync(file);
  const decode = countingDecoder();
  await withServer(file, async (port) => {
    const res = await request(port, { reqPath: query(MOCK_FIN) });
    assert.strictEqual(res.status, 500);
    assert.strictEqual(alertOf(res.body), MESSAGE_UNAVAILABLE);
  }, { decode });
  assert.strictEqual(decode.calls, 0);
  assert.ok(before.equals(fs.readFileSync(file)));
});

test('Decoder wirft: 500 mit neutraler Meldung, nichts geschrieben, nichts protokolliert, keine FIN im Fehler', async (t) => {
  const file = tempFile();
  const decode = () => {
    throw new Error(`Geheimer Fehler für ${MOCK_FIN} mit Schlüssel apikey=GEHEIM`);
  };
  const logged = ['log', 'info', 'warn', 'error', 'debug'].map((name) => t.mock.method(console, name, () => {}));

  await withServer(file, async (port) => {
    const res = await request(port, { reqPath: query(MOCK_FIN) });
    assert.strictEqual(res.status, 500);
    assert.strictEqual(alertOf(res.body), MESSAGE_UNAVAILABLE);
    assert.ok(!res.body.includes('Geheimer Fehler'));
    assert.ok(!res.body.includes('GEHEIM'));
    assert.ok(!res.body.includes('class="card"'));
  }, { decode });

  for (const spy of logged) assert.strictEqual(spy.mock.callCount(), 0);
  assert.ok(!fs.existsSync(file));
});

test('Decoder liefert unerwartete Form oder error: 500, nichts geschrieben', async () => {
  const good = decodeFin(MOCK_FIN).data;
  const shapes = [
    undefined, null, 'text', 42, [], {},
    { status: 'error' },
    { status: 'irgendwas', source: 'mock', data: good },
    { status: 'found', source: 'mock' },
    { status: 'found', source: 'mock', data: null },
    { status: 'found', source: 'mock', data: {} },
    { status: 'found', source: 'mock', data: [] },
    { status: 'found', source: 'mock', data: { decode: 'text' } },
    { status: 'found', source: 'mock', data: { decode: {} } },
    // ohne brauchbare Quelle
    { status: 'found', data: good },
    { status: 'found', source: '', data: good },
    { status: 'found', source: 5, data: good },
    { status: 'found', source: null, data: good },
  ];
  for (const shape of shapes) {
    const file = tempFile();
    await withServer(file, async (port) => {
      const res = await request(port, { reqPath: query(MOCK_FIN) });
      assert.strictEqual(res.status, 500, String(shape));
      assert.strictEqual(alertOf(res.body), MESSAGE_UNAVAILABLE, String(shape));
      assert.ok(!res.body.includes('class="card"'), String(shape));
    }, { decode: () => shape });
    assert.ok(!fs.existsSync(file), String(shape));
  }
});

test('Asynchroner Decoder mit Fehlform: 500, nichts geschrieben (auch beim abgelehnten Promise, ohne Log)', async (t) => {
  const logged = ['log', 'info', 'warn', 'error', 'debug'].map((name) => t.mock.method(console, name, () => {}));
  const good = decodeFin(MOCK_FIN);
  const decoders = [
    async () => ({ status: 'found', data: good.data }), // ohne Quelle
    async () => ({ status: 'error' }),
    async () => {
      throw new Error(`Geheimer Fehler für ${MOCK_FIN} mit Schlüssel apikey=GEHEIM`);
    },
    () => Promise.reject(new Error('GEHEIM abgelehnt')),
  ];
  for (const decode of decoders) {
    const file = tempFile();
    await withServer(file, async (port) => {
      const res = await request(port, { reqPath: query(MOCK_FIN) });
      assert.strictEqual(res.status, 500);
      assert.strictEqual(alertOf(res.body), MESSAGE_UNAVAILABLE);
      assert.ok(!res.body.includes('GEHEIM'));
      assert.ok(!res.body.includes('class="card"'));
    }, { decode });
    assert.ok(!fs.existsSync(file));
  }
  for (const spy of logged) assert.strictEqual(spy.mock.callCount(), 0);
});

test('Asynchroner Decoder: Treffer wird mit der Quelle aus dem Ergebnis gespeichert und angezeigt', async () => {
  const file = tempFile();
  const data = { decode: [{ label: 'Make', value: 'Testmarke' }, { label: 'Model', value: 'Asyncmodell' }, { label: 'Model Year', value: 2024 }] };
  const decode = async () => ({ status: 'found', source: 'vincario', data });
  await withServer(file, async (port) => {
    const res = await request(port, { reqPath: query(MOCK_FIN) });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.includes('<h2>Testmarke Asyncmodell</h2>'));
    assert.ok(res.body.includes('<p class="subline">2024</p>'));
    // die Quelle bleibt unsichtbar
    for (const word of ['vincario', 'source', 'savedAt']) assert.ok(!res.body.includes(word), word);
  }, { decode });
  const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.strictEqual(stored[MOCK_FIN].source, 'vincario');
  assert.deepStrictEqual(stored[MOCK_FIN].data, data);
});

test('Asynchroner Decoder mit nodata: Hinweis, Status 200, nichts gespeichert', async () => {
  const file = tempFile();
  await withServer(file, async (port) => {
    const res = await request(port, { reqPath: query(MOCK_FIN) });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.includes(MESSAGE_NODATA));
    assert.ok(!res.body.includes('class="card"'));
  }, { decode: async () => ({ status: 'nodata' }) });
  assert.ok(!fs.existsSync(file));
});

test('Schreibfehler beim Speichern: 500 mit neutraler Meldung, Datei unverändert, keine Karte', async (t) => {
  const file = tempFile(STORE);
  const before = fs.readFileSync(file);
  t.mock.method(fs, 'writeFileSync', () => {
    throw new Error('Simulierter Schreibfehler');
  });

  await withServer(file, async (port) => {
    const res = await request(port, { reqPath: query(MOCK_FIN) });
    assert.strictEqual(res.status, 500);
    assert.strictEqual(alertOf(res.body), MESSAGE_UNAVAILABLE);
    assert.ok(!res.body.includes('class="card"'));
  });
  t.mock.restoreAll();

  assert.ok(before.equals(fs.readFileSync(file)));
  assert.deepStrictEqual(fs.readdirSync(path.dirname(file)).filter((name) => name.endsWith('.tmp')), []);
});

test('FIN taucht während der Abfrage im Speicher auf: vorhandener Eintrag gilt, nichts überschrieben', async () => {
  const file = tempFile();
  const existing = { savedAt: '2026-01-01', source: 'mock', data: { decode: [{ label: 'Make', value: 'SchonDa' }] } };
  const decode = (fin) => {
    fs.writeFileSync(file, JSON.stringify({ [fin]: existing }));
    return decodeFin(fin);
  };
  await withServer(file, async (port) => {
    const res = await request(port, { reqPath: query(MOCK_FIN) });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.includes('<h2>SchonDa</h2>'));
    assert.ok(!res.body.includes('Testmodell E'));
  }, { decode });
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { [MOCK_FIN]: existing });
});

test('Daten mit HTML werden auch bei neuem Eintrag escaped', async () => {
  const decode = () => ({ status: 'found', source: 'mock', data: { decode: [{ label: 'Make', value: '<script>alert(1)</script>' }] } });
  await withServer(tempFile(), async (port) => {
    const res = await request(port, { reqPath: query(MOCK_FIN) });
    assert.ok(!res.body.includes('<script>'));
    assert.ok(res.body.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  }, { decode });
});

// ---- Spec 03b: echter Vincario-Decoder mit Fake-fetch (kein Netzwerk) ----

const { createVincarioDecoder } = require('../src/decoder/vincario');

const FAKE_API_KEY = 'fake-api-key-for-tests'; // erfunden
const FAKE_SECRET_KEY = 'fake-secret-key-for-tests'; // erfunden
const VINCARIO_FIN = 'TESTMKB0000000001'; // erfunden

// Fake-fetch: zählt Aufrufe und antwortet mit dem übergebenen Body (Vincario meldet Fehler mit HTTP 200)
function fakeFetch(body) {
  const fn = async () => {
    fn.calls += 1;
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  };
  fn.calls = 0;
  return fn;
}

const vincarioDecoder = (fetchFn) => createVincarioDecoder({ fetchFn, apiKey: FAKE_API_KEY, secretKey: FAKE_SECRET_KEY });

test('Vincario-Treffer: Karte, gespeichert mit source "vincario", ein fetch', async () => {
  const fetchFn = fakeFetch({
    price: 0,
    balance: { 'API VIN Decode': 5 },
    decode: [{ label: 'Make', value: 'Testmarke' }, { label: 'Model', value: 'Testmodell V' }, { label: 'Model Year', value: 2021 }],
  });
  const file = tempFile();
  await withServer(file, async (port) => {
    const res = await request(port, { reqPath: query(VINCARIO_FIN) });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.includes('<h2>Testmarke Testmodell V</h2>'));
    assert.ok(res.body.includes('<p class="subline">2021</p>'));
    assert.ok(!res.body.includes('vincario'));
    assert.ok(!res.body.includes('balance'));
    assert.ok(!res.body.includes(FAKE_API_KEY) && !res.body.includes(FAKE_SECRET_KEY));
  }, { decode: vincarioDecoder(fetchFn) });

  assert.strictEqual(fetchFn.calls, 1);
  const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepStrictEqual(Object.keys(stored), [VINCARIO_FIN]);
  assert.strictEqual(stored[VINCARIO_FIN].source, 'vincario');
  // price und balance werden nicht gespeichert
  assert.deepStrictEqual(Object.keys(stored[VINCARIO_FIN].data), ['decode']);
});

test('Vincario "Not recognized": Hinweis ohne Daten, nichts gespeichert', async () => {
  const fetchFn = fakeFetch({ error: 'x', message: 'Not recognized' });
  const file = tempFile();
  await withServer(file, async (port) => {
    const res = await request(port, { reqPath: query(VINCARIO_FIN) });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.includes(MESSAGE_NODATA));
  }, { decode: vincarioDecoder(fetchFn) });
  assert.strictEqual(fetchFn.calls, 1);
  assert.ok(!fs.existsSync(file));
});

test('Vincario andere Fehlerform: 500 mit neutraler Meldung, nichts gespeichert', async () => {
  const fetchFn = fakeFetch({ error: 'x', message: 'Etwas anderes' });
  const file = tempFile();
  await withServer(file, async (port) => {
    const res = await request(port, { reqPath: query(VINCARIO_FIN) });
    assert.strictEqual(res.status, 500);
    assert.strictEqual(alertOf(res.body), MESSAGE_UNAVAILABLE);
    assert.ok(!res.body.includes('Etwas anderes'));
  }, { decode: vincarioDecoder(fetchFn) });
  assert.ok(!fs.existsSync(file));
});

test('Standard ohne Decoder: ruft nie fetch auf, 500, nichts gespeichert', async () => {
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error('Netzwerkzugriff im Test');
  };
  try {
    const file = tempFile();
    // Direkt createServer ohne decode, nicht über withServer (das den Mock einsetzt)
    const server = createServer({ cacheFile: file });
    await new Promise((resolve) => server.listen(0, HOST, resolve));
    try {
      const res = await request(server.address().port, { reqPath: query(VINCARIO_FIN) });
      assert.strictEqual(res.status, 500);
      assert.strictEqual(alertOf(res.body), MESSAGE_UNAVAILABLE);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
    assert.strictEqual(calls, 0);
    assert.ok(!fs.existsSync(file));
  } finally {
    globalThis.fetch = realFetch;
  }
});
