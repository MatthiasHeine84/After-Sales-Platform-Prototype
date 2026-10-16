// Hilfsfunktionen für die VINdata-Probe (Spec 04a). Das Skript selbst liegt in scratch/ (nicht im Repo).
// Reine Funktionen: kein Netzwerk, keine Dateien, keine Logs.

const nodePath = require('node:path');
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
  const result = { fin: undefined, echt: false, endpoint: 'vin-decode', lang: undefined, auswerten: undefined };
  const args = Array.isArray(argv) ? argv : [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--echt') {
      result.echt = true;
    } else if (arg === '--auswerten') {
      const value = args[i + 1];
      if (value === undefined || value.startsWith('-')) {
        return argError('--auswerten braucht einen Pfad unter data/.');
      }
      i += 1;
      result.auswerten = value;
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
      return argError('Unbekanntes Argument. Erlaubt sind --echt, --endpoint, --lang und --auswerten.');
    } else if (result.fin === undefined) {
      result.fin = arg;
    } else {
      return argError('Es darf nur eine FIN angegeben werden.');
    }
  }
  if (result.auswerten !== undefined && result.echt) {
    return argError('--auswerten und --echt schließen sich aus.');
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

function toSnakeCase(key) {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function toCamelCase(key) {
  return key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

// Unterscheidet fehlt (Schlüssel nicht da) von null (Schlüssel da, Wert leer).
// Probiert den Namen wie angegeben, dann snake_case und camelCase (die API liefert camelCase,
// die OpenAPI-Datei nennt snake_case). foundAs ist der Name, unter dem das Feld gefunden wurde.
function describeField(obj, key) {
  const isObject = obj !== null && typeof obj === 'object' && !Array.isArray(obj);
  const foundAs = isObject
    ? [key, toSnakeCase(key), toCamelCase(key)].find((name) => Object.prototype.hasOwnProperty.call(obj, name))
    : undefined;
  if (foundAs === undefined) {
    return { state: 'fehlt', type: 'undefined', value: undefined, foundAs: null };
  }
  const value = obj[foundAs];
  return { state: value === null ? 'null' : 'vorhanden', type: valueType(value), value, foundAs };
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

// Vergleicht options mit allOptions (oder all_options) im Fahrzeugobjekt.
// foundAs nennt die gefundene Schreibweise (null, wenn die Liste fehlt).
function compareOptions(vehicle) {
  const options = describeField(vehicle, 'options');
  const allOptions = describeField(vehicle, 'allOptions');
  return {
    options: summarizeOptions(options.value),
    allOptions: summarizeOptions(allOptions.value),
    identical: isDeepStrictEqual(options.value, allOptions.value),
    foundAs: { options: options.foundAs, allOptions: allOptions.foundAs },
  };
}

// Beginnt die Motorbeschreibung mit dem Motorcode? exact: Zeichen für Zeichen,
// ignoringWhitespace: nach Entfernen von Leerraum in beiden Texten. Beides unterscheidet Groß-/Kleinschreibung.
function checkEngineDescription(engineCode, engineDescription) {
  if (typeof engineCode !== 'string' || typeof engineDescription !== 'string' || engineCode === '') {
    return { checked: false };
  }
  const squash = (text) => text.replace(/\s+/g, '');
  return {
    checked: true,
    exact: engineDescription.startsWith(engineCode),
    ignoringWhitespace: squash(engineDescription).startsWith(squash(engineCode)),
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

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Liegt file (absoluter Pfad) unterhalb von dir? Das Verzeichnis selbst zählt nicht.
function isInsideDir(dir, file) {
  const rel = nodePath.relative(dir, file);
  return rel !== '' && rel.split(nodePath.sep)[0] !== '..' && !nodePath.isAbsolute(rel);
}

// Lexikalische Prüfung für --auswerten: nur .json-Dateien unter dataDir (relative Pfade ab Arbeitsordner).
// Symbolische Links prüft das Skript zusätzlich über den echten Pfad.
function resolveDataFile(input, dataDir) {
  if (typeof input !== 'string' || input === '') return { ok: false, message: 'Pfad fehlt.' };
  const resolved = nodePath.resolve(input);
  if (!isInsideDir(nodePath.resolve(dataDir), resolved)) {
    return { ok: false, message: 'Der Pfad muss unter data/ liegen.' };
  }
  if (nodePath.extname(resolved).toLowerCase() !== '.json') {
    return { ok: false, message: 'Es sind nur .json-Dateien erlaubt.' };
  }
  return { ok: true, resolved };
}

// Zählt die Felder im Fahrzeugobjekt ohne die Optionslisten
function countVehicleFields(vehicle) {
  const skip = new Set(['options', 'allOptions', 'all_options']);
  let total = 0;
  let nulls = 0;
  if (isPlainObject(vehicle)) {
    for (const [key, value] of Object.entries(vehicle)) {
      if (skip.has(key)) continue;
      total += 1;
      if (value === null) nulls += 1;
    }
  }
  return { total, nulls, nonNull: total - nulls };
}

// Namen in camelCase (so liefert die API); describeField findet auch snake_case
const VEHICLE_FIELDS = [
  'year',
  'productionDate',
  'series',
  'model',
  'variant',
  'typeCode',
  'engineCode',
  'engineDescription',
  'systemPowerKw',
  'transmissionType',
  'transmissionCode',
  'bodyType',
  'fuelType',
  'driveType',
  'steeringSide',
];

function short(value, max) {
  const text = typeof value === 'string' ? value : String(JSON.stringify(value));
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

// Eine Zeile zu einem Feld: Zustand, Typ und bei einfachen Werten der Wert
function fieldLine(name, obj) {
  const d = describeField(obj, name);
  if (d.state === 'fehlt') return `${name}: fehlt`;
  // Weicht die gefundene Schreibweise vom angefragten Namen ab, wird sie genannt
  const spelling = d.foundAs === name ? '' : ` [gefunden als ${d.foundAs}]`;
  if (d.state === 'null') return `${name}: null${spelling}`;
  const simple = ['string', 'number', 'boolean'].includes(d.type);
  return `${name}: ${simple ? `${short(d.value, 100)} ` : ''}(${d.type})${spelling}`;
}

function optionsLine(label, s, foundAs) {
  if (!s.isArray) return `${label}: ${foundAs ? 'kein Array' : 'fehlt'} (${s.type})`;
  const share = s.pShare === null ? 'n/a' : `${(s.pShare * 100).toFixed(1)} %`;
  const spelling = foundAs === label ? '' : ` [gefunden als ${foundAs}]`;
  return (
    `${label}${spelling}: Länge ${s.length}, Codes nicht leer ${s.nonEmpty}, leerer Code ${s.emptyCodes}, ` +
    `P-Codes ${s.pCodes} (Anteil ${share}), nur mit i ${s.pCodesIgnoreCase}`
  );
}

// Auswertung einer geparsten Antwort ohne Fehler. out() gibt eine Zeile aus (das Skript maskiert dort).
function printSummary(body, endpoint, out) {
  out(fieldLine('source', body));
  out(fieldLine('cachedAt', body));

  const vehicleKey = isPlainObject(body.normalized)
    ? 'normalized'
    : isPlainObject(body.vehicle)
      ? 'vehicle'
      : endpoint === 'vin-decode/v1'
        ? 'normalized'
        : 'vehicle';
  const vehicle = body[vehicleKey];
  const hasVehicle = isPlainObject(vehicle);
  out(`Fahrzeugobjekt: ${vehicleKey}${hasVehicle ? '' : ' (fehlt oder kein Objekt)'}`);

  if (hasVehicle) {
    for (const name of VEHICLE_FIELDS) out(fieldLine(name, vehicle));

    const counts = countVehicleFields(vehicle);
    out(`Felder im Fahrzeugobjekt (ohne Optionslisten): ${counts.total}, davon null ${counts.nulls}, davon nicht null ${counts.nonNull}`);

    const engine = checkEngineCode(describeField(vehicle, 'engineCode').value);
    out(
      engine.checked
        ? `engineCode geprüft: Länge ${engine.length}, Leerraum ${engine.hasWhitespace ? 'ja' : 'nein'}, ` +
            `mehr als 6 Zeichen ${engine.longerThan6 ? 'ja' : 'nein'}`
        : 'engineCode geprüft: nicht möglich (fehlt oder kein Text)',
    );

    const desc = checkEngineDescription(
      describeField(vehicle, 'engineCode').value,
      describeField(vehicle, 'engineDescription').value,
    );
    out(
      desc.checked
        ? `engineDescription beginnt mit engineCode: exakt ${desc.exact ? 'ja' : 'nein'}, ohne Leerraum ${desc.ignoringWhitespace ? 'ja' : 'nein'}`
        : 'engineDescription beginnt mit engineCode: nicht möglich (fehlt oder kein Text)',
    );

    const cmp = compareOptions(vehicle);
    out(optionsLine('options', cmp.options, cmp.foundAs.options));
    out(optionsLine('allOptions', cmp.allOptions, cmp.foundAs.allOptions));
    out(`options und allOptions inhaltlich identisch: ${cmp.identical ? 'ja' : 'nein'}`);
  }

  out('Feldliste (Pfad | Typ | Länge):');
  for (const line of listFields(body)) out(`  ${line}`);
}

// Gemeinsame Auswertung für --echt und --auswerten, ab dem Rohtext. status und contentType sind
// bei --auswerten unbekannt (undefined). out() maskiert im Skript jede Zeile.
function evaluateResponse(text, { status, contentType, endpoint, out }) {
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    const statusPart = status === undefined ? '' : `Status ${status}, `;
    out(`kein JSON (${statusPart}Content-Type ${contentType || 'unbekannt'}, ${text.length} Zeichen). Keine Auswertung.`);
    return;
  }
  if (!isPlainObject(body)) {
    out(`Antwort hat unerwartete Form (${valueType(body)}). Keine Auswertung.`);
    return;
  }
  const httpFailed = status !== undefined && !(status >= 200 && status < 300);
  if (httpFailed || body.error !== undefined) {
    out(`error: ${body.error === undefined ? '(fehlt)' : short(body.error, 300)}`);
    out(`details: ${body.details === undefined ? '(fehlt)' : short(body.details, 300)}`);
    return;
  }
  printSummary(body, endpoint, out);
}

module.exports = {
  isInsideDir,
  resolveDataFile,
  countVehicleFields,
  printSummary,
  evaluateResponse,
  valueType,
  describeField,
  checkEngineCode,
  checkEngineDescription,
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
