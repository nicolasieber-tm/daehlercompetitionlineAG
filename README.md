# dÄHLer Anfrage-Erlebnis

Produktives Anfragetool für dÄHLer Competition Line AG (daehler.com, Belp BE). Ersetzt das Kontaktformular durch einen geführten Ablauf, der bei dÄHLer als strukturierte Anfrage mit Antwortentwurf eintrifft.

Verbindliche Dokumentation: [`CLAUDE.md`](./CLAUDE.md) (Entscheidungen aus den Kundengesprächen), [`docs/architektur.md`](./docs/architektur.md) (Stack, Ordnerstruktur, Datenmodell, API), [`docs/excel-import.md`](./docs/excel-import.md) (Parser-Regeln der Preislisten). Bei Widerspruch zwischen Code und Dokumentation gilt die Dokumentation.

## Stack

- [Next.js 15](https://nextjs.org) (App Router), TypeScript strict, React 19
- Tailwind CSS v4 (CSS-first `@theme`, siehe `app/globals.css`)
- [Supabase](https://supabase.com) (Postgres, Auth, Storage), Client-Setup in `lib/supabase/`
- [Resend](https://resend.com) für Mail, [Anthropic SDK](https://docs.anthropic.com) für den Schnellweg (Posten 3) und optionales Polieren des Antwortentwurfs
- [SheetJS (`xlsx`)](https://sheetjs.com) für den Excel-Import
- Validierung mit `zod`, Unit-Tests mit `vitest`, E2E-Smoke-Tests mit `@playwright/test`
- Hosting: Railway (`npm run build` / `npm start`), Cron via Railway Cron auf `/api/cron/follow-ups`

## Lokale Entwicklung

Voraussetzungen: Node 24, npm 11.

```bash
npm install
cp .env.example .env.local   # Werte eintragen, siehe unten
npm run dev                  # http://localhost:3000
```

Für lokale Supabase-Funktionen (Datenbank, Auth, Storage) wird Docker benötigt:

```bash
npm run db:start   # supabase start
npm run db:reset   # Migrationen + supabase/seed.sql neu einspielen
npm run db:types   # lib/supabase/database.types.ts aus dem lokalen Schema erzeugen
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
| `npm run import` | CLI: Preislisten-Erstbefüllung in die DB (`scripts/import-pricelists.ts`) |
| `npm run db:start` | Lokalen Supabase-Stack starten (Docker) |
| `npm run db:reset` | Lokale DB zurücksetzen und neu befüllen |
| `npm run db:types` | TypeScript-Typen aus dem lokalen Schema generieren |
| `npm run cron:followups` | Follow-up-Cron lokal auslösen (`scripts/cron-followups.ts`) |

## Umgebungsvariablen

Siehe [`.env.example`](./.env.example):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
MAIL_TO_OVERRIDE=          # Test: alle Mails hierhin
ANTHROPIC_API_KEY=         # optional, Posten 3 und Entwurf-Polish
CRON_SECRET=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

`SUPABASE_SERVICE_ROLE_KEY` ist geheim und wird ausschliesslich serverseitig verwendet (`lib/supabase/admin.ts`), nie im Client-Bundle.

## Projektstruktur

Massgeblich ist `docs/architektur.md`, Abschnitt "Ordnerstruktur". Kurzüberblick:

```
app/            Next.js App Router: Kundenflow, /admin, /p/[token], API-Routen
components/     flow/, admin/, ui/
lib/            supabase/, pricelist/, catalog/, inquiry/, rules/, draft/, mail/, followups/, ai/, i18n/
supabase/       config.toml, migrations/, seed.sql
scripts/        CLI-Skripte (Parser, Import, Cron-Hilfe)
docs/           Vorschau, Preislisten, verbindliche Dokumentation (nicht verändern)
public/img/     Start- und Kategoriefotos
```
