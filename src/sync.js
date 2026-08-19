'use strict';

const { MeinibsClient } = require('./meinibsClient');
const { weeksBetween, formatISODate } = require('./dateUtils');
const {
  extractDateString,
  extractDishNames,
  extractBalance,
  splitChosenVsAlternative,
  isOrderChangeable,
} = require('./extract');
const { normalizeDishName } = require('./normalize');
const db = require('./db');

let syncing = false;

// Vorsichtshalber deduplizieren, falls sich Wochen-Abfragen überschneiden - rein
// kosmetisch (dishNames wird ohnehin über ein Set dedupliziert), aber unnötiger
// Ballast in raw_json.
function dedupeItems(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = JSON.stringify(item);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Umgebungsvariable ${name} fehlt (siehe .env.example).`);
  return v;
}

/**
 * Zieht die Bestellhistorie für den konfigurierten Zeitraum und speichert sie.
 * Meldet sich bei jedem Lauf frisch an (kein Token-Refresh nötig, siehe meinibsClient.js).
 */
async function runSync() {
  if (syncing) {
    return { ok: false, message: 'Sync läuft bereits.' };
  }
  syncing = true;
  const logId = db.logSyncStart();
  try {
    const baseUrl = requireEnv('MEINIBS_BASE_URL');
    const user = requireEnv('MEINIBS_USER');
    const pass = requireEnv('MEINIBS_PASSWORD');
    const weeksBack = Number(process.env.SYNC_WEEKS_BACK || 8);
    const weeksForward = Number(process.env.SYNC_WEEKS_FORWARD || 2);

    const client = new MeinibsClient({ baseUrl });
    await client.login(user, pass);

    const today = new Date();
    const from = new Date(today);
    from.setDate(from.getDate() - weeksBack * 7);
    const to = new Date(today);
    to.setDate(to.getDate() + weeksForward * 7);

    const weeks = weeksBetween(from, to);
    const syncedAt = new Date().toISOString();
    let itemsSeen = 0;

    // Erst alle Items über alle abgefragten Wochen hinweg nach Datum gruppieren -
    // ein Tag kann mehrere Einträge haben (gewähltes Menü + nicht gewählte
    // Alternative(n) je Menülinie). order_placeholders liefert genau das: pro
    // Menülinie ein Item mit orderPlaced (gewählt?) und disableOrdering (noch
    // änderbar?) - live über Browser-DevTools bestätigt.
    const itemsByDate = new Map();
    for (const { isoYear, isoWeek } of weeks) {
      let result;
      try {
        result = await client.getOrderPlaceholders(isoYear, isoWeek);
      } catch (err) {
        // Einzelne Woche darf fehlschlagen (z.B. noch keine Daten in der Zukunft),
        // der restliche Sync läuft weiter.
        continue;
      }
      const items = Array.isArray(result?.orderPlaceholder) ? result.orderPlaceholder : [];
      for (const item of items) {
        itemsSeen += 1;
        const date = extractDateString(item);
        if (!date) continue;
        if (!itemsByDate.has(date)) itemsByDate.set(date, []);
        itemsByDate.get(date).push(item);
      }
    }

    // Der abgefragte Zeitraum ist für diesen Sync die alleinige Quelle der
    // Wahrheit - alte/verwaiste Einträge (z.B. von einem früheren Extraktions-Bug)
    // werden verworfen, bevor die frischen Ergebnisse geschrieben werden.
    db.deleteMealDaysInRange(formatISODate(from), formatISODate(to));

    let daysSaved = 0;
    for (const [date, rawItems] of itemsByDate) {
      const items = dedupeItems(rawItems);
      const { chosen, alternative } = splitChosenVsAlternative(items);
      const dishNames = [...new Set(chosen.flatMap(extractDishNames))];
      const alternativeNames = [...new Set(alternative.flatMap(extractDishNames))].filter(
        (n) => !dishNames.includes(n)
      );
      if (!dishNames.length && !alternativeNames.length) continue;

      db.saveMealDay({
        date,
        dishNames,
        alternatives: alternativeNames,
        canChangeOrder: isOrderChangeable(items),
        rawJson: items,
        syncedAt,
        occurrences: dishNames.map((name) => ({ name, normalized: normalizeDishName(name) })),
      });
      daysSaved += 1;
    }

    try {
      const prepaid = await client.getPrepaidStatus();
      const balance = extractBalance(prepaid);
      db.insertBudgetSnapshot({ fetchedAt: syncedAt, balance, rawJson: prepaid });
    } catch {
      // Guthaben ist nice-to-have und darf den restlichen Sync nicht zum Scheitern bringen.
    }

    const message = `${weeks.length} Wochen geprüft, ${itemsSeen} Einträge gesehen, ${daysSaved} Tage gespeichert.`;
    db.logSyncFinish(logId, true, message);
    return { ok: true, message };
  } catch (err) {
    db.logSyncFinish(logId, false, err.message);
    throw err;
  } finally {
    syncing = false;
  }
}

module.exports = { runSync };
