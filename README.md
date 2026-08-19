# meinibis-essensplan

Holt die Bestellhistorie (Essen) deines Kindes von [meinibs.de](https://meinibs.de/) ab,
speichert sie lokal, und lässt dich jedes Essen mit 👍/👎 + Kommentar bewerten.
Erkennt automatisch, wenn ein Gericht sich wiederholt, und zeigt dir dann deine
letzte Bewertung dazu an.

## Wichtig: undokumentierte API

meinibs.de bietet keine offizielle/öffentliche API. Die hier genutzten Endpunkte
(`/auth`, `/order_placeholders/...`, `/prepaid/status`) wurden aus dem öffentlichen
Angular-Bundle der Bestell-App sowie per Browser-DevTools reverse-engineered.
Funktioniert grundsätzlich, aber:

- Die genauen JSON-Feldnamen für Gericht-Bezeichnung/Datum in den Bestell-Einträgen
  sind **Vermutungen** (siehe `src/extract.js`). Falls nach dem ersten Sync Gerichte
  fehlen oder falsch benannt sind: `npm run probe` ausführen (siehe unten).
- Läuft komplett mit deinen eigenen Zugangsdaten, für deinen eigenen Account -
  keine fremden Daten, kein Massen-Abruf.
- Falls meinibs.de die API ändert, kann der Sync kaputtgehen. Ist eine private
  Bastel-Lösung, kein offizielles Produkt.

## Setup

1. `.env.example` nach `.env` kopieren und ausfüllen (deine Kunden-Nr./Login +
   Passwort vom meinibs.de-Bestellportal). **`.env` niemals committen.**
2. Mit Docker starten:
   ```bash
   docker compose up -d --build
   ```
   Die App läuft dann auf http://localhost:3000 (Port über `HOST_PORT` in `.env`
   änderbar, falls 3000 schon belegt ist).
3. Im Tab "📊 Für Eltern" auf "Jetzt synchronisieren" klicken, um die erste
   Bestellhistorie zu holen. Dort lässt sich auch ein automatischer
   Wochen-Zeitplan (Wochentag + Uhrzeit, z.B. "Sonntag 18:00") einstellen -
   überschreibt den Standard aus `SYNC_CRON` in `.env` (alle 4 Stunden) dauerhaft
   in der DB, ganz ohne Neustart.

### Deploy über Portainer (Stack aus Git-Repository)

Portainer klont beim Git-basierten Stack nur den Repo-Inhalt - `.env` liegt dort
bewusst nicht (siehe `.gitignore`), daher scheitert `env_file: .env` mit "not
found". `docker-compose.yml` nutzt deshalb `environment:`-Referenzen auf
`${VARIABLE}`, die Portainer selbst auflöst:

1. In Portainer: **Stacks → Add stack → Repository**, dieses Repo als URL eintragen.
2. Im Abschnitt **"Environment variables"** die Werte aus `.env.example` einzeln
   eintragen (mindestens `MEINIBS_USER`, `MEINIBS_PASSWORD`; alle anderen haben
   sinnvolle Defaults in `docker-compose.yml`).
3. Deploy the stack.

### Ohne Docker (lokale Entwicklung)

```bash
npm install
cp .env.example .env   # ausfüllen
npm start
```

## Wenn Gerichte/Guthaben falsch oder leer angezeigt werden

Nach jedem Sync liegt die rohe API-Antwort bereits in der lokalen DB. Einfach im
Browser aufrufen (bzw. `curl http://localhost:3000/api/debug/...`):

- `http://localhost:3000/api/debug/meal/2026-08-24` - Rohdaten für ein Datum
- `http://localhost:3000/api/debug/budget` - Rohdaten der letzten Guthaben-Abfrage

Ein Beispiel-Auszug daraus (Namen ruhig schwärzen) zeigen, dann wird
`src/extract.js` entsprechend angepasst.

Alternativ `npm run probe` (bzw. `docker compose exec essensplan npm run probe`)
für einen frischen, unabhängigen Abruf nach `data/debug/*.json`.

## Wie die Wiederholungserkennung funktioniert

Jeder Gerichtname wird normalisiert (Kleinschreibung, Allergen-Codes wie
`(A,C,G)` entfernt) und in `dish_occurrences` gespeichert. Taucht ein normalisierter
Name erneut auf, zeigt die App einen Hinweis mit dem Datum und – falls vorhanden –
deiner damaligen Bewertung/deinem Kommentar an.

## Datenhaltung

SQLite-Datei unter `data/meinibis.db` (bzw. `./data` als Docker-Volume). Enthält
nur, was der Sync von meinibs.de abruft, plus deine eigenen Bewertungen/Kommentare.
Nichts wird an Dritte gesendet.
