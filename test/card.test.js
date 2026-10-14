// Tests für Fahrzeugkarte und Meldungen in renderPage. Reine Funktion: kein Server, keine Dateien.
const test = require('node:test');
const assert = require('node:assert');
const { renderPage } = require('../src/page');
const { decodeFin } = require('../src/decoder/mock');
const { MESSAGES } = require('../src/fin');

const decode = (...items) => ({ decode: items.map(([label, value]) => ({ label, value })) });
const card = (data) => renderPage({ data });
const FULL = decodeFin('TESTMKA0000000001').data;
const SPARSE = decodeFin('TESTMKA0000000003').data;

// Alles zwischen <dl> und </dl>: die Liste mit Beschriftung und Wert
const listOf = (html) => (html.match(/<dl>(.*?)<\/dl>/s) || [])[1];

test('Vollständiger Datensatz: Titel, Zeile und Liste mit deutschen Beschriftungen', () => {
  const html = card(FULL);
  assert.ok(html.includes('<h2>Testmarke Testmodell E</h2>'));
  assert.ok(html.includes('<p class="subline">2022 · Elektro 150 kW</p>'));
  assert.ok(html.includes('<div class="tile" aria-hidden="true">AUTO</div>'));
  assert.strictEqual(
    listOf(html),
    '<dt>Getriebe</dt><dd>1-Gang-Automatik</dd>' +
      '<dt>Motorleistung</dt><dd>150 kW</dd>' +
      '<dt>Motorcode</dt><dd>EM150</dd>' +
      '<dt>Motormodell</dt><dd>Elektromotor 150</dd>' +
      '<dt>Farbe</dt><dd>Mondgrau</dd>' +
      '<dt>Ausstattung</dt><dd>Testausstattung Plus</dd>',
  );
});

test('Fehlende Felder: Zeile und Teile entfallen ohne Platzhalter, Kachel bleibt', () => {
  const html = card(SPARSE);
  assert.ok(html.includes('<h2>Testmarke Testmodell X</h2>'));
  assert.ok(html.includes('<p class="subline">2015</p>'));
  assert.strictEqual(listOf(html), '<dt>Getriebe</dt><dd>Automatik</dd><dt>Motorleistung</dt><dd>90 kW</dd>');
  assert.ok(html.includes('class="tile"'));
  for (const word of ['Farbe', 'Motorcode', 'Ausstattung', 'undefined', 'null', '–', 'n/a']) {
    assert.ok(!html.includes(`>${word}<`), word);
  }
});

test('Titel: nur Make, nur Model, beides fehlt', () => {
  assert.ok(card(decode(['Make', 'Testmarke'])).includes('<h2>Testmarke</h2>'));
  assert.ok(card(decode(['Model', 'Testmodell'])).includes('<h2>Testmodell</h2>'));
  const none = card(decode(['Color', 'Rot']));
  assert.ok(none.includes('<h2>Dein Fahrzeug</h2>'));
  assert.ok(none.includes('class="tile"'));
});

test('Zeile: nur Baujahr, nur Motor, beides', () => {
  assert.ok(card(decode(['Model Year', 2020])).includes('<p class="subline">2020</p>'));
  assert.ok(card(decode(['Engine (full)', 'Diesel 90 kW'])).includes('<p class="subline">Diesel 90 kW</p>'));
  assert.ok(card(decode(['Model Year', 2020], ['Engine (full)', 'X'])).includes('<p class="subline">2020 · X</p>'));
  assert.ok(!card(decode(['Make', 'A'])).includes('class="subline"'));
});

test('Getriebe: Transmission (full) hat Vorrang, sonst Transmission, sonst entfällt die Zeile', () => {
  const both = card(decode(['Transmission', 'Kurz'], ['Transmission (full)', 'Lang']));
  assert.strictEqual(listOf(both), '<dt>Getriebe</dt><dd>Lang</dd>');
  assert.strictEqual(listOf(card(decode(['Transmission', 'Kurz']))), '<dt>Getriebe</dt><dd>Kurz</dd>');
  // (full) vorhanden, aber leer: Fallback auf Transmission
  const emptyFull = card(decode(['Transmission (full)', '  '], ['Transmission', 'Kurz']));
  assert.strictEqual(listOf(emptyFull), '<dt>Getriebe</dt><dd>Kurz</dd>');
  assert.strictEqual(listOf(card(decode(['Color', 'Rot']))), '<dt>Farbe</dt><dd>Rot</dd>');
});

test('Motorleistung: Zahl wird mit Einheit kW angezeigt, Text ebenso', () => {
  assert.strictEqual(listOf(card(decode(['Engine Power (kW)', 150]))), '<dt>Motorleistung</dt><dd>150 kW</dd>');
  assert.strictEqual(listOf(card(decode(['Engine Power (kW)', '55']))), '<dt>Motorleistung</dt><dd>55 kW</dd>');
  assert.strictEqual(listOf(card(decode(['Engine Power (kW)', 0]))), '<dt>Motorleistung</dt><dd>0 kW</dd>');
});

test('Alles wird escaped: Titel, Zeile, Liste', () => {
  const evil = '<script>alert(1)</script>';
  const html = card(
    decode(['Make', evil], ['Model', '"x" & \'y\''], ['Model Year', '<i>'], ['Engine (full)', '<b>'], ['Color', evil]),
  );
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<i>'));
  assert.ok(!html.includes('<b>'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt; &quot;x&quot; &amp; &#39;y&#39;'));
});

test('IDs, Logo und unbekannte Labels erscheinen nicht im HTML', () => {
  const html = card(
    decode(
      ['Make Logo', 'https://example.invalid/logo.png'], ['Model ID', 'GEHEIM-MODEL'], ['Transmission ID', 'GEHEIM-TRANS'],
      ['Vehicle ID', 'GEHEIM-VEH'], ['Color ID', 'GEHEIM-COLOR'], ['Irgendwas', 'GEHEIM-UNBEKANNT'], ['Make', 'Testmarke'],
    ),
  );
  assert.ok(html.includes('Testmarke'));
  assert.ok(!html.includes('GEHEIM'));
  assert.ok(!html.includes('example.invalid'));
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('<dl>'));
  // auch beim vollständigen Mock-Datensatz
  const full = card(FULL);
  for (const hidden of ['logo', 'TM-E-1', 'T-100', 'V-0001', 'C-77']) assert.ok(!full.includes(hidden), hidden);
});

test('Robust: data ohne decode-Array oder in falscher Form ergibt eine Karte mit Titel-Fallback', () => {
  const bad = [{}, { make: 'Testmarke', note: 'altes Format' }, { decode: 'text' }, { decode: {} }, { decode: null }, { decode: 5 }];
  for (const data of bad) {
    const html = card(data);
    assert.ok(html.includes('<h2>Dein Fahrzeug</h2>'), JSON.stringify(data));
    assert.ok(html.includes('class="tile"'), JSON.stringify(data));
    assert.ok(!html.includes('<dl>'), JSON.stringify(data));
    assert.ok(!html.includes('Testmarke'), JSON.stringify(data));
  }
});

test('Robust: Nicht-Objekt-Einträge in decode werden übersprungen', () => {
  const html = renderPage({
    data: { decode: [null, undefined, 'text', 7, true, [], [['Make', 'X']], { label: 5, value: 'x' }, { value: 'ohne Label' }, { label: 'Make', value: 'Testmarke' }] },
  });
  assert.ok(html.includes('<h2>Testmarke</h2>'));
  assert.ok(!html.includes('ohne Label'));
});

test('Doppelte Labels: der erste gewinnt', () => {
  const html = card(decode(['Make', 'Erste'], ['Make', 'Zweite'], ['Color', 'Rot'], ['Color', 'Blau']));
  assert.ok(html.includes('<h2>Erste</h2>'));
  assert.ok(!html.includes('Zweite'));
  assert.strictEqual(listOf(html), '<dt>Farbe</dt><dd>Rot</dd>');
  // erster Eintrag leer: gilt als fehlend, der zweite springt nicht ein
  assert.ok(card(decode(['Make', ''], ['Make', 'Zweite'])).includes('<h2>Dein Fahrzeug</h2>'));
});

test('Zahlen werden als Text angezeigt', () => {
  const html = card(decode(['Model Year', 2021], ['Color', 42], ['Engine Code', 3.5]));
  assert.ok(html.includes('<p class="subline">2021</p>'));
  assert.strictEqual(listOf(html), '<dt>Motorcode</dt><dd>3.5</dd><dt>Farbe</dt><dd>42</dd>');
});

test('Objekte, Listen, null, undefined, Wahrheitswerte, leere Texte, NaN gelten als fehlend, nie als JSON', () => {
  const values = [{ a: 1 }, [1, 2], null, undefined, true, false, '', '   ', NaN, Infinity];
  for (const value of values) {
    const html = card(decode(['Make', value], ['Model', value], ['Model Year', value], ['Engine (full)', value], ['Color', value], ['Engine Power (kW)', value]));
    assert.ok(html.includes('<h2>Dein Fahrzeug</h2>'), String(value));
    assert.ok(!html.includes('class="subline"'), String(value));
    assert.ok(!html.includes('<dl>'), String(value));
    for (const junk of ['{', '[object', 'null', 'undefined', 'NaN', 'Infinity', 'true', 'false', ' kW']) {
      assert.ok(!html.includes(`>${junk}`) && !html.includes(`${junk}<`), `${String(value)} ${junk}`);
    }
  }
});

test('Meldung ohne Daten: role="status", gleiche Optik (notice), kein alert, keine Karte', () => {
  const html = renderPage({ input: 'ABC', notice: MESSAGES.nodata });
  assert.ok(html.includes(`<p class="notice" role="status">${MESSAGES.nodata}</p>`));
  assert.ok(!html.includes('role="alert"'));
  assert.ok(!html.includes('class="card"'));
  assert.strictEqual(MESSAGES.nodata, 'Zu dieser Fahrgestellnummer haben wir keine Daten.');
});

test('Fehler bleibt role="alert"; ohne Meldung gibt es weder alert noch status', () => {
  const err = renderPage({ error: MESSAGES.unavailable });
  assert.ok(err.includes(`<p class="notice" role="alert">${MESSAGES.unavailable}</p>`));
  assert.ok(!err.includes('role="status"'));
  const plain = renderPage();
  assert.ok(!plain.includes('role="alert"') && !plain.includes('role="status"'));
});

test('Meldung ohne Daten wird escaped und enthält keinen Herkunftshinweis', () => {
  const html = renderPage({ notice: '<b>x</b>' });
  assert.ok(!html.includes('<b>x</b>'));
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;'));
  const shown = renderPage({ notice: MESSAGES.nodata, data: undefined });
  for (const word of ['source', 'Mock', 'mock', 'cache', 'Vincario', 'vincario']) assert.ok(!shown.includes(word), word);
});
