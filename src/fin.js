// Normalisierung und Formatprüfung der Fahrgestellnummer (FIN).
// Reine Funktionen: kein Netzwerk, keine Dateien, keine Logs.

const MESSAGES = {
  empty: 'Bitte gib die 17 Zeichen deiner Fahrgestellnummer ein.',
  format: 'Die Nummer muss genau 17 Zeichen haben und darf nur Buchstaben und Ziffern enthalten.',
  chars: 'In dieser Nummer kommen die Buchstaben I, O und Q nicht vor. Bitte prüfe deine Eingabe.',
  unavailable: 'Daten momentan nicht verfügbar.',
};

function fail(code) {
  return { ok: false, code, message: MESSAGES[code] };
}

// Ergebnis: { ok: true, fin } oder { ok: false, code: 'empty' | 'format' | 'chars', message }
function validateFin(input) {
  // Alles, was kein Text ist (Zahl, Objekt, null, undefined), gilt als leer
  if (typeof input !== 'string') return fail('empty');

  const stripped = input.replace(/\s+/g, '');
  if (stripped === '') return fail('empty');

  // Erst auf ASCII prüfen, dann Großbuchstaben: sonst wird "ß" zu "SS" und rutscht durch
  if (!/^[A-Za-z0-9]{17}$/.test(stripped)) return fail('format');

  const fin = stripped.toUpperCase();
  if (/[IOQ]/.test(fin)) return fail('chars');

  return { ok: true, fin };
}

module.exports = { validateFin, MESSAGES };
