'use strict';

const daysEl = document.getElementById('days');
const template = document.getElementById('dayCardTemplate');
const lastSyncEl = document.getElementById('lastSync');
const weekRangeEl = document.getElementById('weekRange');
const prevWeekBtn = document.getElementById('prevWeek');
const nextWeekBtn = document.getElementById('nextWeek');
const todayBtn = document.getElementById('todayBtn');

const WEEKDAYS = [
  { key: 'mon', name: 'Montag', emoji: '🌟' },
  { key: 'tue', name: 'Dienstag', emoji: '🌈' },
  { key: 'wed', name: 'Mittwoch', emoji: '🌻' },
  { key: 'thu', name: 'Donnerstag', emoji: '🚀' },
  { key: 'fri', name: 'Freitag', emoji: '🎉' },
];

function todayLocal() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=So..6=Sa
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatShort(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.`;
}

function makeChooseLink(label) {
  const link = document.createElement('a');
  link.href = 'https://meinibs.de/';
  link.target = '_blank';
  link.rel = 'noopener';
  link.className = 'choose-link';
  link.textContent = label;
  return link;
}

const RATING_ICONS = { good: '👍', neutral: '😐', bad: '👎' };

// Kurzinfo zu früheren Vorkommen eines Gerichts: bevorzugt das letzte bewertete
// Vorkommen, sonst einfach das letzte.
function describePrior(priorDates) {
  if (!priorDates || !priorDates.length) return null;
  const rated = priorDates.find((p) => p.rating);
  const dateText = (p) => formatShort(new Date(p.date + 'T00:00:00'));
  if (!rated) return `🔁 gab's schon am ${dateText(priorDates[0])} (nicht bewertet)`;
  const commentText = rated.comment ? ` „${rated.comment}"` : '';
  return `${RATING_ICONS[rated.rating]} am ${dateText(rated)}${commentText}`;
}

function isoWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

let currentMonday = getMonday(todayLocal());

function renderWeekLabel() {
  const friday = addDays(currentMonday, 4);
  weekRangeEl.textContent = `KW ${isoWeekNumber(currentMonday)} · ${formatShort(currentMonday)}–${formatShort(friday)}${friday.getFullYear()}`;
}

async function loadWeek() {
  renderWeekLabel();
  const from = toISO(currentMonday);
  const to = toISO(addDays(currentMonday, 4));
  const res = await fetch(`/api/meals?from=${from}&to=${to}`);
  const meals = await res.json();
  const byDate = new Map(meals.map((m) => [m.date, m]));
  renderWeek(byDate);
}

function renderWeek(byDate) {
  daysEl.innerHTML = '';
  const today = toISO(todayLocal());
  WEEKDAYS.forEach((wd, i) => {
    const date = addDays(currentMonday, i);
    const iso = toISO(date);
    const meal = byDate.get(iso) || {
      date: iso,
      dishNames: [],
      alternatives: [],
      canChangeOrder: false,
      rating: null,
      comment: null,
      repeats: [],
    };
    daysEl.appendChild(renderDayCard(wd, iso, meal, iso === today));
  });
}

function renderDayCard(weekday, iso, meal, isToday) {
  const node = template.content.cloneNode(true);
  const card = node.querySelector('.day-card');
  card.style.setProperty('--day-color', `var(--${weekday.key})`);
  if (isToday) card.classList.add('is-today');

  node.querySelector('.weekday-emoji').textContent = weekday.emoji;
  node.querySelector('.weekday-name').textContent = weekday.name;
  node.querySelector('.day-date').textContent = formatShort(new Date(iso + 'T00:00:00'));

  const dishEl = node.querySelector('.dish-names');
  const hasMeal = meal.dishNames && meal.dishNames.length;
  const isFuture = iso > toISO(todayLocal());
  if (hasMeal) {
    dishEl.textContent = meal.dishNames.join(' · ');
  } else {
    card.classList.add('is-empty');
    if (isFuture) card.classList.add('is-future');
    dishEl.textContent = meal.canChangeOrder ? 'noch nichts ausgewählt' : 'kein Essen bestellt';
    dishEl.classList.add('no-meal');
  }
  const badgeContainer = node.querySelector('.repeat-badges');
  for (const repeat of meal.repeats || []) {
    const last = repeat.priorDates[0];
    if (!last) continue;
    const badge = document.createElement('div');
    badge.className = 'repeat-badge';
    const ratingIcon = RATING_ICONS[last.rating] || '';
    const commentText = last.comment ? ` „${last.comment}"` : '';
    badge.textContent = `🔁 gab's schon am ${formatShort(new Date(last.date + 'T00:00:00'))} ${ratingIcon}${commentText}`;
    badgeContainer.appendChild(badge);
  }

  // "Essen ändern/auswählen"-Link steckt im eingeklappten Alternative-Bereich
  // statt prominent neben dem Gerichtnamen zu stehen.
  const alternatives = meal.alternatives || [];
  const altSection = node.querySelector('.alt-section');
  const altToggle = node.querySelector('.alt-toggle');
  const altList = node.querySelector('.alt-list');
  if (alternatives.length || meal.canChangeOrder) {
    const altRepeats = new Map((meal.alternativeRepeats || []).map((r) => [r.dish, r.priorDates]));
    const altRatingIcons = [];
    for (const alt of alternatives) {
      const li = document.createElement('li');
      const nameEl = document.createElement('div');
      nameEl.textContent = alt;
      li.appendChild(nameEl);
      const priorDates = altRepeats.get(alt);
      const info = describePrior(priorDates);
      if (info) {
        const infoEl = document.createElement('div');
        infoEl.className = 'alt-rating';
        infoEl.textContent = info;
        li.appendChild(infoEl);
        const rated = priorDates.find((p) => p.rating);
        if (rated) altRatingIcons.push(RATING_ICONS[rated.rating]);
      }
      altList.appendChild(li);
    }
    // Bewertungen schon am eingeklappten Toggle andeuten, damit man sie nicht übersieht.
    if (altRatingIcons.length) altToggle.textContent += ` · ${altRatingIcons.join(' ')}`;
    if (meal.canChangeOrder) {
      const linkLi = document.createElement('li');
      linkLi.className = 'alt-link-item';
      linkLi.appendChild(makeChooseLink(hasMeal ? '🔀 Essen ändern ↗' : '🍽️ Essen auswählen ↗'));
      altList.appendChild(linkLi);
    }
    if (alternatives.length) {
      altToggle.addEventListener('click', () => altList.classList.toggle('open'));
    } else {
      // Keine Alternative bekannt, aber noch änderbar - Toggle weglassen, Link direkt zeigen.
      altToggle.remove();
      altList.classList.add('open');
    }
  } else {
    altSection.remove();
  }

  const goodBtn = node.querySelector('.thumb-good');
  const neutralBtn = node.querySelector('.thumb-neutral');
  const badBtn = node.querySelector('.thumb-bad');
  const commentInput = node.querySelector('.comment');
  const saveBtn = node.querySelector('.save-comment');

  if (!hasMeal || isFuture) {
    goodBtn.style.display = neutralBtn.style.display = badBtn.style.display = commentInput.style.display = saveBtn.style.display = 'none';
    if (hasMeal && isFuture) {
      const note = document.createElement('div');
      note.className = 'muted future-note';
      note.textContent = '🔮 kommt noch – bewerten sobald es serviert wurde';
      node.querySelector('.rating-row').appendChild(note);
    }
    return card;
  }

  const thumbBtns = [goodBtn, neutralBtn, badBtn];
  if (meal.rating) {
    const activeBtn = { good: goodBtn, neutral: neutralBtn, bad: badBtn }[meal.rating];
    activeBtn?.classList.add('active');
  }
  commentInput.value = meal.comment || '';

  const saveStatus = node.querySelector('.save-status');
  let statusTimer;
  function showStatus(text, kind) {
    clearTimeout(statusTimer);
    saveStatus.textContent = text;
    saveStatus.className = `save-status ${kind || ''}`;
    if (kind === 'ok') {
      statusTimer = setTimeout(() => {
        saveStatus.textContent = '';
        saveStatus.className = 'save-status';
      }, 2500);
    }
  }

  async function saveRating(rating) {
    const controls = [...thumbBtns, saveBtn];
    controls.forEach((el) => (el.disabled = true));
    showStatus('💾 Speichere…');
    try {
      const res = await fetch(`/api/meals/${meal.date}/rating`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, comment: commentInput.value }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || `HTTP ${res.status}`);
      }
      thumbBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.rating === rating));
      showStatus(`✅ Gespeichert ${RATING_ICONS[rating]}`, 'ok');
    } catch (err) {
      showStatus(`⚠️ Nicht gespeichert: ${err.message}`, 'error');
    } finally {
      controls.forEach((el) => (el.disabled = false));
    }
  }

  thumbBtns.forEach((btn) => btn.addEventListener('click', () => saveRating(btn.dataset.rating)));
  saveBtn.addEventListener('click', () => {
    const activeBtn = thumbBtns.find((btn) => btn.classList.contains('active'));
    if (!activeBtn) {
      alert('Bitte zuerst 👍, 😐 oder 👎 auswählen.');
      return;
    }
    saveRating(activeBtn.dataset.rating);
  });

  return card;
}

prevWeekBtn.addEventListener('click', () => {
  currentMonday = addDays(currentMonday, -7);
  loadWeek();
});
nextWeekBtn.addEventListener('click', () => {
  currentMonday = addDays(currentMonday, 7);
  loadWeek();
});
todayBtn.addEventListener('click', () => {
  currentMonday = getMonday(todayLocal());
  loadWeek();
});

// --- Tabs ---
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    if (btn.dataset.tab === 'stats') loadStats();
  });
});

// --- Statistik ---
function formatMoney(n) {
  if (typeof n !== 'number') return '–';
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

async function loadStats() {
  const [budgetRes, statsRes, lastSyncRes, scheduleRes] = await Promise.all([
    fetch('/api/budget').then((r) => r.json()),
    fetch('/api/stats').then((r) => r.json()),
    fetch('/api/sync/last').then((r) => r.json()),
    fetch('/api/settings/sync-schedule').then((r) => r.json()),
  ]);

  document.getElementById('budgetValue').textContent = formatMoney(budgetRes?.balance);
  document.getElementById('budgetUpdated').textContent = budgetRes?.fetched_at
    ? `Stand: ${new Date(budgetRes.fetched_at).toLocaleString('de-DE')}`
    : 'noch kein Guthaben-Sync';

  const s = statsRes;
  document.getElementById('statsSummary').innerHTML = `
    <div class="stat-pill"><span class="num">${s.totalDays}</span><span class="lbl">Essen erfasst</span></div>
    <div class="stat-pill"><span class="num">👍 ${s.good}</span><span class="lbl">gut fanden</span></div>
    <div class="stat-pill"><span class="num">😐 ${s.neutral}</span><span class="lbl">mittel fanden</span></div>
    <div class="stat-pill"><span class="num">👎 ${s.bad}</span><span class="lbl">nicht so gut</span></div>
    <div class="stat-pill"><span class="num">${s.unrated}</span><span class="lbl">unbewertet</span></div>
  `;

  renderDishList('mostRepeated', s.mostRepeated, (d) => `${d.occurrences}×`);
  renderDishList('mostLoved', s.mostLoved, (d) => `👍 ${d.good} · 👎 ${d.bad}`);
  renderDishList('mostDisliked', s.mostDisliked, (d) => `👍 ${d.good} · 👎 ${d.bad}`);

  renderLastSync(lastSyncRes);

  if (scheduleRes.custom) {
    document.getElementById('scheduleWeekday').value = String(scheduleRes.weekday);
    document.getElementById('scheduleTime').value =
      `${String(scheduleRes.hour).padStart(2, '0')}:${String(scheduleRes.minute).padStart(2, '0')}`;
    document.getElementById('scheduleStatus').textContent = 'Zeitplan aktiv.';
  } else {
    document.getElementById('scheduleStatus').textContent =
      `Noch kein eigener Zeitplan gesetzt (Standard: ${scheduleRes.cronExpr}).`;
  }
}

function renderDishList(elId, items, countFn) {
  const el = document.getElementById(elId);
  el.innerHTML = '';
  if (!items || !items.length) {
    el.innerHTML = '<li><span class="muted">Noch nicht genug Daten</span></li>';
    return;
  }
  for (const item of items) {
    const li = document.createElement('li');
    li.innerHTML = `<span>${item.name}</span><span class="dish-count">${countFn(item)}</span>`;
    el.appendChild(li);
  }
}

function renderLastSync(last) {
  if (!last) {
    lastSyncEl.textContent = 'noch nie synchronisiert';
    return;
  }
  const when = new Date(last.finished_at || last.started_at).toLocaleString('de-DE');
  lastSyncEl.textContent = last.ok ? `letzter Sync: ${when}` : `letzter Sync fehlgeschlagen (${when})`;
}

// --- Sync ---
const syncBtn = document.getElementById('syncBtn');
syncBtn.addEventListener('click', async () => {
  syncBtn.disabled = true;
  syncBtn.classList.add('spinning');
  syncBtn.textContent = '🔄 Synchronisiere...';
  try {
    const res = await fetch('/api/sync', { method: 'POST' });
    const result = await res.json();
    if (!result.ok) alert('Sync-Fehler: ' + result.message);
  } catch (err) {
    alert('Sync-Fehler: ' + err.message);
  } finally {
    syncBtn.disabled = false;
    syncBtn.classList.remove('spinning');
    syncBtn.textContent = '🔄 Jetzt synchronisieren';
    await loadWeek();
    await loadStats();
  }
});

// --- Sync-Zeitplan ---
document.getElementById('scheduleSaveBtn').addEventListener('click', async () => {
  const weekday = Number(document.getElementById('scheduleWeekday').value);
  const [hour, minute] = document.getElementById('scheduleTime').value.split(':').map(Number);
  const statusEl = document.getElementById('scheduleStatus');
  try {
    const res = await fetch('/api/settings/sync-schedule', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weekday, hour, minute }),
    });
    const result = await res.json();
    statusEl.textContent = result.ok ? 'Zeitplan gespeichert.' : 'Fehler: ' + result.message;
  } catch (err) {
    statusEl.textContent = 'Fehler: ' + err.message;
  }
});

loadWeek();
fetch('/api/sync/last').then((r) => r.json()).then(renderLastSync);
