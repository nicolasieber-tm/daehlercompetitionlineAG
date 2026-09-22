# Deploy auf Railway (Phase F)

Ergänzt `docs/umbau-railway.md` (Zielarchitektur, Abschnitt "Phasen") und `docs/db.md`.
Voraussetzung: `railway login` wurde vom Auftraggeber bereits ausgeführt (eigenes
Railway-Konto, Plan Pro). Dieses Dokument ist die Schritt-für-Schritt-Anleitung für den
erstmaligen Aufbau: ein App-Service, ein Postgres-Plugin, Volume-Backups im Dashboard.
Kein eigener Cron-Service und kein eigener Backup-Service (siehe
`docs/umbau-railway.md`, Ergänzung 16.09.2026): Follow-ups (Posten 6) löst die
App-Instanz selbst über einen internen Timer aus (`lib/followups/scheduler.ts`),
Backups übernimmt Railway Pro.

## 0. Voraussetzungen

- Railway-CLI installiert (`npm i -g @railway/cli` oder `brew install railway`), eingeloggt (`railway login`).
- Domain `daehler.com` beim Hoster des Kunden verwaltbar (für den CNAME am Schluss).
- Resend-Domain `daehler.com` verifiziert (SPF/DKIM), sonst laufen Mails weiter über `RESEND_FROM_OVERRIDE`.
- Werte griffbereit: `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, gewünschte Admin-Passwörter.

## 1. Projekt anlegen und verknüpfen

```bash
railway init                 # neues Railway-Projekt, oder:
railway link                 # ein bestehendes Projekt verknüpfen
```

## 2. Postgres-Plugin hinzufügen

```bash
railway add --plugin postgres
```

Railway legt eine Postgres-Instanz an und stellt `DATABASE_URL` als Service-Variable
bereit (`${{Postgres.DATABASE_URL}}`, im Dashboard unter dem Postgres-Plugin sichtbar).

## 3. App-Service anlegen und Variablen setzen

Einen Service aus diesem Repo erstellen (Dashboard: "New Service" → "GitHub Repo",
oder `railway up` aus dem Projektverzeichnis für den ersten Deploy). Danach die
Variablen setzen (Dashboard "Variables" oder CLI, hier exemplarisch mit der CLI, je
Aufruf für den App-Service):

```bash
railway variables --set "DATABASE_URL=\${{Postgres.DATABASE_URL}}"
railway variables --set "PGSSLMODE=require"
railway variables --set "BETTER_AUTH_SECRET=$(openssl rand -hex 32)"
railway variables --set "BETTER_AUTH_URL=https://anfrage.daehler.com"
railway variables --set "NEXT_PUBLIC_APP_URL=https://anfrage.daehler.com"
railway variables --set "RESEND_API_KEY=re_..."
railway variables --set "RESEND_FROM_OVERRIDE="           # leer, sobald daehler.com bei Resend verifiziert ist
railway variables --set "MAIL_TO_OVERRIDE="                # leer in Produktion, alle Mails gehen an echte Empfänger
railway variables --set "ANTHROPIC_API_KEY=sk-ant-..."
railway variables --set "CRON_SECRET=$(openssl rand -hex 32)"
railway variables --set "FOLLOWUP_SCHEDULER=1"
railway variables --set "ADMIN_DAEHLER_PASSWORD=..."
railway variables --set "ADMIN_TRENDINGMEDIA_PASSWORD=..."
```

`FOLLOWUP_SCHEDULER=1` ist auf Railway eigentlich nicht nötig (der Scheduler ist bei
`NODE_ENV=production`, was Railway automatisch setzt, ohnehin aktiv, siehe
`lib/followups/scheduler.ts`), macht die Absicht in den Dashboard-Variablen aber
sichtbar und schützt vor einem versehentlichen `FOLLOWUP_SCHEDULER=0`.

Hinweise:
- `DATABASE_URL` als Referenz auf das Plugin setzen (`${{Postgres.DATABASE_URL}}`), nicht als fester Wert, damit ein Wechsel des Plugins/Credentials automatisch durchgereicht wird.
- `PGSSLMODE=require` ist Pflicht: Railway-Postgres verlangt TLS, `lib/db/client.ts` liest diese Variable (siehe `docs/db.md`).
- `BETTER_AUTH_URL`/`NEXT_PUBLIC_APP_URL` erst final setzen, wenn die Domain aus Schritt 8 feststeht; für einen ersten Smoke-Test reicht vorübergehend die von Railway vergebene `*.up.railway.app`-URL.
- Build/Start: `.railway/railway.ts` (Infrastructure as Code, seit 22.09.2026 statt `railway.json`, das Railway ab 01.12.2026 nicht mehr liest): Railpack, `startCommand: bash scripts/start.sh` (Migration, Seed, Admin-Konten, optional Import bei IMPORT_ON_START=1, dann next start), Healthcheck `/api/health` mit 600 s. Die Neustart-Regel steht nicht in der Datei: Railway-Standard ist «On Failure» mit maximal 10 Versuchen, genau der frühere Wert; über IaC gesetzt las Railway den Wert nach dem Apply als null zurück und der Plan blieb dauerhaft «1 to change». Dazu `nixpacks.toml` (Node 24). Die Datei beschreibt das ganze Projekt (App-Service, Postgres, Volume, PITR-Bucket, Variablen als `preserve()` ohne Werte). Railway liest sie **nicht** beim Deploy; Änderungen daran werden mit `railway config plan` geprüft und mit `railway config apply` übernommen (braucht `npm install`, das SDK `railway` ist devDependency). Neue Variablen im Dashboard anlegen **und** hier mit `preserve()` nachtragen, sonst will `apply` sie löschen (der Plan zeigt das als destruktive Änderung, `apply` verlangt dafür `--confirm-destructive`).

## 4. Deploy auslösen

```bash
railway up
```

Railway baut über Railpack (`npm run build`) und startet `bash scripts/start.sh`. Der Healthcheck
(`/api/health`, siehe `.railway/railway.ts`) muss `{ ok: true, db: true }` liefern, sonst
markiert Railway den Deploy als fehlgeschlagen und startet neu
(Railway-Standard «On Failure», maximal 10 Versuche).

## 5. Einmalige Einrichtung (Migrationen, Import, Admin-Konten)

Nach dem ersten erfolgreichen Deploy, gegen den App-Service ausgeführt:

```bash
railway run npm run db:migrate -- --seed
railway run npm run import -- --apply
railway run npm run db:admins
```

- `db:migrate -- --seed` legt das Schema an (`db/migrations/*.sql`) und spielt die
  Startdaten (`db/seed.sql`) ein.
- `import -- --apply` importiert die 42 Preislisten aus `docs/preislisten` (Erstbefüllung,
  siehe `docs/excel-import.md`).
- `db:admins` legt die zwei festen Admin-Konten an (`ADMIN_DAEHLER_PASSWORD`/
  `ADMIN_TRENDINGMEDIA_PASSWORD` müssen vorher gesetzt sein, siehe Schritt 3 -
  ohne produktiv gesetzte Variable bricht das Skript bewusst ab, siehe
  `scripts/create-admin-users.ts`).

`railway run <cmd>` führt den Befehl mit den Variablen des verknüpften Service aus,
ohne einen dauerhaften zweiten Service zu starten.

## 6. Follow-ups (kein separater Cron-Service)

Nichts einzurichten: `lib/followups/scheduler.ts` startet beim Hochfahren des
App-Service automatisch einen internen Timer (`instrumentation.ts`, `register()`),
der alle 60 Minuten prüft, ob Follow-ups fällig sind (erster Lauf 5 Minuten nach dem
Start). Aktiv ist er, sobald `NODE_ENV=production` gesetzt ist (Railway setzt das
automatisch) und `FOLLOWUP_SCHEDULER` nicht auf `0` steht. Mehrere Instanzen oder ein
Neustart mitten im Lauf sind unkritisch: der Scheduler sperrt jeden Lauf über einen
Postgres-Advisory-Lock, eine zweite Instanz überspringt den Lauf statt doppelt zu
senden.

**Sendefenster 07:00-18:00 Europe/Zurich.** Ein einzelner Tick versendet nur
innerhalb dieses Fensters (`isWithinSendWindow()` in `lib/followups/scheduler.ts`);
ausserhalb davon protokolliert der Tick nur "ausserhalb des Sendefensters,
Lauf übersprungen" und fasst den Advisory-Lock erst gar nicht an. Ohne dieses
Fenster hätte der reine 60-Minuten-Timer automatische Mails an Kunden zu
beliebiger Uhrzeit verschickt, u.a. nachts kurz nach Mitternacht oder 5 Minuten
nach einem Deploy - der frühere separate Cron-Service lief bewusst nur einmal
täglich um `0 5 * * *` (07:00 Europe/Zurich). Ein fälliges Follow-up geht dadurch
nicht verloren, sondern wird beim nächsten Tick innerhalb des Fensters gesendet.

`app/api/cron/follow-ups/route.ts` bleibt als manueller Auslöser bestehen (Admin
"Fällige jetzt senden", oder lokal `npm run cron:followups` gegen einen laufenden
Server) und verwendet denselben Lock: läuft der automatische Scheduler gerade,
liefert die Route `{ "ok": true, "skipped": "locked" }` statt doppelt zu senden.
`CRON_SECRET` bleibt deshalb weiterhin als Variable gesetzt (Schritt 3), auch ohne
externen Cron-Dienst.

## 7. Backups (Railway Pro Volume-Backups)

Kein eigener Backup-Service. Railway Pro sichert das Volume der Postgres-Instanz
selbst:

1. Im Dashboard das Postgres-Plugin öffnen → Tab "Backups".
2. Automatische Backups aktivieren (Railway Pro: tägliche Backups, konfigurierbare
   Aufbewahrung; Details je nach aktuellem Railway-Angebot im Dashboard prüfen).
3. Nach der Ersteinrichtung einmal einen manuellen Backup-Lauf im Dashboard auslösen
   und danach eine Wiederherstellung in eine Testumgebung prüfen (Railway unterstützt
   "Restore" aus einem Backup heraus) - ein ungetestetes Backup ist kein Backup.

`scripts/backup.sh` (`pg_dump | gzip` nach `$BACKUP_DIR`) bleibt im Repo als manuelles
Werkzeug für einen Ad-hoc-Dump (z. B. vor einer riskanten Migration), läuft aber nicht
mehr als eigener, dauerhaft geplanter Service:

```bash
DATABASE_URL="$(railway variables get DATABASE_URL)" PGSSLMODE=require BACKUP_DIR=./tmp-backup npm run backup
```

## 8. Custom Domain

Im App-Service unter "Settings" → "Domains" `anfrage.daehler.com` als Custom Domain
hinzufügen. Railway zeigt einen CNAME-Zielwert an; diesen beim Domain-Hoster des Kunden
als `CNAME anfrage → <von Railway angezeigter Zielwert>` eintragen. Nach Aktivierung
`BETTER_AUTH_URL` und `NEXT_PUBLIC_APP_URL` im App-Service (Schritt 3) sowie
`NEXT_PUBLIC_APP_URL` im Cron-Service (Schritt 6) auf `https://anfrage.daehler.com`
setzen und neu deployen.

## 9. Smoke-Test

- `curl https://anfrage.daehler.com/api/health` → `{"ok":true,"db":true}`
- Kundenflow einmal komplett durchklicken (eigenes Testfahrzeug, Testmail-Adresse),
  prüfen: Bestätigungsmail beim Kunden, Anfrage-Mail (BCC) bei `info@daehler.com`,
  Anfrage erscheint unter `/admin`.
- Admin-Login mit beiden Konten (dÄHLer, Trending Media) prüfen, danach Abmelden
  (Session-Cookie muss tatsächlich gelöscht werden, siehe `app/admin/actions/auth.ts`).
- Preislisten-Upload mit einer echten Datei aus `docs/preislisten` testen (Diff-Anzeige,
  Übernehmen).
- Follow-up-Versand einmal manuell auslösen und dabei den Scheduler-Log im Railway-Dashboard
  prüfen ("Deployments" → aktueller Deploy → "Logs", Zeile `followUpScheduler: gestartet ...`
  kurz nach dem Start, danach stündlich entweder `followUpScheduler: Lauf abgeschlossen ...`
  (07:00-18:00 Europe/Zurich) oder `followUpScheduler: ausserhalb des Sendefensters ...,
  Lauf übersprungen` (ausserhalb davon - kein Fehler, siehe Abschnitt 6):
  `railway run npm run cron:followups` (ruft `/api/cron/follow-ups` mit `CRON_SECRET` auf,
  liefert `{"ok":true,"skipped":"locked"}`, falls der interne Scheduler gerade selbst läuft -
  in dem Fall kurz warten und erneut versuchen; die manuelle Route hat KEIN Sendefenster
  und funktioniert deshalb auch nachts für diesen Smoke-Test).
- Testanfrage danach im Admin löschen bzw. auf `abgeschlossen` setzen, keine
  Test-Mails an echte Kundenadressen offen lassen.

## Rollback

Railway behält frühere Deploys pro Service; im Dashboard unter "Deployments" lässt sich
ein vorheriger Deploy erneut aktivieren. Datenbank-Rollback: im Postgres-Plugin unter
"Backups" das gewünschte Railway-Pro-Backup wiederherstellen (Dashboard, "Restore"),
vorher mit dem Auftraggeber abstimmen (Datenverlust seit dem Backup-Zeitpunkt). Für einen
Dump aus einem eigenen `scripts/backup.sh`-Lauf: `gunzip -c daehler-<datum>.sql.gz | psql "$DATABASE_URL"`.
