// Kleiner lokaler Server mit Node-Bordmitteln (kein Framework).
// Lauscht nur auf 127.0.0.1: nur dieser Rechner kommt dran.
// Bewusst keine Request-Logs und keine FIN in Logs oder Fehlern.
const http = require('node:http');
const path = require('node:path');
const { validateFin } = require('./src/fin');
const { lookupFin } = require('./src/cache');
const { renderPage } = require('./src/page');

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT) || 3000;
const DEFAULT_CACHE_FILE = path.join(__dirname, 'data', 'vin-cache.json');

const HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  // Nichts laden außer dem eingebauten Stil; das Formular darf nur an die eigene Seite senden
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",
};

function send(res, status, body, extraHeaders = {}) {
  res.writeHead(status, { ...HEADERS, ...extraHeaders });
  res.end(body);
}

// Nur Aufrufe über die eigene Adresse zulassen (Schutz vor fremden Seiten, die auf localhost zielen)
function hostAllowed(req) {
  const port = req.socket.localPort;
  return req.headers.host === `127.0.0.1:${port}` || req.headers.host === `localhost:${port}`;
}

function createServer({ cacheFile = DEFAULT_CACHE_FILE } = {}) {
  return http.createServer((req, res) => {
    if (!hostAllowed(req)) return send(res, 403, 'Nicht erlaubt');

    const url = new URL(req.url, 'http://localhost');
    // Es gibt nur eine Seite, keine statischen Dateien
    if (url.pathname !== '/') return send(res, 404, 'Nicht gefunden');
    if (req.method !== 'GET') return send(res, 405, 'Nicht erlaubt', { Allow: 'GET' });

    const input = url.searchParams.get('fin');
    if (input === null) return send(res, 200, renderPage());

    const checked = validateFin(input);
    if (!checked.ok) return send(res, 200, renderPage({ input, error: checked.message }));

    const found = lookupFin(checked.fin, cacheFile);
    if (found.status === 'error') return send(res, 500, renderPage({ input, error: found.message }));
    if (found.status === 'found') return send(res, 200, renderPage({ input, data: found.data }));
    return send(res, 200, renderPage({ input }));
  });
}

module.exports = { createServer, HOST, PORT };

// Nur starten, wenn die Datei direkt aufgerufen wird (nicht beim Import im Test)
if (require.main === module) {
  createServer().listen(PORT, HOST, () => {
    console.log(`Server läuft auf Port ${PORT}`);
  });
}
