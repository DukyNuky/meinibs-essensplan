'use strict';

const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || './data/meinibis.db';

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS meal_days (
    date TEXT PRIMARY KEY,
    dish_names TEXT NOT NULL,
    raw_json TEXT NOT NULL,
    synced_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS dish_occurrences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    dish_name TEXT NOT NULL,
    dish_name_normalized TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_dish_occurrences_norm ON dish_occurrences(dish_name_normalized);
  CREATE INDEX IF NOT EXISTS idx_dish_occurrences_date ON dish_occurrences(date);

  CREATE TABLE IF NOT EXISTS ratings (
    date TEXT PRIMARY KEY,
    rating TEXT NOT NULL CHECK(rating IN ('good','neutral','bad')),
    comment TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS budget_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fetched_at TEXT NOT NULL,
    balance REAL,
    raw_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    ok INTEGER,
    message TEXT
  );
`);

// Migration: Spalten kamen nach dem ersten Release dazu - bestehende
// meal_days-Tabellen bekommen sie nachträglich.
const mealDaysColumns = db.prepare(`PRAGMA table_info(meal_days)`).all().map((c) => c.name);
if (!mealDaysColumns.includes('alternatives_json')) {
  db.exec(`ALTER TABLE meal_days ADD COLUMN alternatives_json TEXT NOT NULL DEFAULT '[]'`);
}
if (!mealDaysColumns.includes('can_change_order')) {
  db.exec(`ALTER TABLE meal_days ADD COLUMN can_change_order INTEGER NOT NULL DEFAULT 0`);
}

// Migration: 'neutral' kam nachträglich zum rating-CHECK dazu - SQLite kann
// CHECK-Constraints nicht per ALTER ändern, also Tabelle bei Bedarf neu bauen.
const ratingsTableSql = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='ratings'`).get();
if (ratingsTableSql && !ratingsTableSql.sql.includes("'neutral'")) {
  db.exec(`
    CREATE TABLE ratings_new (
      date TEXT PRIMARY KEY,
      rating TEXT NOT NULL CHECK(rating IN ('good','neutral','bad')),
      comment TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO ratings_new SELECT date, rating, comment, created_at, updated_at FROM ratings;
    DROP TABLE ratings;
    ALTER TABLE ratings_new RENAME TO ratings;
  `);
}

const upsertMealDay = db.prepare(`
  INSERT INTO meal_days (date, dish_names, alternatives_json, can_change_order, raw_json, synced_at)
  VALUES (@date, @dish_names, @alternatives_json, @can_change_order, @raw_json, @synced_at)
  ON CONFLICT(date) DO UPDATE SET
    dish_names = excluded.dish_names,
    alternatives_json = excluded.alternatives_json,
    can_change_order = excluded.can_change_order,
    raw_json = excluded.raw_json,
    synced_at = excluded.synced_at
`);

const deleteDishOccurrencesForDate = db.prepare(`DELETE FROM dish_occurrences WHERE date = ?`);
const insertDishOccurrence = db.prepare(`
  INSERT INTO dish_occurrences (date, dish_name, dish_name_normalized) VALUES (?, ?, ?)
`);

function saveMealDay({ date, dishNames, alternatives, canChangeOrder, rawJson, syncedAt, occurrences }) {
  const tx = db.transaction(() => {
    upsertMealDay.run({
      date,
      dish_names: JSON.stringify(dishNames),
      alternatives_json: JSON.stringify(alternatives || []),
      can_change_order: canChangeOrder ? 1 : 0,
      raw_json: JSON.stringify(rawJson),
      synced_at: syncedAt,
    });
    deleteDishOccurrencesForDate.run(date);
    for (const occ of occurrences) {
      insertDishOccurrence.run(date, occ.name, occ.normalized);
    }
  });
  tx();
}

/**
 * Löscht alle meal_days/dish_occurrences im angefragten Zeitraum, bevor ein Sync
 * seine frischen Ergebnisse schreibt. Ohne das würden Tage, deren Datum durch
 * einen früheren (inzwischen gefixten) Extraktions-Bug falsch berechnet wurde,
 * für immer als Karteileichen stehen bleiben - jeder Sync ist für seinen
 * abgefragten Zeitraum die alleinige Quelle der Wahrheit.
 */
function deleteMealDaysInRange(from, to) {
  const dates = db.prepare(`SELECT date FROM meal_days WHERE date BETWEEN ? AND ?`).all(from, to).map((r) => r.date);
  const tx = db.transaction(() => {
    for (const date of dates) {
      deleteDishOccurrencesForDate.run(date);
    }
    db.prepare(`DELETE FROM meal_days WHERE date BETWEEN ? AND ?`).run(from, to);
  });
  tx();
}

function listMealDays({ from, to }) {
  return db
    .prepare(
      `SELECT date, dish_names, alternatives_json, can_change_order, synced_at FROM meal_days WHERE date BETWEEN ? AND ? ORDER BY date DESC`
    )
    .all(from, to);
}

function getPriorOccurrences(normalizedName, beforeDate, limit = 5) {
  return db
    .prepare(
      `SELECT DISTINCT date FROM dish_occurrences
       WHERE dish_name_normalized = ? AND date < ?
       ORDER BY date DESC LIMIT ?`
    )
    .all(normalizedName, beforeDate, limit);
}

function getRating(date) {
  return db.prepare(`SELECT * FROM ratings WHERE date = ?`).get(date);
}

function getRatingsForDates(dates) {
  if (!dates.length) return new Map();
  const placeholders = dates.map(() => '?').join(',');
  const rows = db.prepare(`SELECT * FROM ratings WHERE date IN (${placeholders})`).all(...dates);
  return new Map(rows.map((r) => [r.date, r]));
}

function upsertRating(date, rating, comment) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO ratings (date, rating, comment, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET rating = excluded.rating, comment = excluded.comment, updated_at = excluded.updated_at`
  ).run(date, rating, comment || null, now, now);
}

function deleteRating(date) {
  db.prepare(`DELETE FROM ratings WHERE date = ?`).run(date);
}

function logSyncStart() {
  const startedAt = new Date().toISOString();
  const info = db.prepare(`INSERT INTO sync_log (started_at) VALUES (?)`).run(startedAt);
  return info.lastInsertRowid;
}

function logSyncFinish(id, ok, message) {
  db.prepare(`UPDATE sync_log SET finished_at = ?, ok = ?, message = ? WHERE id = ?`).run(
    new Date().toISOString(),
    ok ? 1 : 0,
    message || null,
    id
  );
}

function getLastSync() {
  return db.prepare(`SELECT * FROM sync_log ORDER BY id DESC LIMIT 1`).get();
}

function insertBudgetSnapshot({ fetchedAt, balance, rawJson }) {
  db.prepare(`INSERT INTO budget_snapshots (fetched_at, balance, raw_json) VALUES (?, ?, ?)`).run(
    fetchedAt,
    balance,
    JSON.stringify(rawJson)
  );
}

function getLatestBudget() {
  return db.prepare(`SELECT fetched_at, balance FROM budget_snapshots ORDER BY id DESC LIMIT 1`).get();
}

// todayISO: nur Tage bis (und mit) heute zählen - Essen, das für die nächsten
// zwei Wochen schon vorbestellt aber noch nicht serviert wurde, soll nicht als
// "schon gegessen" bzw. "Wiederholung" in die Statistik einfließen.
function getStats(todayISO) {
  const totalDays = db.prepare(`SELECT COUNT(*) AS c FROM meal_days WHERE date <= ?`).get(todayISO).c;
  const ratingRows = db
    .prepare(`SELECT rating, COUNT(*) AS c FROM ratings WHERE date <= ? GROUP BY rating`)
    .all(todayISO);
  const good = ratingRows.find((r) => r.rating === 'good')?.c || 0;
  const neutral = ratingRows.find((r) => r.rating === 'neutral')?.c || 0;
  const bad = ratingRows.find((r) => r.rating === 'bad')?.c || 0;

  const dishStats = db
    .prepare(
      `SELECT
         o.dish_name_normalized AS normalized,
         MAX(o.dish_name) AS name,
         COUNT(DISTINCT o.date) AS occurrences,
         SUM(CASE WHEN r.rating = 'good' THEN 1 ELSE 0 END) AS good,
         SUM(CASE WHEN r.rating = 'neutral' THEN 1 ELSE 0 END) AS neutral,
         SUM(CASE WHEN r.rating = 'bad' THEN 1 ELSE 0 END) AS bad
       FROM dish_occurrences o
       LEFT JOIN ratings r ON r.date = o.date
       WHERE o.date <= ?
       GROUP BY o.dish_name_normalized
       HAVING occurrences >= 2
       ORDER BY occurrences DESC`
    )
    .all(todayISO);

  const mostRepeated = dishStats.slice(0, 5);
  // Für "Liebstes/Unbeliebtestes Essen" zählt nur die good/bad-Tendenz - neutral
  // bewertete Tage fließen bewusst nicht in dieses Ranking ein.
  const ratedEnough = dishStats.filter((d) => d.good + d.bad >= 2);
  const ratio = (d) => d.good / (d.good + d.bad);
  const mostLoved = [...ratedEnough].sort((a, b) => ratio(b) - ratio(a)).slice(0, 3);
  const mostDisliked = [...ratedEnough].sort((a, b) => ratio(a) - ratio(b)).slice(0, 3);

  return {
    totalDays,
    good,
    neutral,
    bad,
    unrated: Math.max(0, totalDays - good - neutral - bad),
    mostRepeated,
    mostLoved,
    mostDisliked,
  };
}

function getSetting(key) {
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value);
}

function getRawMealJson(date) {
  const row = db.prepare(`SELECT raw_json FROM meal_days WHERE date = ?`).get(date);
  return row ? JSON.parse(row.raw_json) : null;
}

function getLatestBudgetRaw() {
  const row = db
    .prepare(`SELECT fetched_at, balance, raw_json FROM budget_snapshots ORDER BY id DESC LIMIT 1`)
    .get();
  if (!row) return null;
  return { fetched_at: row.fetched_at, balance: row.balance, raw_json: JSON.parse(row.raw_json) };
}

module.exports = {
  db,
  saveMealDay,
  deleteMealDaysInRange,
  listMealDays,
  getPriorOccurrences,
  getRating,
  getRatingsForDates,
  upsertRating,
  deleteRating,
  logSyncStart,
  logSyncFinish,
  getLastSync,
  insertBudgetSnapshot,
  getLatestBudget,
  getStats,
  getSetting,
  setSetting,
  getRawMealJson,
  getLatestBudgetRaw,
};
