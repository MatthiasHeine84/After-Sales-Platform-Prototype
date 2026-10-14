// Mock-Decoder: liefert erfundene Fahrzeugdaten für drei Test-FINs. Kein Netzwerk, keine Dateien, keine Logs.
// Die Schnittstelle decodeFin(fin) bleibt in Spec 03 gleich, nur die Quelle wechselt.

const MOCK_DATA = {
  // ID.4-ähnlich (erfunden)
  TESTMKA0000000001: [
    { label: 'Make', value: 'Testmarke' },
    { label: 'Make Logo', value: 'https://example.invalid/logo.png' },
    { label: 'Model', value: 'Testmodell E' },
    { label: 'Model ID', value: 'TM-E-1' },
    { label: 'Model Year', value: 2022 },
    { label: 'Transmission', value: 'Automatik' },
    { label: 'Transmission (full)', value: '1-Gang-Automatik' },
    { label: 'Transmission ID', value: 'T-100' },
    { label: 'Vehicle Specification', value: 'Testausstattung Plus' },
    { label: 'Vehicle ID', value: 'V-0001' },
    { label: 'Engine Model', value: 'Elektromotor 150' },
    { label: 'Engine Power (kW)', value: 150 },
    { label: 'Engine (full)', value: 'Elektro 150 kW' },
    { label: 'Engine Code', value: 'EM150' },
    { label: 'Color', value: 'Mondgrau' },
    { label: 'Color ID', value: 'C-77' },
  ],
  // Polo-ähnlich (erfunden)
  TESTMKA0000000002: [
    { label: 'Make', value: 'Testmarke' },
    { label: 'Make Logo', value: 'https://example.invalid/logo.png' },
    { label: 'Model', value: 'Testmodell K' },
    { label: 'Model ID', value: 'TM-K-2' },
    { label: 'Model Year', value: 2019 },
    { label: 'Transmission', value: 'Schaltgetriebe' },
    { label: 'Transmission (full)', value: '5-Gang-Schaltgetriebe' },
    { label: 'Transmission ID', value: 'T-200' },
    { label: 'Vehicle Specification', value: 'Testausstattung Basis' },
    { label: 'Vehicle ID', value: 'V-0002' },
    { label: 'Engine Model', value: 'Benziner 1.0' },
    { label: 'Engine Power (kW)', value: 55 },
    { label: 'Engine (full)', value: '1.0 Benzin 55 kW' },
    { label: 'Engine Code', value: 'B10' },
    { label: 'Color', value: 'Tiefblau' },
    { label: 'Color ID', value: 'C-12' },
  ],
  // Datensatz mit fehlenden Feldern (erfunden)
  TESTMKA0000000003: [
    { label: 'Make', value: 'Testmarke' },
    { label: 'Model', value: 'Testmodell X' },
    { label: 'Model Year', value: 2015 },
    { label: 'Transmission', value: 'Automatik' },
    { label: 'Engine Power (kW)', value: 90 },
  ],
};

// Ergebnis: { status: 'found', data } | { status: 'nodata' } | { status: 'error' }
function decodeFin(fin) {
  // hasOwn statt MOCK_DATA[fin]: "constructor" oder "__proto__" sollen nie treffen
  if (typeof fin !== 'string' || !Object.hasOwn(MOCK_DATA, fin)) return { status: 'nodata' };

  // Kopie, damit niemand die festen Mock-Daten versehentlich ändert
  return { status: 'found', data: { decode: MOCK_DATA[fin].map((item) => ({ ...item })) } };
}

module.exports = { decodeFin };
