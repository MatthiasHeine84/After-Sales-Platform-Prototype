// Mock-Decoder: liefert erfundene Fahrzeugdaten für drei Test-FINs. Kein Netzwerk, keine Dateien, keine Logs.
// Die Schnittstelle decodeFin(fin) bleibt in Spec 03 gleich, nur die Quelle wechselt.
// Labels, id-Felder und Werttypen entsprechen den echten Antworten der Proben (03a), alle Werte sind erfunden.

const MOCK_DATA = {
  // Labels der ID.4-Probe (41 Einträge), erfundene Werte
  TESTMKA0000000001: [
    { label: 'VIN', value: 'TESTMKA0000000001' },
    { id: 901, label: 'Make', value: 'Testmarke' },
    { id: 902, label: 'Model', value: 'Testmodell E, Testmodell F' },
    { label: 'Model Year', value: 2022 },
    { id: 903, label: 'Product Type', value: 'Testtyp' },
    { id: 904, label: 'Body', value: 'Testaufbau' },
    { label: 'Trim', value: 'TESTAUSSTATTUNG 1' },
    { id: 905, label: 'Fuel Type - Primary', value: 'Testkraftstoff' },
    { id: 906, label: 'Transmission', value: 'Testgetriebe' },
    { label: 'Manufacturer', value: 'TESTHERSTELLER AG, TESTSTADT' },
    { label: 'Manufacturer Address', value: 'Teststraße 1, Testland' },
    { label: 'Plant Country', value: 'Testland' },
    { label: 'Make Logo', value: 'https://example.invalid/make/testmarke.svg' },
    { label: 'Engine Manufacturer', value: 'TH' },
    { label: 'CO2 Emission (g/km)', value: 101 },
    { label: 'Number Wheels', value: 4 },
    { label: 'Number of Axles', value: 2 },
    { label: 'Number of Doors', value: 5 },
    { label: 'Number of Seats', value: '7' },
    { label: 'Power Steering', value: 'Testlenkung' },
    { label: 'Rear Brakes', value: 'Testbremse' },
    { label: 'Suspension', value: 'Testfederung' },
    { label: 'Steering Type', value: 'Testlenkungstyp' },
    { label: 'Wheel Size', value: '100/10 R10 10X' },
    { label: 'Wheel Size Array', value: ['100/10 R10 10X', '110/11 R11 11X'] },
    { label: 'Wheelbase (mm)', value: 2001 },
    { label: 'Wheelbase Array (mm)', value: [2001] },
    { label: 'Height (mm)', value: 1001 },
    { label: 'Length (mm)', value: 3001 },
    { label: 'Width (mm)', value: 1501 },
    { label: 'Track Front (mm)', value: 1201 },
    { label: 'Track Rear (mm)', value: 1202 },
    { label: 'Max Speed (km/h)', value: 111 },
    { label: 'Weight Empty (kg)', value: 1111 },
    { label: 'Max Weight (kg)', value: 1999 },
    { label: 'Max roof load (kg)', value: 11 },
    { label: 'Permitted towbar download (kg)', value: 12 },
    { label: 'Permitted trailer load without brakes (kg)', value: 13 },
    { label: 'ABS', value: 1 },
    { label: 'Check Digit', value: '0' },
    { label: 'Sequential Number', value: '000001' },
  ],
  // Labels der Polo-Probe (30 Einträge), erfundene Werte
  TESTMKA0000000002: [
    { label: 'VIN', value: 'TESTMKA0000000002' },
    { label: 'Vehicle ID', value: 2001 },
    { id: 911, label: 'Make', value: 'Testmarke' },
    { id: 912, label: 'Model', value: 'Testmodell K' },
    { label: 'Model Year', value: 2019 },
    { id: 913, label: 'Product Type', value: 'Testtyp' },
    { label: 'Make Logo', value: 'https://example.invalid/make/testmarke.svg' },
    { label: 'Fuel Consumption Combined (l/100km)', value: 3 },
    { label: 'Fuel Consumption Extra Urban (l/100km)', value: 2 },
    { label: 'Fuel Consumption Urban (l/100km)', value: 4 },
    { label: 'CO2 Emission (g/km)', value: 102 },
    { label: 'Number of Axles', value: 2 },
    { label: 'Number of Seats', value: '4' },
    { label: 'Power Steering', value: 'Testlenkung' },
    { label: 'Steering Type', value: 'Testlenkungstyp' },
    { label: 'Wheel Size', value: '120/12 R12 12X' },
    { label: 'Wheel Size Array', value: ['120/12 R12 12X'] },
    { label: 'Wheelbase (mm)', value: 2002 },
    { label: 'Wheelbase Array (mm)', value: [2002] },
    { label: 'Height (mm)', value: 1002 },
    { label: 'Length (mm)', value: 3002 },
    { label: 'Width (mm)', value: 1502 },
    { label: 'Max Speed (km/h)', value: 112 },
    { label: 'Weight Empty (kg)', value: 1112 },
    { label: 'Max Weight (kg)', value: 1998 },
    { label: 'Max roof load (kg)', value: 14 },
    { label: 'Permitted towbar download (kg)', value: 15 },
    { label: 'ABS', value: 1 },
    { label: 'Check Digit', value: '0' },
    { label: 'Sequential Number', value: '000002' },
  ],
  // Datensatz mit fehlenden Feldern (erfunden): nur Make, Model, Model Year
  TESTMKA0000000003: [
    { label: 'Make', value: 'Testmarke' },
    { label: 'Model', value: 'Testmodell X' },
    { label: 'Model Year', value: 2015 },
  ],
};

// Ergebnis: { status: 'found', source: 'mock', data } | { status: 'nodata' } | { status: 'error' }
function decodeFin(fin) {
  // hasOwn statt MOCK_DATA[fin]: "constructor" oder "__proto__" sollen nie treffen
  if (typeof fin !== 'string' || !Object.hasOwn(MOCK_DATA, fin)) return { status: 'nodata' };

  // Kopie, damit niemand die festen Mock-Daten versehentlich ändert (Listenwerte werden mitkopiert)
  return {
    status: 'found',
    source: 'mock',
    data: {
      decode: MOCK_DATA[fin].map((item) => ({
        ...item,
        ...(Array.isArray(item.value) ? { value: [...item.value] } : {}),
      })),
    },
  };
}

module.exports = { decodeFin };
