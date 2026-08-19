'use strict';

/**
 * Normalisiert einen Gerichtnamen für den Wiederholungs-Abgleich:
 * Kleinschreibung, Allergen-/Zusatzstoff-Codes in Klammern entfernt,
 * mehrfach-Whitespace zusammengefasst.
 */
function normalizeDishName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[.,;:!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = { normalizeDishName };
