// Tests für Normalisierung und Formatprüfung. Nur erfundene FINs, kein Netzwerk.
const test = require('node:test');
const assert = require('node:assert');
const { validateFin } = require('../src/fin');

const FAKE_FIN = 'ABCDEFGH123456789'; // erfunden, 17 Zeichen, kein I, O, Q

function codeOf(input) {
  const result = validateFin(input);
  return result.ok ? 'ok' : result.code;
}

test('Gültige FIN wird akzeptiert', () => {
  assert.deepStrictEqual(validateFin(FAKE_FIN), { ok: true, fin: FAKE_FIN });
});

test('Kleinbuchstaben und Leerzeichen werden normalisiert', () => {
  assert.deepStrictEqual(validateFin(' abcdefgh 12345 6789 '), { ok: true, fin: FAKE_FIN });
});

test('Leer und Nicht-Text ergeben "empty"', () => {
  for (const input of ['', '   ', undefined, null, 12345, {}, []]) {
    assert.strictEqual(codeOf(input), 'empty');
  }
});

test('Falsche Länge und Sonderzeichen ergeben "format"', () => {
  const inputs = [
    FAKE_FIN.slice(0, 16),
    FAKE_FIN + '1',
    'ABCDEFGH12345678-',
    'ÄBCDEFGH123456789',
    FAKE_FIN.slice(0, 16) + 'ß', // ß würde beim Großschreiben zu "SS"
  ];
  for (const input of inputs) {
    assert.strictEqual(codeOf(input), 'format');
  }
});

test('I, O und Q ergeben "chars"', () => {
  for (const letter of ['I', 'O', 'Q', 'i', 'o', 'q']) {
    assert.strictEqual(codeOf(letter + FAKE_FIN.slice(1)), 'chars');
  }
});

test('Fehler enthalten die freigegebene Meldung', () => {
  const result = validateFin('');
  assert.strictEqual(result.message, 'Bitte gib die 17 Zeichen deiner Fahrgestellnummer ein.');
});

test('I, O und Q: freigegebene Meldung im Wortlaut', () => {
  const result = validateFin('I' + FAKE_FIN.slice(1));
  assert.strictEqual(
    result.message,
    'Die Fahrgestellnummer darf keine Buchstaben I, O und Q enthalten. Bitte prüfe deine Eingabe.',
  );
});
