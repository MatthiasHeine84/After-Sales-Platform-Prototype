// Kleiner lokaler Server mit Node-Bordmitteln (kein Framework).
// Lauscht nur auf 127.0.0.1: nur dieser Rechner kommt dran.
// Bewusst keine Request-Logs und keine FIN in Logs oder Fehlern.
const http = require('node:http');
const path = require('node:path');
const { validateFin, MESSAGES } = require('./src/fin');
const { lookupFin, saveFin } = require('./src/cache');
const { decodeFin } = require('./src/decoder/mock');
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

// Nur ein Datensatz in der erwarteten Form darf gespeichert und angezeigt werden
function isUsableResult(result) {
  return (
    typeof result === 'object' && result !== null && result.status === 'found' &&
    typeof result.data === 'object' && result.data !== null && Array.isArray(result.data.decode)
  );
}

// Unbekannte FIN: Decoder fragen, speichern, anzeigen. Gibt { status, body } zurück.
// Ein Fehler des Decoders (auch ein Wurf) wird bewusst nicht protokolliert: Meldungen könnten die FIN enthalten.
function decodeAndStore(fin, input, cacheFile, decode) {
  const failed = { status: 500, body: renderPage({ input, error: MESSAGES.unavailable }) };

  let result;
  try {
    result = decode(fin);
  } catch {
    return failed;
  }

  if (typeof result === 'object' && result !== null && result.status === 'nodata') {
    return { status: 200, body: renderPage({ input, notice: MESSAGES.nodata }) };
  }
  if (!isUsableResult(result)) return failed;

  const saved = saveFin(fin, result.data, 'mock', cacheFile);
  // 'found': die FIN war inzwischen schon gespeichert, dann gilt der vorhandene Eintrag
  if (saved.status === 'saved') return { status: 200, body: renderPage({ input, data: result.data }) };
  if (saved.status === 'found') return { status: 200, body: renderPage({ input, data: saved.data }) };
  return failed;
}

function createServer({ cacheFile = DEFAULT_CACHE_FILE, decode = decodeFin } = {}) {
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

    const decoded = decodeAndStore(checked.fin, input, cacheFile, decode);
    return send(res, decoded.status, decoded.body);
  });
}

module.exports = { createServer, HOST, PORT };

// Nur starten, wenn die Datei direkt aufgerufen wird (nicht beim Import im Test)
if (require.main === module) {
  createServer().listen(PORT, HOST, () => {
    console.log(`Server läuft auf Port ${PORT}`);
  });
}
