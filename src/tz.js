'use strict';

// meinibs.de ist eine deutsche Schulverpflegung - "heute"/Zeitstempel beziehen
// sich auf Europe/Berlin, nicht auf die Zeitzone des Servers (Docker-Container
// laufen standardmäßig in UTC).
const SCHOOL_TIMEZONE = 'Europe/Berlin';

function formatDateInSchoolTimezone(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SCHOOL_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function todayInSchoolTimezone() {
  return formatDateInSchoolTimezone(new Date());
}

module.exports = { SCHOOL_TIMEZONE, formatDateInSchoolTimezone, todayInSchoolTimezone };
