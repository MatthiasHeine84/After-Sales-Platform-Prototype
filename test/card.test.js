// Tests für Fahrzeugkarte und Meldungen in renderPage. Reine Funktion: kein Server, keine Dateien.
const test = require('node:test');
const assert = require('node:assert');
const { renderPage } = require('../src/page');
const { decodeFin } = require('./helpers/mock-decoder');
const { MESSAGES } = require('../src/fin');

const decode = (...items) => ({ decode: items.map(([label, value]) => ({ label, value })) });
const card = (data) => renderPage({ data });
const FULL = decodeFin('TESTMKA0000000001').data;

test('Alle Felder: Titel Make + Model, darunter Model Year, Kachel AUTO, keine Liste', () => {
  const html = card(decode(['Make', 'Testmarke'], ['Model', 'Testmodell'], ['Model Year', 2022]));
  assert.ok(html.includes('<h2>Testmarke Testmodell</h2>'));
  assert.ok(html.includes('<p class="subline">2022</p>'));
  assert.ok(html.includes('<div class="tile" aria-hidden="true">AUTO</div>'));
  assert.ok(!html.includes('<dl>'));
});

test('Mock-Datensätze 01 (41 Labels) und 02 (30 Labels) samt Listenwerten: kein Absturz, nur Titel und Jahr-Zeile', () => {
  const cardOf = (fin) => card(decodeFin(fin).data).match(/<section class="card">.*?<\/section>/s)[0];
  const expected = (title, year) =>
    `<section class="card">\n<div class="tile" aria-hidden="true">AUTO</div>\n<div class="info">\n` +
    `<h2>${title}</h2>\n<p class="subline">${year}</p>\n</div>\n</section>`;
  assert.strictEqual(decodeFin('TESTMKA0000000001').data.decode.length, 41);
  assert.strictEqual(decodeFin('TESTMKA0000000002').data.decode.length, 30);
  assert.strictEqual(cardOf('TESTMKA0000000001'), expected('Testmarke Testmodell E, Testmodell F', 2022));
  assert.strictEqual(cardOf('TESTMKA0000000002'), expected('Testmarke Testmodell K', 2019));
  assert.strictEqual(cardOf('TESTMKA0000000003'), expected('Testmarke Testmodell X', 2015));
});

test('Titel: nur Make, nur Model, beides fehlt', () => {
  assert.ok(card(decode(['Make', 'Testmarke'])).includes('<h2>Testmarke</h2>'));
  assert.ok(card(decode(['Model', 'Testmodell'])).includes('<h2>Testmodell</h2>'));
  const none = card(decode(['Color', 'Rot']));
  assert.ok(none.includes('<h2>Dein Fahrzeug</h2>'));
  assert.ok(none.includes('class="tile"'));
});

test('Mehrfachmodell: Model bleibt unverändert im Titel', () => {
  assert.ok(card(decode(['Make', 'Marke'], ['Model', 'ID.4, ID.5'])).includes('<h2>Marke ID.4, ID.5</h2>'));
});

test('Model Year: ohne Make und Model nur die Jahr-Zeile unter "Dein Fahrzeug"; ohne Jahr keine Zeile', () => {
  const onlyYear = card(decode(['Model Year', 2020]));
  assert.ok(onlyYear.includes('<h2>Dein Fahrzeug</h2>'));
  assert.ok(onlyYear.includes('<p class="subline">2020</p>'));
  assert.ok(!card(decode(['Make', 'A'], ['Model', 'B'])).includes('class="subline"'));
  assert.ok(!card(decode(['Make', 'A'], ['Model Year', ''])).includes('class="subline"'));
});

test('Alles wird escaped: Titel und Jahr-Zeile', () => {
  const evil = '<script>alert(1)</script>';
  const html = card(decode(['Make', evil], ['Model', '"x" & \'y\''], ['Model Year', '<i>']));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<i>'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt; &quot;x&quot; &amp; &#39;y&#39;'));
  assert.ok(html.includes('<p class="subline">&lt;i&gt;</p>'));
});

test('Nicht angezeigt: Trim, Body, Fuel Type, Transmission, Maße, Make Logo, IDs und Unbekanntes', () => {
  const html = card(
    decode(
      ['Make', 'Testmarke'], ['Model', 'Testmodell'], ['Model Year', 2022],
      ['Trim', 'GEHEIM-TRIM'], ['Body', 'GEHEIM-BODY'], ['Fuel Type - Primary', 'GEHEIM-FUEL'],
      ['Transmission', 'GEHEIM-TRANS'], ['Length (mm)', 99991], ['Wheel Size Array', ['GEHEIM-RAD']],
      ['Make Logo', 'https://example.invalid/logo.png'], ['Model ID', 'GEHEIM-MODEL'], ['Vehicle ID', 'GEHEIM-VEH'],
      ['Irgendwas', 'GEHEIM-UNBEKANNT'],
    ),
  );
  assert.ok(html.includes('Testmarke Testmodell'));
  assert.ok(!html.includes('GEHEIM'));
  assert.ok(!html.includes('99991'));
  assert.ok(!html.includes('example.invalid'));
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('<dl>'));
  // auch beim Mock-Datensatz
  const full = card(FULL);
  for (const hidden of ['logo', 'example.invalid', '<dl>', '<img', 'TESTAUSSTATTUNG', 'Testaufbau', 'Testkraftstoff', 'Testgetriebe', '3001']) {
    assert.ok(!full.includes(hidden), hidden);
  }
});

test('Robust: data ohne decode-Array oder in falscher Form ergibt eine Karte mit Titel-Fallback', () => {
  const bad = [{}, { make: 'Testmarke', note: 'altes Format' }, { decode: 'text' }, { decode: {} }, { decode: null }, { decode: 5 }];
  for (const data of bad) {
    const html = card(data);
    assert.ok(html.includes('<h2>Dein Fahrzeug</h2>'), JSON.stringify(data));
    assert.ok(html.includes('class="tile"'), JSON.stringify(data));
    assert.ok(!html.includes('class="subline"'), JSON.stringify(data));
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
  const html = card(decode(['Make', 'Erste'], ['Make', 'Zweite'], ['Model Year', 2001], ['Model Year', 2002]));
  assert.ok(html.includes('<h2>Erste</h2>'));
  assert.ok(html.includes('<p class="subline">2001</p>'));
  assert.ok(!html.includes('Zweite'));
  assert.ok(!html.includes('2002'));
  // erster Eintrag leer: gilt als fehlend, der zweite springt nicht ein
  assert.ok(card(decode(['Make', ''], ['Make', 'Zweite'])).includes('<h2>Dein Fahrzeug</h2>'));
});

test('Zahlen werden als Text angezeigt', () => {
  const html = card(decode(['Model', 3.5], ['Model Year', 2021]));
  assert.ok(html.includes('<h2>3.5</h2>'));
  assert.ok(html.includes('<p class="subline">2021</p>'));
});

test('Objekte, Listen, null, undefined, Wahrheitswerte, leere Texte, NaN gelten als fehlend, nie als JSON', () => {
  const values = [{ a: 1 }, [1, 2], null, undefined, true, false, '', '   ', NaN, Infinity];
  for (const value of values) {
    const html = card(decode(['Make', value], ['Model', value], ['Model Year', value]));
    assert.ok(html.includes('<h2>Dein Fahrzeug</h2>'), String(value));
    assert.ok(!html.includes('class="subline"'), String(value));
    for (const junk of ['{', '[object', 'null', 'undefined', 'NaN', 'Infinity', 'true', 'false']) {
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
