'use strict';

const express = require('express');
const db = require('./db');
const { normalizeDishName } = require('./normalize');
const { runSync } = require('./sync');
const scheduler = require('./scheduler');
const { todayInSchoolTimezone } = require('./tz');
const { formatYYYYMMDD } = require('./dateUtils');
const { withClient } = require('./debugClient');

const router = express.Router();

router.get('/health', (req, res) => res.json({ ok: true }));

router.get('/meals', (req, res) => {
  const to = req.query.to || todayInSchoolTimezone();
  const from = req.query.from || '0000-01-01';
  const days = db.listMealDays({ from, to });
  const dates = days.map((d) => d.date);
  const ratings = db.getRatingsForDates(dates);

  const result = days.map((day) => {
    const names = JSON.parse(day.dish_names || '[]');
    const alternatives = JSON.parse(day.alternatives_json || '[]');
    const repeats = [];
    for (const name of names) {
      const normalized = normalizeDishName(name);
      const prior = db.getPriorOccurrences(normalized, day.date, 3);
      if (prior.length) {
        const priorRatings = db.getRatingsForDates(prior.map((p) => p.date));
        repeats.push({
          dish: name,
          priorDates: prior.map((p) => ({
            date: p.date,
            rating: priorRatings.get(p.date)?.rating || null,
            comment: priorRatings.get(p.date)?.comment || null,
          })),
        });
      }
    }
    const rating = ratings.get(day.date);
    return {
      date: day.date,
      dishNames: names,
      alternatives,
      canChangeOrder: !!day.can_change_order,
      syncedAt: day.synced_at,
      rating: rating?.rating || null,
      comment: rating?.comment || null,
      repeats,
    };
  });

  res.json(result);
});

router.put('/meals/:date/rating', (req, res) => {
  const { date } = req.params;
  const { rating, comment } = req.body || {};
  if (!['good', 'bad'].includes(rating)) {
    return res.status(400).json({ ok: false, message: "rating muss 'good' oder 'bad' sein." });
  }
  db.upsertRating(date, rating, comment);
  res.json({ ok: true });
});

router.delete('/meals/:date/rating', (req, res) => {
  db.deleteRating(req.params.date);
  res.json({ ok: true });
});

router.post('/sync', async (req, res) => {
  try {
    const result = await runSync();
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

router.get('/sync/last', (req, res) => {
  res.json(db.getLastSync() || null);
});

router.get('/budget', (req, res) => {
  res.json(db.getLatestBudget() || null);
});

router.get('/stats', (req, res) => {
  res.json(db.getStats(todayInSchoolTimezone()));
});

router.get('/settings/sync-schedule', (req, res) => {
  res.json(scheduler.getScheduleForApi());
});

router.put('/settings/sync-schedule', (req, res) => {
  const weekday = Number(req.body?.weekday);
  const hour = Number(req.body?.hour);
  const minute = Number(req.body?.minute);
  const valid =
    Number.isInteger(weekday) && weekday >= 0 && weekday <= 6 &&
    Number.isInteger(hour) && hour >= 0 && hour <= 23 &&
    Number.isInteger(minute) && minute >= 0 && minute <= 59;
  if (!valid) {
    return res.status(400).json({ ok: false, message: 'Ungültiger Zeitplan.' });
  }
  scheduler.updateSchedule({ weekday, hour, minute });
  res.json({ ok: true });
});

// Diagnose-Endpunkte, um die rohen API-Antworten von meinibs.de zu prüfen, falls
// Gerichtnamen oder Guthaben falsch/leer extrahiert werden (siehe src/extract.js).
router.get('/debug/meal/:date', (req, res) => {
  const raw = db.getRawMealJson(req.params.date);
  if (!raw) return res.status(404).json({ ok: false, message: 'Kein Eintrag für dieses Datum.' });
  res.json(raw);
});

router.get('/debug/budget', (req, res) => {
  const raw = db.getLatestBudgetRaw();
  if (!raw) return res.status(404).json({ ok: false, message: 'Noch kein Guthaben-Snapshot vorhanden.' });
  res.json(raw);
});

// Live-Abfrage (kein DB-Cache) der Menü-Details für einen Tag+Menülinie, um
// herauszufinden ob/wie die nicht gewählte Alternative über die API erreichbar ist.
// Beispiel: /api/debug/menu-details/2026-08-24/MENU_2
router.get('/debug/menu-details/:date/:menuLine', async (req, res) => {
  try {
    const dateObj = new Date(`${req.params.date}T00:00:00`);
    const data = await withClient((client) => client.getMenuDetails(formatYYYYMMDD(dateObj), req.params.menuLine));
    res.json(data);
  } catch (err) {
    res.status(502).json({ ok: false, message: err.message });
  }
});

router.get('/debug/menuplan-links/:n/:e', async (req, res) => {
  try {
    const data = await withClient((client) => client.getMenuplanLinks(req.params.n, req.params.e));
    res.json(data);
  } catch (err) {
    res.status(502).json({ ok: false, message: err.message });
  }
});

module.exports = router;
