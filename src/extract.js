'use strict';

// menuName/serviceDay bestätigt über echte API-Antwort (siehe /api/debug/meal/:date),
// Rest bleibt als Fallback für andere Deployments dieser Software stehen.
const NAME_KEYS = [
  'menuName', 'menuText', 'menuBezeichnung', 'bezeichnung', 'name', 'artikelBezeichnung',
  'kurzText', 'kurztext', 'text', 'title', 'beschreibung', 'description',
];
const DATE_KEYS = ['serviceDay', 'day', 'date', 'datum', 'tag', 'orderDay'];
const CHILD_ARRAY_KEYS = ['positions', 'artikel', 'items', 'menus', 'lines', 'details', 'orderLines'];
// currentVSaldo bestätigt über echte API-Antwort (siehe /api/debug/budget), Rest bleibt
// als Fallback für andere Deployments dieser Software stehen.
const BALANCE_KEYS = ['currentVSaldo', 'saldo', 'balance', 'prepaidSaldo', 'guthaben', 'amount', 'betrag', 'currentBalance'];

const { formatDateInSchoolTimezone } = require('./tz');

function findFirstString(obj, keys) {
  if (!obj || typeof obj !== 'object') return null;
  for (const k of keys) {
    if (typeof obj[k] === 'string' && obj[k].trim()) return obj[k].trim();
  }
  return null;
}

/** Versucht ein Datum (YYYY-MM-DD) aus einem Order-Item-Objekt zu extrahieren. */
function extractDateString(item) {
  const raw = findFirstString(item, DATE_KEYS);
  if (!raw) return null;
  // YYYYMMDD - reines Datum ohne Uhrzeit, keine Zeitzonen-Umrechnung nötig/möglich.
  let m = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // YYYY-MM-DD - dito.
  m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // Voller Zeitstempel (ISO mit Uhrzeit/Offset, oder Sonstiges): explizit in
  // Europe/Berlin auswerten, siehe Kommentar oben.
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    return formatDateInSchoolTimezone(d);
  }
  return null;
}

/** Versucht ein Guthaben/Saldo (Zahl) aus einer Prepaid-Status-Antwort zu extrahieren. */
function extractBalance(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 2) return null;
  for (const k of BALANCE_KEYS) {
    const v = obj[k];
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
      const n = Number(v.replace(',', '.'));
      if (!Number.isNaN(n)) return n;
    }
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const nested = extractBalance(v, depth + 1);
      if (nested !== null) return nested;
    }
  }
  return null;
}

/**
 * order_placeholders liefert pro Tag ein Item je Menülinie: das tatsächlich
 * gewählte (orderPlaced: true) sowie die nicht gewählte(n) Alternative(n)
 * (orderPlaced: false - inklusive dem Fall, dass für den Tag noch GAR NICHTS
 * gewählt wurde, dann sind alle verfügbaren Items Alternativen). Live über
 * Browser-DevTools bestätigt (siehe Konversation). Nur orderPlaced-Items
 * zählen als "gegessen" (Statistik, Wiederholungserkennung).
 */
function splitChosenVsAlternative(items) {
  return {
    chosen: items.filter((i) => i.orderPlaced === true),
    alternative: items.filter((i) => i.orderPlaced !== true),
  };
}

/**
 * Kann die Wahl für diesen Tag noch geändert werden? disableOrdering: false
 * bei mindestens einem Item heißt "Bestellung/Änderung noch offen" (bestätigt
 * über echte API-Antwort, z.B. disableReason "Bestellung geschlossen"/
 * "Bestellung geliefert" wenn zu).
 */
function isOrderChangeable(items) {
  return items.some((i) => i.disableOrdering === false);
}

/** Liefert eine Liste von (evtl. mehreren) Gericht-Namen aus einem Order-Item. */
function extractDishNames(item) {
  const names = [];
  const direct = findFirstString(item, NAME_KEYS);
  if (direct) names.push(direct);

  for (const key of CHILD_ARRAY_KEYS) {
    if (Array.isArray(item[key])) {
      for (const sub of item[key]) {
        const n = findFirstString(sub, NAME_KEYS);
        if (n) names.push(n);
      }
    }
  }

  if (!names.length) {
    for (const [k, v] of Object.entries(item)) {
      if (typeof v === 'string' && v.trim().length > 3 && !DATE_KEYS.includes(k)) {
        names.push(v.trim());
        break;
      }
    }
  }

  return [...new Set(names)];
}

module.exports = {
  extractDateString,
  extractDishNames,
  extractBalance,
  splitChosenVsAlternative,
  isOrderChangeable,
  findFirstString,
};
