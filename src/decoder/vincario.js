// Vincario-Decoder (Spec 03b): fragt die echte API ab. Der Aufruf (fetch) und die Keys kommen von außen,
// damit Tests mit einem Fake-fetch laufen. Bewusst keine Logs: URL, Keys, FIN und Antworttext
// dürfen nirgends ausgegeben werden. Nach außen gehen nur { status } und bei Treffern { source, data }.
// URL und Control Sum wie in der bewährten Probe (scratch/probe.js, Spec 03a).

const crypto = require('node:crypto');
const { validateFin } = require('../fin');

const HOST = 'https://api.vincario.com/3.2';

// Ergebnis bei jedem Problem: immer ein neues Objekt, nie mit Details
const failed = () => ({ status: 'error' });

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Wertet den Antworttext aus. Fehler kommen von Vincario auch mit HTTP 200 als { error, message }.
function readBody(text) {
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return failed();
  }
  if (!isPlainObject(body)) return failed();

  if (body.error) {
    return body.message === 'Not recognized' ? { status: 'nodata' } : failed();
  }
  if (!Array.isArray(body.decode)) return failed();

  const hasModel = body.decode.some((item) => isPlainObject(item) && item.label === 'Model');
  if (!hasModel) return { status: 'nodata' };

  // price und balance werden bewusst verworfen
  return { status: 'found', source: 'vincario', data: { decode: body.decode } };
}

function createVincarioDecoder({ fetchFn = globalThis.fetch, apiKey, secretKey, maxCalls = 3, timeoutMs = 15000 } = {}) {
  let attempts = 0; // Versuche seit dem Start, im Arbeitsspeicher
  const running = new Map(); // FIN -> laufender Aufruf, damit gleichzeitige Abrufe sich einen teilen

  const hasKeys = typeof apiKey === 'string' && apiKey !== '' && typeof secretKey === 'string' && secretKey !== '';

  // Genau ein API-Aufruf. Jeder Fehler (auch ein Wurf von fetch, dessen Text die URL enthalten kann) wird verworfen.
  async function callApi(fin) {
    try {
      const controlSum = crypto.createHash('sha1').update(`${fin}|decode|${apiKey}|${secretKey}`).digest('hex').slice(0, 10);
      const url = `${HOST}/${apiKey}/${controlSum}/decode/${fin}.json`;
      const response = await fetchFn(url, { redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) return failed();
      return readBody(await response.text());
    } catch {
      return failed();
    }
  }

  // Ergebnis: { status: 'found', source: 'vincario', data } | { status: 'nodata' } | { status: 'error' }
  async function decodeFin(input) {
    if (!hasKeys) return failed();

    // Die FIN steht im URL-Pfad: nur eine geprüfte FIN (17 Zeichen, Buchstaben und Ziffern) darf hinein
    const checked = validateFin(input);
    if (!checked.ok) return failed();
    const fin = checked.fin;

    if (running.has(fin)) return running.get(fin);

    // Der Versuch zählt vor dem Aufruf, auch bei Timeout oder Fehler (Vincario kann trotzdem abrechnen)
    if (attempts >= maxCalls) return failed();
    attempts += 1;

    const call = callApi(fin).finally(() => running.delete(fin));
    running.set(fin, call);
    return call;
  }

  return decodeFin;
}

module.exports = { createVincarioDecoder };
