# Umbau auf Railway-only (Plan, Stand 16.09.2026)

Entscheid des Auftraggebers am 16.09.2026: kein Supabase (Projektkontingent der Organisation erschöpft, zweiter Anbieter unerwünscht). Die App läuft vollständig auf Railway: ein Next.js-Service, ein Railway-Postgres, ein Cron-Service. Login, Fotos und Import-Zwischenspeicher wandern in die App bzw. in Postgres. Flow, Admin-UI, Parser, Mails, Prüfregeln und Antwortentwurf bleiben unverändert; es ändert sich nur die Schicht darunter.

## Zielarchitektur

| Baustein | Vorher (Supabase) | Nachher (Railway-only) |
|---|---|---|
| Datenbank | Supabase Postgres, Zugriff über supabase-js/PostgREST, RLS | Railway Postgres, Zugriff über `postgres` (postgres.js) mit `DATABASE_URL`, nur serverseitig, keine RLS |
| Migrationen | `supabase/migrations`, `supabase db reset` | `db/migrations/*.sql` (konsolidiert, ohne RLS/Storage/Auth-Schema), eigener Runner `scripts/migrate.ts` mit Tabelle `schema_migrations` |
| Typen | generierte `database.types.ts` | handgepflegte Row-Typen in `lib/db/rows.ts` (bisheriger Inhalt von `lib/supabase/rows.ts`) |
| Admin-Login | Supabase Auth | `better-auth` (Open Source) mit E-Mail + Passwort, Sessions in Postgres, Rate-Limit, sichere Cookies; zwei Konten; `scripts/create-admin-users.ts` legt sie an |
| Fotos | Storage-Bucket `model-photos` | Tabelle `photos` (bytea, content_type, Grösse, sha1); Auslieferung über `GET /api/photos/[id]` mit ETag und `Cache-Control: public, max-age=31536000, immutable`; `photo_url` zeigt auf diese Route oder auf statische Startfotos unter `/img/models/` |
| Import-Zwischenspeicher | Storage-Bucket `imports` | Spalte `pricelist_imports.payload jsonb` (geparste Familien), wird beim Übernehmen/Verwerfen geleert |
| DB-Funktionen | `next_inquiry_number()`, `claim_follow_up()`, `schedule_follow_ups()`, `set_updated_at()` | unverändert übernommen, `generate_share_token()` entfällt (Token entsteht in der App) |
| Lokale Entwicklung | `supabase start` (Docker, 10 Container) | `docker compose up -d` mit einem `postgres:17`-Container (Port 5433), `npm run db:migrate`, `npm run db:seed`, `npm run import -- --apply`, `npm run db:admins` |
| Tests | gegen lokale Supabase | gegen den lokalen Postgres (`DATABASE_URL`), Aufräumen wie bisher |
| Hosting | Railway (App) + Supabase Cloud | Railway: Service `app` (Railpack, `npm run build`/`npm start`), Plugin `postgres`, Service `cron` (täglich 07:00 Europe/Zurich = 05:00 UTC, `npx tsx scripts/cron-followups.ts`), Service `backup` (täglich `pg_dump | gzip` auf ein Railway-Volume, 14 Tage) |
| Env | Supabase-Keys | `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `RESEND_API_KEY`, `RESEND_FROM_OVERRIDE`, `MAIL_TO_OVERRIDE`, `ANTHROPIC_API_KEY`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL` |

## Was sich im Code ändert (Inventar 16.09.2026)

- 63 Dateien referenzieren Supabase, davon rund 20 mit Datenzugriff (ca. 90 `.from()`-Aufrufe, 3 RPCs: `next_inquiry_number`, `claim_follow_up`, `schedule_follow_ups`), 2 mit Storage (`app/api/admin/models/photo/route.ts`, `lib/pricelist/imports.ts`), ca. 15 mit Auth (Middleware, `lib/admin/auth.ts`, Login, Admin-Routen, Actions), 18 Testdateien mit DB-Zugriff.
- Viele Dateien importieren nur Typen aus `lib/supabase/rows.ts`; die ziehen nach `lib/db/rows.ts` um (Suchen/Ersetzen).

## Datenzugriffsschicht (`lib/db/`)

- `client.ts`: `export const sql = postgres(process.env.DATABASE_URL, { max: 5, ssl: process.env.PGSSLMODE === 'require' ? 'require' : undefined, transform: postgres.camel? nein: Spaltennamen bleiben snake_case wie bisher })`, ein Pool je Prozess (globalThis-Guard für Next-Dev), `sql.end()` für Skripte.
- Query-Funktionen bleiben in den bisherigen Modulen (`lib/catalog/queries.ts`, `lib/pricelist/*`, `lib/inquiry/*`, `lib/followups/*`, `lib/admin/*`, `lib/mail/settings.ts`, `lib/mail/resend.ts`, `lib/ai/*`), nur die Implementierung wechselt von supabase-js auf parametrisierte SQL-Templates (`sql\`select ... where id = ${id}\``). Keine String-Konkatenation von Werten. Transaktionen mit `sql.begin()` für Import-Übernahme (je Familie) und Anfrage-Anlage.
- Eingebettete Selects (`products!inner(...)`) werden explizite JOINs; Batch-Upserts als `insert ... on conflict ... do update` mit `sql(rows)`.
- `rows.ts`: Row-Typen und Enums (Inhalt von `lib/supabase/rows.ts`, ohne Supabase-Generics). `lib/supabase/` wird gelöscht.

## Login (`lib/auth/`)

- `better-auth` mit Postgres (Kysely-Dialekt über `pg` oder direkt `postgres`-Adapter gemäss Doku), Plugin für E-Mail + Passwort, Sessions 7 Tage, `secure`/`httpOnly`-Cookies, Rate-Limit auf Sign-in, keine Registrierung von aussen (Sign-up deaktiviert; Konten nur per Skript).
- `app/api/auth/[...all]/route.ts` (better-auth Handler), `lib/auth/server.ts` (`auth`, `requireAdmin()` liest die Session aus den Request-Headern), `lib/auth/client.ts` (Login-Formular), `middleware.ts` prüft nur das Session-Cookie (Redirect auf `/admin/login`), Layouts und Routen prüfen die Session serverseitig.
- Tabellen von better-auth (`user`, `session`, `account`, `verification`) als eigene Migration `db/migrations/0002_auth.sql` (aus `npx @better-auth/cli generate` übernommen).
- `scripts/create-admin-users.ts`: legt die zwei Admin-Konten über die better-auth-API an (Passwörter aus `ADMIN_DAEHLER_PASSWORD`/`ADMIN_TRENDINGMEDIA_PASSWORD`, lokaler Fallback wie bisher).

## Fotos und Import-Zwischenspeicher

- Migration: `photos(id uuid pk, kind text check in ('family','model'), owner_id uuid, content_type text, bytes bytea, size int, sha1 text, created_at)`; `model_families.photo_url`/`models.photo_url` bleiben Text (`/api/photos/<id>` oder `/img/models/...`).
- `app/api/admin/models/photo/route.ts`: Upload (Magic-Bytes-Prüfung bleibt) → Insert in `photos`, altes Foto löschen, `photo_url` setzen, `revalidateTag('catalog')`. `app/api/photos/[id]/route.ts`: liefert bytes mit ETag (sha1), `304` bei `If-None-Match`.
- `pricelist_imports.payload jsonb` statt Bucket; `uploadParsedFamilies` schreibt in die Spalte, `applyPendingImport` liest sie und setzt sie nach Abschluss auf `null`.

## Phasen (je Workflow mit Sonnet-Implementierer, unabhängiger Prüfung, Gate)

**Phase E1, Datenzugriff (grösster Block).** `db/migrations/0001_init.sql` (konsolidiert aus den sechs Supabase-Migrationen: Tabellen, Checks, Indizes, Funktionen, Trigger, Seed-Daten in `db/seed.sql`; ohne RLS, Storage, Auth), `scripts/migrate.ts`, `docker-compose.yml`, `lib/db/{client,rows}.ts`, Umstellung aller Datenzugriffe und Skripte, Tests auf `DATABASE_URL`. Auth in dieser Phase über einen klar markierten Übergangs-Guard (`lib/admin/auth.ts` liest eine Session-Prüfung, die E2 ersetzt); Storage-Aufrufe in E1 bereits auf die Postgres-Variante umgestellt (Fotos, Payload), da sie an denselben Dateien hängen. Gate: alle Tests, Build, E2E, Import der 42 Listen gegen den Docker-Postgres.

**Phase E2, Login.** better-auth einbauen, Middleware, `requireAdmin`, Login-Seite, Admin-User-Skript, Tests (ohne Session → 401/Redirect, Login → Session, Rate-Limit). Gate.

**Phase E3, Aufräumen und Deploy-Vorbereitung.** `@supabase/*` und `supabase`-CLI aus `package.json`, Ordner `supabase/` entfernen (Historie bleibt in Git), `.env.example`, README, `docs/db.md`, `docs/architektur.md` (Stack), CLAUDE.md-Hinweis (Architektur-Abschnitt: Entscheid 16.09.2026), `railway.json`/Railpack-Konfiguration, Cron- und Backup-Skripte, Healthcheck `/api/health` prüft die DB. Gate.

**Phase F, Railway.** Voraussetzung: `railway login` durch den Auftraggeber. Projekt und Services anlegen, Postgres-Plugin, Variablen setzen, erstes Deploy, Migrationen und Import ausführen, Admin-Konten anlegen, Cron/Backup einrichten, Smoke-Test auf der Railway-URL. Danach Staging-Adresse an den Auftraggeber.

## Risiken und Entscheide

- Fotos in Postgres: für den erwarteten Umfang (unter 100 Bilder) unproblematisch; bei starkem Wachstum Wechsel auf Railway-Volume oder S3-kompatiblen Speicher, die Upload-/Auslieferungsroute bleibt gleich.
- Kein PostgREST mehr: alle Zugriffe laufen serverseitig durch die App; die öffentlichen Katalog-Routen bleiben, der Browser spricht nie direkt mit der DB.
- Keine Datenmigration nötig: es gibt noch keine produktiven Daten; lokale Testdaten werden neu importiert (Excel) bzw. neu angelegt.
- better-auth ist eine zusätzliche Abhängigkeit; Alternative wäre ein handgeschriebener Login (Argon2, Session-Tabelle). Entscheid: Bibliothek, weil sie Rate-Limit, CSRF-Schutz und Cookie-Handling mitbringt.
