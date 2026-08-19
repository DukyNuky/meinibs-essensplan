'use strict';

const { MeinibsClient } = require('./meinibsClient');

/** Frisch eingeloggter Client für Ad-hoc-Diagnose-Aufrufe (siehe /api/debug/*). */
async function withClient(fn) {
  const baseUrl = process.env.MEINIBS_BASE_URL;
  const user = process.env.MEINIBS_USER;
  const pass = process.env.MEINIBS_PASSWORD;
  if (!baseUrl || !user || !pass) {
    throw new Error('MEINIBS_BASE_URL/MEINIBS_USER/MEINIBS_PASSWORD fehlen (.env prüfen).');
  }
  const client = new MeinibsClient({ baseUrl });
  await client.login(user, pass);
  return fn(client);
}

module.exports = { withClient };
