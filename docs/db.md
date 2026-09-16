# Datenbank

Ergänzt `docs/architektur.md` (Abschnitt "Datenmodell") und `docs/umbau-railway.md`
(Zielarchitektur, Datenzugriffsschicht, Phasenplan). Schema in
`db/migrations/0001_init.sql`, Startdaten in `db/seed.sql`, Migrationsrunner in
`scripts/migrate.ts`.

Seit dem Entscheid vom 16.09.2026 (`docs/umbau-railway.md`) läuft die App auf einem
gewöhnlichen Postgres (lokal: Docker, produktiv: Railway-Plugin) statt auf Supabase.
Kein PostgREST, kein RLS, kein Supabase Auth, kein Storage-Bucket: jeder Zugriff läuft
serverseitig über `lib/db/client.ts` (`postgres`-Paket, siehe unten). Der Ordner
`supabase/` (Migrationen, `seed.sql`) bleibt bis Phase E3 im Repo, wird aber nicht mehr
verwendet; sein Inhalt ist 1:1 die Grundlage von `db/migrations/0001_init.sql` /
`db/seed.sql`, nur ohne Supabase-Spezifika (siehe Abschnitt "Was sich gegenüber
Supabase geändert hat" unten).

## Lokal starten

Voraussetzung: Docker läuft.

```bash
npm run db:up               # docker compose up -d --wait: startet Postgres (Port 5433), wartet bis healthy
npm run db:migrate -- --seed  # oder: npm run db:seed (nur Seed, wenn Migrationen schon drin sind)
```

`docker-compose.yml` startet einen einzelnen Dienst `postgres` (Image `postgres:17-alpine`,
Datenbank `daehler`, User/Passwort `postgres`/`postgres`, Port `5433` nach aussen, Daten im
benannten Volume `daehler-pgdata`). `DATABASE_URL` in `.env`:

```
DATABASE_URL=postgres://postgres:postgres@localhost:5433/daehler
```

Weitere Befehle:

```bash
npm run db:down    # docker compose down (Container stoppen, Daten bleiben im Volume)
npm run db:reset   # docker compose down -v && db:up && db:migrate -- --seed: kompletter Neuaufbau
tsx scripts/migrate.ts --status  # zeigt, welche Migrationen bereits angewendet sind
```

`scripts/migrate.ts` legt bei Bedarf die Tabelle `schema_migrations(name text primary key,
applied_at timestamptz)` an, wendet jede noch nicht verzeichnete Datei aus
`db/migrations/*.sql` (Namensreihenfolge) in einer eigenen Transaktion an und trägt sie
danach ein. `--seed` spielt zusätzlich `db/seed.sql` ein (idempotent, kann beliebig oft
laufen). Lädt `.env` selbst (`process.loadEnvFile`), wie die anderen `tsx`-Skripte im
Projekt.

Admin-Login (better-auth) ist angebunden (siehe Abschnitt "Admin-Konten" unten):
`BETTER_AUTH_SECRET`/`BETTER_AUTH_URL` in `.env` bzw. `.env.example` sind dafür Pflicht,
`npm run db:admins` legt die zwei festen Konten an.

## Datenzugriff aus der App (`lib/db/`)

- `lib/db/client.ts` exportiert `sql`, einen `postgres`-Verbindungspool (Paket
  `postgres`, max. 5 Verbindungen), aufgebaut aus `DATABASE_URL` (`ssl: 'require'`, wenn
  `PGSSLMODE=require` gesetzt ist, wie auf Railway). Ein `globalThis`-Guard verhindert,
  dass Next.js' Dev-Server bei jedem Hot-Reload einen weiteren Pool aufbaut.
  `closeDb()` schliesst den Pool, für Skripte, die danach beenden sollen.
- Spaltennamen bleiben snake_case (kein `transform.column`), Zeitspalten
  (`created_at`, `timestamptz`/`date`-Spalten allgemein) werden bewusst als Rohtext
  (`string`, ISO-artig) statt als JS-`Date` geparst, `numeric` und `bigint` als
  `number` statt `string`/`BigInt` — damit entsprechen die Rückgabetypen genau dem, was
  die bisherigen, aus Supabase generierten Row-Typen (`string` für Zeit- und
  `number` für numeric-Spalten) vorgaben. Siehe Kommentare in `lib/db/client.ts`.
- `lib/db/rows.ts` enthält die handgepflegten Row-/Insert-/Update-Typen und
  Enum-Union-Typen (vormals aus `database.types.ts` generiert). `lib/supabase/rows.ts`
  ist bis Phase E3 ein reiner Re-Export von `lib/db/rows.ts` (`export * from
  "@/lib/db/rows"`), damit noch nicht umgestellte Module unverändert weiterlaufen.
- `lib/db/helpers.ts`: `chunk()` für Batch-Inserts/-Updates in Häppchen,
  `toJson()` zum Serialisieren eines Werts für eine jsonb-Spalte ausserhalb eines
  `sql`-Tags.
- Query-Module (`lib/catalog/queries.ts`, `lib/pricelist/*`, `lib/inquiry/*`,
  `lib/followups/*`, `lib/admin/*`, `lib/mail/*`) laufen zum jetzigen Zeitpunkt noch über
  `supabase-js`/PostgREST gegen die lokale Supabase-Instanz; ihre Umstellung auf
  parametrisierte `sql`-Tagged-Templates ist der nächste Schritt (siehe
  `docs/umbau-railway.md`, Phase E1, "Was sich im Code ändert").

## Tabellen

### Katalog (nur per Excel-Import befüllt, Ausnahme markierte Admin-Felder)

- **model_families** — eine Baureihe (eine Excel-Datei). `brand`, `name`, `slug` (unique),
  `codes[]`, `pricelist_no`, `source_file` kommen aus dem Import. `photo_url`, `short_text`,
  `sort` sind Admin-Felder. `has_pricelist = false` markiert Platzhalter-Familien ohne Excel
  (Wiesmann, "Älteres Modell"), die den Kurzablauf auslösen.
- **models** — Motorisierung/Variante einer Familie (`family_id`). `series_ps`, `series_nm`,
  `photo_url` sind Admin-Felder, `series_ps_suggested[]` kommt aus dem Import (alle
  Basis-PS-Werte der passenden Leistungsprodukte). Eindeutig ist nur `(family_id, slug)`; der
  Parser macht Namen je Familie eindeutig (Kraftstoff-Zusatz bei Duplikaten, siehe
  `docs/excel-import.md`), das ist eine Parser-Garantie, kein DB-Constraint auf `name`.
- **products** — eine Produktzeile aus der Excel. `category` ist das Flow-Mapping (motor,
  auspuff, fahrwerk, raeder, exterieur, interieur), `source_category` die Originalüberschrift.
  `variant_group` macht Optionen exklusiv. `gearbox` (manual/automatic/null) wird aus dem
  Produktnamen abgeleitet (`lib/catalog/gearbox.ts`), bei jedem Import neu berechnet.
  `content_hash` ist **nicht** unique (Kollisionen sind reale Daten, siehe
  `docs/excel-import.md`), nur indiziert (`(family_id, content_hash)`) für den Diff beim
  Import.
- **product_fitment** — welche `models`-Variante ein `products`-Eintrag bekommt, PK
  `(product_id, model_id)`.
- **pricelist_notes** — Hinweistexte aus der Excel (Garantie, Gutachten), je `family_id` und
  Excel-`category` (Originaltext, kein Flow-Enum).
- **pricelist_imports** — ein Excel-Upload im Admin. `status`: `pending` (Diff angezeigt),
  `applied` (übernommen), `discarded` (verworfen), `failed` (Übernehmen ist bei mindestens
  einer Familie fehlgeschlagen, Fehler zusätzlich als `errors` im `summary`-jsonb).
  `diff`/`summary` als `jsonb`. `payload jsonb` ist der Import-Zwischenspeicher (vom Parser
  gelieferte Rohdaten, `ParsedFamily[]`), den `applyPendingImport()` beim Übernehmen erneut
  lädt; ersetzt den Supabase-Storage-Bucket "imports" aus der Vor-Railway-Version. Wird nach
  Übernehmen/Verwerfen auf `null` gesetzt. `created_by` verweist auf einen better-auth-User
  (Tabelle `user`, kommt mit Phase E2), ohne Fremdschlüssel-Constraint, damit diese Migration
  unabhängig von der Auth-Migration bleibt.

### Anfragen

- **inquiries** — eine Kundenanfrage. `number` (Format `JJJJ-NNNN`, über
  `next_inquiry_number()`), `status`, `source` (web/quick), `locale`, `share_token` (unique,
  für `/p/<token>`). `family_id`/`model_id` verweisen auf den Katalog, werden aber bei
  Löschung der Katalogzeile auf `null` gesetzt (`on delete set null`) statt die Anfrage zu
  verlieren. `gearbox` (manual/automatic/unknown/null) ist die Antwort auf die Getriebefrage
  im Fahrzeug-Schritt. `series_ps` ist die effektive Serienleistung zum Zeitpunkt der Anfrage
  (für die Vorher/Nachher-Darstellung nach dem Absenden, siehe `components/flow/state.ts`
  `effectiveSeriesPs()`).
- **outbound_emails** — Protokoll jedes Mailversands (`type`: confirmation, inbox, summary,
  reply, follow_up), inklusive `error`, damit ein Mailfehler nie die Anfrage verliert.
- **follow_up_rules** — konfigurierbare Regeln (Posten 6), Text mit Platzhaltern `{{vorname}}`,
  `{{name}}`, `{{fahrzeug}}`, `{{nummer}}`.
- **follow_ups** — geplanter Versand je Anfrage und Regel. `cancelled_at` wird gesetzt, wenn
  der Kunde im Admin auf "Antwort erhalten" klickt (oder wenn ein Eintrag zur Laufzeit nicht
  mehr sinnvoll versendet werden kann: fehlende Anfrage, fehlende oder deaktivierte Regel,
  Anfrage ohne E-Mail-Adresse). `attempts` zählt bisherige Versandversuche, atomar zusammen
  mit dem Claim über `claim_follow_up()` erhöht; maximal `MAX_FOLLOW_UP_ATTEMPTS`
  (3, `lib/followups/run.ts`). `last_error` hält den Fehlertext des letzten fehlgeschlagenen
  Versuchs. `failed_at` wird gesetzt, sobald der letzte erlaubte Versuch fehlgeschlagen ist:
  der Eintrag gilt dann als endgültig aufgegeben und taucht in der Fällig-Abfrage nicht mehr
  auf.
- **settings** — Key-Value-Einstellungen (Absender, Signatur, Firmenadresse), Defaults in
  `db/seed.sql`. Für die Signatur im Antwortentwurf/Follow-up: `mail_from_name` ist der
  Firmenname, `company_address` die Adresse (wird nur angehängt, wenn gesetzt),
  `signature_name` der unterzeichnende Mitarbeiter, `signature_phone` die Telefonnummer.
- **inquiry_counters** — interne Hilfstabelle für `next_inquiry_number()` (ein Zähler pro
  Jahr), wird von der App nicht direkt angesprochen.
- **photos** — Fotos für `model_families` und `models` (`kind` = `family`/`model`,
  `owner_id` verweist je nach `kind` auf die jeweilige Tabelle, ohne eigenen
  Fremdschlüssel, da eine Spalte für zwei mögliche Zieltabellen), als `bytea` in der DB
  statt in einem Storage-Bucket. Ausgeliefert über `GET /api/photos/[id]`
  (`app/api/photos/[id]/route.ts`, ETag aus `sha1`, `Cache-Control: public, max-age=31536000,
  immutable`, `304` bei passendem `If-None-Match`). Hochgeladen über
  `app/api/admin/models/photo/route.ts` (POST: Magic-Bytes-Prüfung, Insert, altes Foto der
  Familie löschen, `photo_url` setzen, `revalidateTag('catalog')`; DELETE: Zeile löschen,
  `photo_url` auf `null`). Ersetzt den Supabase-Storage-Bucket "model-photos". Seed-Startfotos
  (`/img/models/...`, `db/seed.sql`) bleiben statische Dateien, keine `photos`-Zeilen.

## Funktionen

- `next_inquiry_number()` — liefert die nächste Anfragenummer `JJJJ-NNNN`. Das Jahr wird nach
  Schweizer Ortszeit (`now() at time zone 'Europe/Zurich'`) bestimmt, nicht nach der Server-/
  Session-Zeitzone. Legt bei Bedarf den Jahreszähler in `inquiry_counters` an, sperrt die Zeile
  (`for update`) und erhöht sie atomar.
- `set_updated_at()` — Trigger-Funktion, setzt `updated_at = now()` bei jedem `UPDATE`. Hängt
  an jeder Tabelle mit `updated_at`-Spalte.
- `claim_follow_up(p_id uuid, p_max_attempts integer default 3)` — Beansprucht einen
  `follow_ups`-Eintrag für den Versand (`sent_at = now()`) und erhöht `attempts` atomar im
  selben `UPDATE`; claimt nur, wenn `sent_at`/`cancelled_at`/`failed_at` alle noch `null` sind
  und `attempts < p_max_attempts`. `p_max_attempts` wird von `lib/followups/run.ts`
  (Konstante `MAX_FOLLOW_UP_ATTEMPTS`) übergeben, damit das Limit nur an einer Stelle (der
  TS-Konstante) gepflegt wird.
- `schedule_follow_ups(p_inquiry_id uuid, p_replied_at timestamptz)` — Plant beim Senden
  einer Antwort pro aktiver Regel (Reihenfolge `sort`) einen `follow_ups`-Eintrag,
  `scheduled_for = p_replied_at + days_after_reply` Tage (Europe/Zurich), sofern für Anfrage
  und Regel noch weniger als `max_count` Einträge existieren UND noch kein OFFENER Eintrag
  (`sent_at`/`cancelled_at`/`failed_at` alle `null`) für diese Regel/Anfrage existiert
  (verhindert eine zweite, parallele Planung derselben Regel bei einem erneuten Aufruf).
  Sperrt die Anfrage für die Dauer der Transaktion (`pg_advisory_xact_lock`), damit zwei
  gleichzeitige Aufrufe für dieselbe Anfrage nacheinander statt parallel laufen.

Gegenüber der Supabase-Version entfallen `security definer`/Execute-Grants an
`service_role` (es gibt keine PostgREST-Rollen mehr, jeder Aufruf läuft ohnehin
serverseitig durch die App mit vollen Rechten) sowie `generate_share_token()` (der Token
entsteht ausschliesslich in der App, `lib/inquiry/share.ts`).

## Admin-Konten (Login über better-auth)

`better-auth` (E-Mail/Passwort) ersetzt Supabase Auth vollständig, siehe
`docs/umbau-railway.md`, Abschnitt "Login". Eigene Tabellen `user`, `session`, `account`,
`verification` in `db/migrations/0002_auth.sql` (per `npx @better-auth/cli generate --config
lib/auth/server.ts` erzeugt und unverändert übernommen; better-auth erkennt an
`database: new Pool(...)` den Kysely/Postgres-Adapter und liefert dafür reines SQL statt
eines ORM-Schemas). Sessions 7 Tage gültig, Rate-Limit aktiv, Sign-up von aussen deaktiviert
(`lib/auth/server.ts`, `hooks.before`: blockiert `/sign-up/email` nur für Aufrufe MIT einem
echten eingehenden `Request`, ein interner Aufruf ohne Request-Objekt - wie
`scripts/create-admin-users.ts` ihn macht - kommt ungehindert durch; `disableSignUp` allein
hätte auch diesen internen Weg blockiert, die Prüfung sitzt in better-auth in der Route
selbst).

- `lib/auth/server.ts` — `auth` (die better-auth-Instanz, eigener `pg.Pool` neben
  `lib/db/client.ts`s `sql`, da better-auth einen node-postgres-kompatiblen Pool erwartet,
  keinen `postgres.js`-Client), `closeAuthPool()` für Skripte.
- `lib/auth/client.ts` — `createAuthClient()` für Login/Logout im Browser
  (`components/admin/LoginForm.tsx`: `signIn.email`).
- `app/api/auth/[...all]/route.ts` — better-auth-Handler (`toNextJsHandler`), bedient
  `/api/auth/sign-in/email`, `/api/auth/get-session`, `/api/auth/sign-out` usw.
- `lib/admin/auth.ts` — `getAdminUser()`/`requireAdmin()` lesen die Session über
  `auth.api.getSession({ headers })` (echter DB-Zugriff: prüft, ob die Session noch gültig
  ist). Ohne Session: Pages/Server Actions Redirect auf `/admin/login?next=…`, Routen 401
  JSON. Nehmen optional einen gemockten Client entgegen (Tests, siehe
  `tests/admin/auth.test.ts`).
- `middleware.ts` — prüft nur, ob das better-auth-Session-Cookie existiert
  (`getSessionCookie()` aus `better-auth/cookies`, kein DB-Zugriff), leitet sonst auf
  `/admin/login` um (Seiten) bzw. liefert 401 JSON (`/api/admin/*`). Die eigentliche,
  massgebliche Prüfung bleibt `requireAdmin()`.
- `scripts/create-admin-users.ts` (`npm run db:admins`) — legt `admin@daehler.com` und
  `admin@trendingmedia.ch` über `auth.api.signUpEmail()` an, idempotent (überspringt
  bestehende E-Mail-Adressen). Passwörter aus `ADMIN_DAEHLER_PASSWORD`/
  `ADMIN_TRENDINGMEDIA_PASSWORD`, lokaler Fallback (`daehler-admin-2026!`) nur wenn
  `NODE_ENV !== "production"`.

## Was sich gegenüber Supabase geändert hat

- Keine Row Level Security, keine Policies, keine PostgREST-Rollen (`anon`,
  `authenticated`, `service_role`): jeder Zugriff läuft serverseitig durch die App.
- Kein Storage: Fotos in der Tabelle `photos` (siehe oben), Import-Zwischenspeicher in
  `pricelist_imports.payload`.
- Kein `auth.users`: `pricelist_imports.created_by` ist eine plain `text`-Spalte (Migration
  `0003_pricelist_imports_created_by_text.sql`; ursprünglich `uuid` in `0001_init.sql`,
  aber better-auth-User-Ids sind keine UUIDs) ohne Fremdschlüssel-Constraint (bewusst, siehe
  Kommentar in `db/migrations/0001_init.sql`), referenziert auf Anwendungsebene die
  better-auth-Tabelle `user` (`db/migrations/0002_auth.sql`).
- `create extension pgcrypto` läuft ohne `with schema extensions` (das war eine
  Supabase-Eigenheit); `gen_random_uuid()`/`gen_random_bytes()` landen im Schema `public`.

## Railway (Produktion, Phase F)

Siehe `docs/umbau-railway.md`, Abschnitt "Phasen" und Zeile "Hosting" in der
Architektur-Tabelle: Railway-Postgres-Plugin liefert `DATABASE_URL` automatisch als
Service-Variable, `PGSSLMODE=require` setzen. `npm run db:migrate -- --seed` einmalig nach
dem ersten Deploy laufen lassen (z.B. über die Railway-CLI oder einen einmaligen Job),
danach den Excel-Import ausführen und die Admin-Konten anlegen (`scripts/create-admin-users.ts`,
sobald Phase E2 steht). Backups: täglicher `pg_dump | gzip` auf ein Railway-Volume (eigener
Service, siehe `docs/umbau-railway.md`).
