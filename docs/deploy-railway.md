# Deploy auf Railway (Phase F)

Ergänzt `docs/umbau-railway.md` (Zielarchitektur, Abschnitt "Phasen") und `docs/db.md`.
Voraussetzung: `railway login` wurde vom Auftraggeber bereits ausgeführt (eigenes
Railway-Konto). Dieses Dokument ist die Schritt-für-Schritt-Anleitung für den
erstmaligen Aufbau: ein App-Service, ein Postgres-Plugin, ein Cron-Service, ein
Backup-Service.

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
railway variables --set "ADMIN_DAEHLER_PASSWORD=..."
railway variables --set "ADMIN_TRENDINGMEDIA_PASSWORD=..."
```

Hinweise:
- `DATABASE_URL` als Referenz auf das Plugin setzen (`${{Postgres.DATABASE_URL}}`), nicht als fester Wert, damit ein Wechsel des Plugins/Credentials automatisch durchgereicht wird.
- `PGSSLMODE=require` ist Pflicht: Railway-Postgres verlangt TLS, `lib/db/client.ts` liest diese Variable (siehe `docs/db.md`).
- `BETTER_AUTH_URL`/`NEXT_PUBLIC_APP_URL` erst final setzen, wenn die Domain aus Schritt 8 feststeht; für einen ersten Smoke-Test reicht vorübergehend die von Railway vergebene `*.up.railway.app`-URL.
- Build/Start: `railway.json` (Nixpacks, `startCommand: npm start`, Healthcheck `/api/health`) und `nixpacks.toml` (Node 24) liegen im Repo, keine weitere Konfiguration nötig.

## 4. Deploy auslösen

```bash
railway up
```

Railway baut über Nixpacks (`npm run build`) und startet `npm start`. Der Healthcheck
(`/api/health`, siehe `railway.json`) muss `{ ok: true, db: true }` liefern, sonst
markiert Railway den Deploy als fehlgeschlagen und startet neu
(`restartPolicyType: ON_FAILURE`).

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

## 6. Cron-Service (Follow-ups, Posten 6)

Einen zweiten Service im selben Projekt anlegen ("New Service" → "Empty Service" oder
aus demselben Repo), der App-Code wird wiederverwendet:

- Start-Befehl: `npm run cron:followups`
- Schedule (Railway "Cron Schedule" am Service): `0 5 * * *` (05:00 UTC = 07:00 Europe/Zurich)
- Variablen: mindestens `NEXT_PUBLIC_APP_URL` (Ziel-URL des App-Service) und `CRON_SECRET`
  (derselbe Wert wie beim App-Service, siehe Schritt 3) - `scripts/cron-followups.ts`
  ruft `$NEXT_PUBLIC_APP_URL/api/cron/follow-ups` mit `Authorization: Bearer $CRON_SECRET`
  auf und beendet sich mit Exit-Code ungleich 0 bei einem Fehler (siehe Skript-Kommentar),
  Railway markiert einen solchen Lauf entsprechend als fehlgeschlagen.
- Kein eigener `DATABASE_URL`-Zugriff nötig: der Cron-Service ruft nur die HTTP-Route
  des App-Service auf.

## 7. Backup-Service

Einen dritten Service anlegen, ebenfalls aus demselben Repo:

- Start-Befehl: `npm run backup` (`scripts/backup.sh`)
- Schedule: `0 3 * * *` (03:00 UTC)
- Volume anlegen und unter `/backups` mounten (Railway Dashboard: Service → "Volumes")
- Variablen: `DATABASE_URL` (`${{Postgres.DATABASE_URL}}`, wie beim App-Service),
  `PGSSLMODE=require`, `BACKUP_DIR=/backups`, optional `RETENTION_DAYS` (Standard 14,
  siehe `scripts/backup.sh`)
- `pg_dump` muss im Image verfügbar sein: Nixpacks installiert es nicht automatisch für
  einen reinen Node-Service. Falls `pg_dump: command not found` auftritt, im Service ein
  `nixpacks.toml` mit `nixPkgs = ["postgresql"]` ergänzen (nur für diesen Service, nicht
  für den App-Service nötig).

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
- Follow-up-Cron einmal manuell auslösen: `railway run --service <cron-service> npm run cron:followups`.
- Testanfrage danach im Admin löschen bzw. auf `abgeschlossen` setzen, keine
  Test-Mails an echte Kundenadressen offen lassen.

## Rollback

Railway behält frühere Deploys pro Service; im Dashboard unter "Deployments" lässt sich
ein vorheriger Deploy erneut aktivieren. Datenbank-Rollback: das letzte Backup aus dem
Backup-Service-Volume einspielen (`gunzip -c daehler-<datum>.sql.gz | psql "$DATABASE_URL"`),
vorher mit dem Auftraggeber abstimmen (Datenverlust seit dem Backup-Zeitpunkt).
