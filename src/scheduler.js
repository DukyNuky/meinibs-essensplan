'use strict';

const cron = require('node-cron');
const db = require('./db');
const { runSync } = require('./sync');

// Zeitplan läuft in Europe/Berlin (nicht Container-Zeitzone/UTC), sonst feuert
// z.B. "Sonntag 18:00" tatsächlich um 20:00 deutscher Zeit - selbes Problem wie
// bei der Datumsauswertung in extract.js.
const SCHOOL_TIMEZONE = 'Europe/Berlin';

let task = null;

function buildCronExpr({ weekday, hour, minute }) {
  return `${minute} ${hour} * * ${weekday}`;
}

function readCustomSchedule() {
  const weekday = db.getSetting('sync_weekday');
  const hour = db.getSetting('sync_hour');
  const minute = db.getSetting('sync_minute');
  if (weekday === null || hour === null || minute === null) return null;
  return { weekday: Number(weekday), hour: Number(hour), minute: Number(minute) };
}

function applyCronExpr(cronExpr) {
  if (task) {
    task.stop();
    task = null;
  }
  if (!cron.validate(cronExpr)) {
    console.warn(`[cron] Ungültiger Ausdruck "${cronExpr}" - automatischer Sync deaktiviert.`);
    return;
  }
  task = cron.schedule(
    cronExpr,
    () => {
      console.log('[cron] Starte Sync...');
      runSync()
        .then((r) => console.log('[cron] Sync fertig:', r.message))
        .catch((err) => console.error('[cron] Sync fehlgeschlagen:', err.message));
    },
    { timezone: SCHOOL_TIMEZONE }
  );
  console.log(`[cron] Automatischer Sync geplant: ${cronExpr} (${SCHOOL_TIMEZONE})`);
}

function start() {
  const custom = readCustomSchedule();
  applyCronExpr(custom ? buildCronExpr(custom) : process.env.SYNC_CRON || '0 */4 * * *');
}

function updateSchedule({ weekday, hour, minute }) {
  db.setSetting('sync_weekday', String(weekday));
  db.setSetting('sync_hour', String(hour));
  db.setSetting('sync_minute', String(minute));
  applyCronExpr(buildCronExpr({ weekday, hour, minute }));
}

function getScheduleForApi() {
  const custom = readCustomSchedule();
  if (custom) return { custom: true, ...custom };
  return { custom: false, weekday: null, hour: null, minute: null, cronExpr: process.env.SYNC_CRON || '0 */4 * * *' };
}

module.exports = { start, updateSchedule, getScheduleForApi };
