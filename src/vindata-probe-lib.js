// Hilfsfunktionen für die VINdata-Probe (Spec 04a). Das Skript selbst liegt in scratch/ (nicht im Repo).
// Reine Funktionen: kein Netzwerk, keine Dateien, keine Logs.

const { isDeepStrictEqual } = require('node:util');

const HOST = 'https://vindata.io';
const BASE_PATH = '/api/public';
const HEADER_NAME = 'x-api-key';
const ENV_KEY_NAME = 'VINDATA_API_KEY';
const ENDPOINTS = ['vin-decode', 'vin-decode/v1'];
const LANGS = ['de', 'fr', 'es', 'it', 'nl', 'pl', 'pt', 'sv', 'da', 'no', 'fi', 'cs'];

// Fehlertexte nennen nie den Wert eines Arguments (es könnte die FIN oder ein Key sein)
function argError(message) {
  return { error: message };
}

// Ergebnis: { fin, echt, endpoint, lang } oder { error }. Die FIN wird hier nicht geprüft (validateFin im Skript).
function parseArgs(argv) {
  const result = { fin: undefined, echt: false, endpoint: 'vin-decode', lang: undefined };
  const args = Array.isArray(argv) ? argv : [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--echt') {
      result.echt = true;
    } else if (arg === '--endpoint' || arg === '--lang') {
      const value = args[i + 1];
      if (value === undefined || value.startsWith('-')) {
        return argError(`${arg} braucht einen Wert.`);
      }
      i += 1;
      if (arg === '--endpoint') {
        if (!ENDPOINTS.includes(value)) {
          return argError(`--endpoint: erlaubt sind ${ENDPOINTS.join(' und ')}.`);
        }
        result.endpoint = value;
      } else {
        if (!LANGS.includes(value)) {
          return argError(`--lang: erlaubt sind ${LANGS.join(', ')}.`);
        }
        result.lang = value;
      }
    } else if (arg.startsWith('-')) {
      return argError('Unbekanntes Argument. Erlaubt sind --echt, --endpoint und --lang.');
    } else if (result.fin === undefined) {
      result.fin = arg;
    } else {
      return argError('Es darf nur eine FIN angegeben werden.');
    }
  }
  if (result.lang !== undefined && result.endpoint !== 'vin-decode/v1') {
    return argError('--lang gibt es nur mit --endpoint vin-decode/v1.');
  }
  return result;
}

// Liest ausschließlich VINDATA_API_KEY. Das übrige Env wird weder durchsucht noch weitergegeben.
function readApiKey(env) {
  if (env === null || typeof env !== 'object') return undefined;
  const value = env[ENV_KEY_NAME];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

// FIN für Ausgaben: nur die ersten 3 Zeichen
function maskFin(fin) {
  return `${String(fin).slice(0, 3)}***`;
}

// Ersetzt die FIN (egal ob Groß- oder Kleinschreibung) und den Key in beliebigem Text.
// Arbeitet auf dem Rohtext und deckt damit Werte, verschachtelte Strings und Schlüssel ab.
function maskText(text, fin, apiKey) {
  let out = String(text);
  if (typeof apiKey === 'string' && apiKey !== '') {
    out = out.split(apiKey).join('[KEY]');
  }
  if (typeof fin === 'string' && fin !== '') {
    const escaped = fin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(escaped, 'gi'), maskFin(fin));
  }
  return out;
}

// Beschreibung des Aufrufs ohne FIN-Wert (für die Anzeige)
function buildRequest({ endpoint, lang }) {
  const query = lang ? 'vin=<FIN>&lang=' + lang : 'vin=<FIN>';
  return {
    host: HOST,
    path: `${BASE_PATH}/${endpoint}`,
    query,
    headerName: HEADER_NAME,
  };
}

// Echte URL mit FIN. Nur für fetch bestimmt, niemals ausgeben oder loggen.
function buildUrl({ endpoint, lang, fin }) {
  const url = new URL(`${HOST}${BASE_PATH}/${endpoint}`);
  url.searchParams.set('vin', fin);
  if (lang) url.searchParams.set('lang', lang);
  return url.toString();
}

// Zeilen für den Trockenlauf: Platzhalter statt FIN-Wert, nie ein Key-Wert
function buildDryRunLines({ endpoint, lang, fin, keyPresent }) {
  const req = buildRequest({ endpoint, lang });
  return [
    'Trockenlauf: kein Netzaufruf.',
    `Aufruf: GET ${req.host}${req.path}?${req.query}`,
    `Header: ${req.headerName} (Wert wird nie angezeigt)`,
    `FIN: ${maskFin(fin)}`,
    `Key vorhanden (${ENV_KEY_NAME}): ${keyPresent ? 'ja' : 'nein'}`,
    'Für den echten Aufruf --echt ergänzen (kann Guthaben kosten).',
  ];
}

function valueType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

// Unterscheidet fehlt (Schlüssel nicht da) von null (Schlüssel da, Wert leer)
function describeField(obj, key) {
  const isObject = obj !== null && typeof obj === 'object' && !Array.isArray(obj);
  if (!isObject || !Object.prototype.hasOwnProperty.call(obj, key)) {
    return { state: 'fehlt', type: 'undefined', value: undefined };
  }
  const value = obj[key];
  return { state: value === null ? 'null' : 'vorhanden', type: valueType(value), value };
}

// Prüft einen Motorcode auf Leerraum und Länge über 6 Zeichen. Nicht-Text wird nicht geprüft.
function checkEngineCode(value) {
  if (typeof value !== 'string') return { checked: false };
  return { checked: true, length: value.length, hasWhitespace: /\s/.test(value), longerThan6: value.length > 6 };
}

const P_CODE = /^p[0-9a-z]{3}$/;
const P_CODE_IGNORE_CASE = /^p[0-9a-z]{3}$/i;

// Kennzahlen einer Optionsliste. Liest nur das Feld code, nie Beschreibungstexte.
// Anteil = Treffer von /^p[0-9a-z]{3}$/ unter den Einträgen mit nicht-leerem Code.
function summarizeOptions(list) {
  if (!Array.isArray(list)) return { isArray: false, type: valueType(list) };
  let nonEmpty = 0;
  let emptyCodes = 0;
  let pCodes = 0;
  let pCodesIgnoreCase = 0;
  for (const entry of list) {
    const code = entry !== null && typeof entry === 'object' ? entry.code : undefined;
    if (typeof code !== 'string' || code === '') {
      emptyCodes += 1;
      continue;
    }
    nonEmpty += 1;
    if (P_CODE.test(code)) pCodes += 1;
    if (P_CODE_IGNORE_CASE.test(code)) pCodesIgnoreCase += 1;
  }
  return {
    isArray: true,
    length: list.length,
    nonEmpty,
    emptyCodes,
    pCodes,
    pCodesIgnoreCase,
    pShare: nonEmpty > 0 ? pCodes / nonEmpty : null,
  };
}

function compareOptions(options, allOptions) {
  return {
    options: summarizeOptions(options),
    allOptions: summarizeOptions(allOptions),
    identical: isDeepStrictEqual(options, allOptions),
  };
}

// Feldliste als Zeilen "Pfad | Typ | Länge". Arrays: Elementfelder unter "pfad[]" zusammengefasst,
// gleiche Pfade und Typen erscheinen nur einmal (Länge bei Arrays als Spanne). Schlüssel bleiben unmaskiert.
function listFields(value) {
  const seen = new Map();
  function add(path, type, length) {
    const key = `${path}|${type}`;
    const entry = seen.get(key);
    if (!entry) {
      seen.set(key, { path, type, min: length, max: length });
    } else if (length !== undefined) {
      entry.min = Math.min(entry.min, length);
      entry.max = Math.max(entry.max, length);
    }
  }
  function walk(node, path) {
    const type = valueType(node);
    if (type === 'array') {
      add(path, type, node.length);
      for (const item of node) walk(item, `${path}[]`);
    } else if (type === 'object') {
      add(path, type);
      for (const [k, v] of Object.entries(node)) walk(v, path === '$' ? k : `${path}.${k}`);
    } else {
      add(path, type);
    }
  }
  walk(value, '$');
  return Array.from(seen.values()).map(({ path, type, min, max }) => {
    if (min === undefined) return `${path} | ${type}`;
    return `${path} | ${type} | Länge ${min === max ? min : `${min}-${max}`}`;
  });
}

// Nur Header, deren Name auf Limits oder Verbrauch hindeutet (und retry-after). Cookies nie.
function pickHeaders(headers) {
  if (headers === null || typeof headers !== 'object') return [];
  const entries = typeof headers.entries === 'function' ? Array.from(headers.entries()) : Object.entries(headers);
  return entries
    .map(([name, value]) => [String(name).toLowerCase(), String(value)])
    .filter(([name]) => !name.includes('cookie') && /ratelimit|usage|remaining|credit|quota|retry-after/.test(name));
}

// Nächste freie Nummer N für vindata-probe-N.json. Zählt auch vorhandene .masked.json-Dateien mit.
function nextProbeNumber(fileNames) {
  const pattern = /^vindata-probe-(\d+)(?:\.masked)?\.json$/;
  const numbers = (Array.isArray(fileNames) ? fileNames : [])
    .map((name) => pattern.exec(String(name)))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  return numbers.length ? Math.max(...numbers) + 1 : 1;
}

module.exports = {
  valueType,
  describeField,
  checkEngineCode,
  compareOptions,
  listFields,
  pickHeaders,
  nextProbeNumber,
  ENDPOINTS,
  LANGS,
  HEADER_NAME,
  ENV_KEY_NAME,
  parseArgs,
  readApiKey,
  maskFin,
  maskText,
  buildRequest,
  buildUrl,
  buildDryRunLines,
};
