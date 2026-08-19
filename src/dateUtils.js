'use strict';

function toDate(d) {
  return d instanceof Date ? d : new Date(d);
}

/** ISO-8601 Kalenderwoche (1-53) für ein Datum. */
function isoWeek(date) {
  const d = new Date(Date.UTC(toDate(date).getFullYear(), toDate(date).getMonth(), toDate(date).getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

/** Zu isoWeek() passendes ISO-Wochenjahr (kann vom Kalenderjahr abweichen, z.B. Ende Dezember). */
function isoWeekYear(date) {
  const d = new Date(Date.UTC(toDate(date).getFullYear(), toDate(date).getMonth(), toDate(date).getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  return d.getUTCFullYear();
}

function formatYYYYMMDD(date) {
  const d = toDate(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function formatISODate(date) {
  const d = toDate(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Liste der distinct (isoYear, isoWeek) Paare zwischen zwei Daten (inklusive). */
function weeksBetween(startDate, endDate) {
  const weeks = [];
  const seen = new Set();
  const cur = new Date(startDate);
  while (cur <= endDate) {
    const y = isoWeekYear(cur);
    const w = isoWeek(cur);
    const key = `${y}-${w}`;
    if (!seen.has(key)) {
      seen.add(key);
      weeks.push({ isoYear: y, isoWeek: w });
    }
    cur.setDate(cur.getDate() + 7);
  }
  // Sicherstellen, dass die letzte Woche (endDate) nicht durch den 7-Tage-Sprung übersprungen wurde.
  const y = isoWeekYear(endDate);
  const w = isoWeek(endDate);
  const key = `${y}-${w}`;
  if (!seen.has(key)) weeks.push({ isoYear: y, isoWeek: w });
  return weeks;
}

module.exports = { isoWeek, isoWeekYear, formatYYYYMMDD, formatISODate, weeksBetween };
