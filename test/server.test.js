// Server-Tests: Seite, Abgleich, Fehlerfälle, Schutz. Nur erfundene FINs, Temp-Dateien, nur 127.0.0.1.
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer, HOST } = require('../server');
const { MESSAGES } = require('../src/fin');

const FAKE_FIN = 'ABCDEFGH123456789'; // erfunden
const OTHER_FIN = 'ZZZZZZZZ987654321'; // erfunden
const STORE = JSON.stringify({
  [FAKE_FIN]: { savedAt: '2026-01-01', source: 'mock', data: { make: 'Testmarke', note: '<b>fett</b>' } },
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fin-server-test-'));
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

function tempFile(content) {
  const file = path.join(dir, `cache-${Math.random().toString(36).slice(2)}.json`);
  if (content !== undefined) fs.writeFileSync(file, content);
  return file;
}

// Startet den Server mit eigener Speicherdatei, führt fn(port) aus und beendet den Server wieder
async function withServer(cacheFile, fn) {
  const server = createServer({ cacheFile });
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
      'Gib deine Fahrgestellnummer ein und sieh, welches Auto du fährst.',
      'Fahrzeug anzeigen',
      '17 Zeichen, steht im Fahrzeugschein',
    ]) {
      assert.ok(res.body.includes(text), text);
    }
    assert.ok(!res.body.includes('role="alert"'));
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

test('Unbekannte FIN: keine Meldung, keine Daten, Datei unverändert', async () => {
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
