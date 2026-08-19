'use strict';

// Lädt die Bestellhistorie der aktuellen + letzten Woche roh herunter und speichert
// sie unter data/debug/, damit man die echten JSON-Feldnamen prüfen kann, falls die
// Anzeige in der App leer bleibt oder falsche Gerichtnamen zeigt.
//
// Aufruf: npm run probe
// (nutzt dieselben MEINIBS_* Variablen aus .env wie der normale Sync)

require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { MeinibsClient } = require('../src/meinibsClient');
const { isoWeek, isoWeekYear } = require('../src/dateUtils');

async function main() {
  const baseUrl = process.env.MEINIBS_BASE_URL;
  const user = process.env.MEINIBS_USER;
  const pass = process.env.MEINIBS_PASSWORD;
  if (!baseUrl || !user || !pass) {
    console.error('MEINIBS_BASE_URL / MEINIBS_USER / MEINIBS_PASSWORD fehlen (.env prüfen).');
    process.exit(1);
  }

  const client = new MeinibsClient({ baseUrl });
  console.log('Logge ein...');
  await client.login(user, pass);
  console.log('Login OK.');

  const outDir = path.join(__dirname, '..', 'data', 'debug');
  fs.mkdirSync(outDir, { recursive: true });

  const today = new Date();
  const lastWeek = new Date(today);
  lastWeek.setDate(lastWeek.getDate() - 7);

  for (const d of [lastWeek, today]) {
    const y = isoWeekYear(d);
    const w = isoWeek(d);
    console.log(`Hole Bestellhistorie für ISO-Woche ${y}-KW${w}...`);
    try {
      const data = await client.getOrderHistory(y, w);
      const file = path.join(outDir, `orderhistory_${y}_kw${w}.json`);
      fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
      const orderCount = Array.isArray(data?.order) ? data.order.length : 'unbekannt (kein order[]-Feld!)';
      console.log(`  -> gespeichert: ${file} (order-Einträge: ${orderCount})`);
      console.log(`  Top-Level-Keys: ${Object.keys(data || {}).join(', ')}`);
    } catch (err) {
      console.error(`  Fehler: ${err.message}`);
    }
  }

  console.log(`\nFertig. Schau dir die Dateien in ${outDir} an.`);
  console.log('Falls "dishNames" in der App leer/falsch sind: ein order-Item aus einer der');
  console.log('JSON-Dateien (mit geschwärztem Namen/Daten) mir zeigen, dann passe ich die');
  console.log('Extraktion in src/extract.js an.');
}

main().catch((err) => {
  console.error('Fehlgeschlagen:', err.message);
  process.exit(1);
});
