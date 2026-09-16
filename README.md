# dÄHLer Anfrage-Erlebnis

Produktives Anfragetool für dÄHLer Competition Line AG (daehler.com, Belp BE). Ersetzt das Kontaktformular durch einen geführten Ablauf, der bei dÄHLer als strukturierte Anfrage mit Antwortentwurf eintrifft.

Verbindliche Dokumentation: [`CLAUDE.md`](./CLAUDE.md) (Entscheidungen aus den Kundengesprächen), [`docs/architektur.md`](./docs/architektur.md) (Stack, Ordnerstruktur, Datenmodell, API), [`docs/umbau-railway.md`](./docs/umbau-railway.md) (Zielarchitektur Railway-only), [`docs/db.md`](./docs/db.md) (Schema, Datenzugriff, Admin-Konten), [`docs/deploy-railway.md`](./docs/deploy-railway.md) (Deploy Schritt für Schritt), [`docs/excel-import.md`](./docs/excel-import.md) (Parser-Regeln der Preislisten). Bei Widerspruch zwischen Code und Dokumentation gilt die Dokumentation.

## Stack

- [Next.js 15](https://nextjs.org) (App Router), TypeScript strict, React 19
- Tailwind CSS v4 (CSS-first `@theme`, siehe `app/globals.css`)
- Postgres (lokal: Docker-Container, produktiv: Railway-Plugin), Zugriff über `postgres` (postgres.js), siehe `lib/db/`
- [better-auth](https://www.better-auth.com) für den Admin-Login (E-Mail/Passwort, zwei feste Konten), siehe `lib/auth/`
- Fotos (Baureihen/Modelle) als `bytea` in Postgres, ausgeliefert über `GET /api/photos/[id]`
- [Resend](https://resend.com) für Mail, [Anthropic SDK](https://docs.anthropic.com) für den Schnellweg (Posten 3) und optionales Polieren des Antwortentwurfs
- [SheetJS (`xlsx`)](https://sheetjs.com) für den Excel-Import
- Validierung mit `zod`, Unit-Tests mit `vitest`, E2E-Smoke-Tests mit `@playwright/test`
- Hosting: Railway (ein App-Service via Railpack, `npm run build` / `npm start`). Follow-ups (Posten 6) laufen als interner Timer im selben Prozess (`lib/followups/scheduler.ts`, `instrumentation.ts`), kein separater Cron-Service; Backups über Railway Pro Volume-Backups, `scripts/backup.sh` nur noch als manuelles Werkzeug. Details: `docs/deploy-railway.md`

## Lokale Entwicklung

Voraussetzungen: Node 24, npm 11, Docker.

```bash
npm install
cp .env.example .env          # Werte eintragen, siehe unten
npm run db:up                 # docker compose up -d --wait: startet Postgres (Port 5433)
npm run db:migrate -- --seed  # Schema anlegen + Startdaten einspielen
npm run import -- --apply     # Preislisten aus docs/preislisten importieren
npm run db:admins             # zwei Admin-Konten anlegen (dÄHLer, Trending Media)
npm run dev                   # http://localhost:3000, Admin unter /admin
```

## Befehle

| Befehl | Zweck |
|---|---|
| `npm run dev` | Next.js Dev-Server |
| `npm run build` | Produktions-Build |
| `npm run start` | Produktions-Server (nach `build`) |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest, einmalig (`vitest run`) |
| `npm run test:watch` | Vitest im Watch-Modus |
| `npm run parse` | CLI: Excel-Preislisten aus `docs/preislisten` parsen (`scripts/parse-pricelists.ts`) |
| `npm run import` | CLI: Preislisten-Erstbefüllung in die DB (`scripts/import-pricelists.ts`, `-- --apply` übernimmt wirklich) |
| `npm run db:up` | Lokalen Postgres starten (Docker, `docker-compose.yml`, Port 5433) |
| `npm run db:down` | Lokalen Postgres stoppen (Daten bleiben im Volume) |
| `npm run db:migrate` | Migrationen aus `db/migrations/*.sql` anwenden (`-- --seed` spielt danach `db/seed.sql` ein, `-- --status` zeigt nur den Stand) |
| `npm run db:seed` | Nur `db/seed.sql` erneut einspielen (idempotent) |
| `npm run db:reset` | Kompletter Neuaufbau: Volume löschen, Postgres neu starten, migrieren, seeden |
| `npm run db:admins` | Die zwei festen Admin-Konten anlegen (`scripts/create-admin-users.ts`) |
| `npm run cron:followups` | Follow-up-Cron lokal auslösen (`scripts/cron-followups.ts`) |
| `npm run backup` | Postgres-Backup erstellen (`scripts/backup.sh`, braucht `DATABASE_URL`, `BACKUP_DIR`) |
| `npm run mail:test` | Testmail über Resend verschicken (`scripts/mail-test.ts`) |

## Umgebungsvariablen

Siehe [`.env.example`](./.env.example) für die vollständige, kommentierte Liste. Pflicht für den lokalen Betrieb:

```
DATABASE_URL=              # postgres://postgres:postgres@localhost:5433/daehler (siehe docker-compose.yml)
BETTER_AUTH_SECRET=        # openssl rand -hex 32
BETTER_AUTH_URL=           # lokal: http://localhost:3000
RESEND_API_KEY=            # leer lassen, wenn kein Mailversand gewünscht ist
NEXT_PUBLIC_APP_URL=http://localhost:3000
CRON_SECRET=
```

`ANTHROPIC_API_KEY` ist optional (Schnellweg Posten 3, Entwurf-Polish). `MAIL_TO_OVERRIDE`/`RESEND_FROM_OVERRIDE` lenken im Testbetrieb alle Mails auf eine Adresse bzw. ersetzen den Absender, solange `daehler.com` bei Resend nicht verifiziert ist. `FOLLOWUP_SCHEDULER` ist ausserhalb von Produktion optional (Standard: aus), siehe `lib/followups/scheduler.ts`. `.env` wird nie committet (siehe `.gitignore`).

## Projektstruktur

Massgeblich ist `docs/architektur.md`, Abschnitt "Ordnerstruktur". Kurzüberblick:

```
app/            Next.js App Router: Kundenflow, /admin, /p/[token], API-Routen
components/     flow/, admin/, ui/
lib/            db/, auth/, pricelist/, catalog/, inquiry/, rules/, draft/, mail/, followups/, ai/, i18n/
db/             migrations/*.sql, seed.sql
scripts/        CLI-Skripte (Parser, Import, Migrationsrunner, Admin-Konten, Cron, Backup)
docs/           Vorschau, Preislisten, verbindliche Dokumentation (nicht verändern)
public/img/     Start- und Kategoriefotos
```
