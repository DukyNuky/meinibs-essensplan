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

## Android-App (APK) für's Handy

Unter `android/` liegt eine schlanke Android-Hülle: ein WebView, der den selbst
gehosteten Server anzeigt. Die ganze Logik (Sync, Datenbank, Bewertungen) bleibt
im Docker-Container – Handy und Browser sehen also dieselben Daten, und
Änderungen an der Weboberfläche landen ohne neues APK auf dem Handy.

Die App bringt mit:

- **Server-Adresse beim ersten Start** einstellbar (wird per `/api/health`
  gegengeprüft), später über das ⋮-Menü oben rechts änderbar.
- **Wischen zum Neuladen** und eine verständliche Fehlerseite, wenn der Server
  mal nicht erreichbar ist.
- **Selbst-Update**: Die App fragt beim Start (und auf Wunsch über das Menü) das
  neueste GitHub-Release dieses Repos ab, lädt das APK herunter und startet die
  Installation.
- Externe Links (z.B. "Guthaben aufladen") öffnen im richtigen Browser.

Mindestens Android 8.0 (API 26).

### Release bauen (GitHub Actions)

Der Workflow [`.github/workflows/android.yml`](.github/workflows/android.yml)
baut das APK und hängt es an ein GitHub-Release:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Ein Lauf über **Actions → Android APK → Run workflow** baut ohne Release ein
Test-APK als Artifact.

### Signierschlüssel

Damit ein Update sich über die installierte App legen darf, muss jedes APK mit
**demselben** Schlüssel signiert sein – sonst lehnt Android die Installation ab
("App nicht installiert"). Der Schlüssel liegt als PKCS12-Datei vor
(`android/essensplan.p12`, per `.gitignore` ausgeschlossen) und gehört als
Base64 in die Repository-Secrets:

| Secret | Inhalt |
| --- | --- |
| `KEYSTORE_B64` | `base64 -w0 android/essensplan.p12` |
| `KEYSTORE_PASSWORD` | Passwort des Keystores |
| `KEY_PASSWORD` | dasselbe Passwort |
| `KEY_ALIAS` | `essensplan` |

Ohne diese Secrets baut der Workflow trotzdem, signiert dann aber mit dem
Debug-Schlüssel und warnt – solche APKs taugen nur zum Ausprobieren, nicht für
die Update-Kette. **Die `.p12`-Datei und das Passwort sichern**: geht der
Schlüssel verloren, muss die App auf dem Handy einmal deinstalliert und neu
installiert werden.

### Lokal bauen

Braucht JDK 17 und das Android SDK (Platform 35, Build-Tools 35):

```bash
cd android
KEYSTORE_FILE=$PWD/essensplan.p12 \
KEYSTORE_PASSWORD=$(cat keystore-password.txt) \
KEY_ALIAS=essensplan \
./gradlew :app:assembleRelease -PappVersionName=1.0.0 -PappVersionCode=10000
```

Ergebnis: `android/app/build/outputs/apk/release/app-release.apk`.

### Aufs Handy bringen

APK aus dem Release herunterladen und öffnen; beim ersten Mal fragt Android nach
der Erlaubnis "Unbekannte Apps installieren". Danach in der App die
Server-Adresse eintragen (z.B. `http://192.168.1.20:3000` im Heimnetz oder die
HTTPS-Adresse hinter deinem Reverse Proxy).
