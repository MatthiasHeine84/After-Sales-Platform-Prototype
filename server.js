// Kleiner lokaler Server mit Node-Bordmitteln (kein Framework).
// Lauscht nur auf 127.0.0.1: nur dieser Rechner kommt dran.
// Bewusst keine Request-Logs und keine FIN in Logs oder Fehlern.
const http = require('node:http');

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT) || 3000;

function handleRequest(req, res) {
  // Platzhalter, wird in späteren Schritten durch die Landingpage ersetzt
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Server läuft');
}

function createServer() {
  return http.createServer(handleRequest);
}

module.exports = { createServer, HOST, PORT };

// Nur starten, wenn die Datei direkt aufgerufen wird (nicht beim Import im Test)
if (require.main === module) {
  createServer().listen(PORT, HOST, () => {
    console.log(`Server läuft auf Port ${PORT}`);
  });
}
