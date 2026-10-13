// Smoke-Test: Server startet auf 127.0.0.1 und antwortet mit Status 200.
const test = require('node:test');
const assert = require('node:assert');
const { createServer, HOST } = require('./server');

test('Server antwortet auf 127.0.0.1 mit 200', async () => {
  const server = createServer();
  // Port 0: das Betriebssystem wählt einen freien Port
  await new Promise((resolve) => server.listen(0, HOST, resolve));
  const { address, port } = server.address();
  try {
    assert.strictEqual(address, '127.0.0.1');
    const res = await fetch(`http://127.0.0.1:${port}/`);
    assert.strictEqual(res.status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
