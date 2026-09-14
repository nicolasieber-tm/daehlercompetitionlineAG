# Datenbank

Ergänzt `docs/architektur.md` (Abschnitt "Datenmodell" und "Sicherheit"). Schema in
`supabase/migrations/20260911000000_init.sql`, Startdaten in `supabase/seed.sql`.

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
  `variant_group` macht Optionen exklusiv (siehe `lib/catalog/variant-groups.ts`, sobald
  vorhanden). `content_hash` ist **nicht** unique (Kollisionen sind reale Daten, siehe
  `docs/excel-import.md`), nur indiziert (`(family_id, content_hash)`) für den Diff beim
  Import.
- **product_fitment** — welche `models`-Variante ein `products`-Eintrag bekommt, PK
  `(product_id, model_id)`.
- **pricelist_notes** — Hinweistexte aus der Excel (Garantie, Gutachten), je `family_id` und
  Excel-`category` (Originaltext, kein Flow-Enum).
- **pricelist_imports** — ein Excel-Upload im Admin. `status`: `pending` (Diff angezeigt),
  `applied` (übernommen), `discarded` (verworfen), `failed` (Übernehmen ist bei mindestens einer
  Familie fehlgeschlagen, siehe `lib/pricelist/imports.ts` `applyPendingImport()`; die Fehler
  stehen zusätzlich als `errors` im `summary`-jsonb, Status-Check-Constraint erweitert in
  `20260916000000_followups_and_imports_phase_b.sql`). `diff`/`summary` als `jsonb`.

### Anfragen

- **inquiries** — eine Kundenanfrage. `number` (Format `JJJJ-NNNN`, über
  `next_inquiry_number()`), `status`, `source` (web/quick), `locale`, `share_token` (unique,
  für `/p/<token>`). `family_id`/`model_id` verweisen auf den Katalog, werden aber bei
  Löschung der Katalogzeile auf `null` gesetzt (`on delete set null`) statt die Anfrage zu
  verlieren.
- **outbound_emails** — Protokoll jedes Mailversands (`type`: confirmation, inbox, summary,
  reply, follow_up), inklusive `error`, damit ein Mailfehler nie die Anfrage verliert.
- **follow_up_rules** — konfigurierbare Regeln (Posten 6), Text mit Platzhaltern `{{vorname}}`,
  `{{name}}`, `{{fahrzeug}}`, `{{nummer}}`.
- **follow_ups** — geplanter Versand je Anfrage und Regel. `cancelled_at` wird gesetzt, wenn
  der Kunde im Admin auf "Antwort erhalten" klickt (oder wenn ein Eintrag zur Laufzeit nicht
  mehr sinnvoll versendet werden kann, siehe `lib/followups/run.ts`: fehlende Anfrage, fehlende
  oder deaktivierte Regel, Anfrage ohne E-Mail-Adresse). `attempts` (Migration
  `20260915000000_followups_retry_limit.sql`) zählt bisherige Versandversuche, atomar zusammen
  mit dem Claim über `claim_follow_up()` erhöht (siehe unten); maximal `MAX_FOLLOW_UP_ATTEMPTS`
  (3, `lib/followups/run.ts`). `last_error` hält den Fehlertext des letzten fehlgeschlagenen
  Versuchs. `failed_at` wird gesetzt, sobald der letzte erlaubte Versuch fehlgeschlagen ist: der
  Eintrag gilt dann als endgültig aufgegeben (getrennt von `cancelled_at`, das für "Antwort
  erhalten" bzw. einen sonst nicht mehr sinnvollen Eintrag steht) und taucht in der
  Fällig-Abfrage nicht mehr auf.
- **settings** — Key-Value-Einstellungen (Absender, Signatur, Firmenadresse), Defaults in
  `supabase/seed.sql`. Für die Signatur im Antwortentwurf/Follow-up (`lib/draft/template.ts`,
  `lib/mail/templates/follow_up.ts`): `mail_from_name` ist der Firmenname, `company_address` die
  Adresse (wird nur angehängt, wenn gesetzt), `signature_name` der unterzeichnende Mitarbeiter,
  `signature_phone` die Telefonnummer.
- **inquiry_counters** — interne Hilfstabelle für `next_inquiry_number()` (ein Zähler pro
  Jahr), nicht Teil des Datenmodells in `docs/architektur.md`, wird von der App nicht direkt
  angesprochen.

## Funktionen

- `next_inquiry_number()` — liefert die nächste Anfragenummer `JJJJ-NNNN`. Das Jahr wird nach
  Schweizer Ortszeit (`now() at time zone 'Europe/Zurich'`) bestimmt, nicht nach der Server-/
  Session-Zeitzone. Legt bei Bedarf den Jahreszähler in `inquiry_counters` an, sperrt die Zeile
  (`for update`) und erhöht sie atomar. `security definer`, damit die Nummernvergabe unabhängig
  von RLS-Rechten des Aufrufers funktioniert. Execute-Recht ist von `anon`/`authenticated`
  entzogen und explizit an `service_role` erteilt (nur der Service-Role-Client vergibt
  Nummern, siehe `docs/architektur.md`, Abschnitt „Anfrage anlegen“).
- `generate_share_token()` — optionaler DB-seitiger Fallback für einen 22-stelligen,
  URL-sicheren Token. Normalerweise erzeugt die App den Token selbst (`lib/inquiry/share.ts`,
  sobald vorhanden); die Spalte `inquiries.share_token` ist unique, unabhängig von der Quelle.
  Execute-Recht wie bei `next_inquiry_number()` nur für `service_role` (von `anon` und
  `authenticated` entzogen).
- `set_updated_at()` — Trigger-Funktion, setzt `updated_at = now()` bei jedem `UPDATE`. Hängt
  an jeder Tabelle mit `updated_at`-Spalte.
- `claim_follow_up(p_id uuid, p_max_attempts integer default 3)` — Migration
  `20260915000000_followups_retry_limit.sql`, Signatur erweitert in
  `20260916000000_followups_and_imports_phase_b.sql`. Beansprucht einen `follow_ups`-Eintrag für
  den Versand (`sent_at = now()`) und erhöht `attempts` atomar im selben `UPDATE`; claimt nur,
  wenn `sent_at`/`cancelled_at`/`failed_at` alle noch `null` sind und `attempts < p_max_attempts`.
  `p_max_attempts` wird von `lib/followups/run.ts` (Konstante `MAX_FOLLOW_UP_ATTEMPTS`)
  übergeben, damit das Limit nur an einer Stelle (der TS-Konstante) gepflegt wird, nicht
  zusätzlich hart codiert in der Funktion. `security definer`, Execute-Recht nur für
  `service_role`.
- `schedule_follow_ups(p_inquiry_id uuid, p_replied_at timestamptz)` — Migration
  `20260915000000_followups_retry_limit.sql`, ergänzt in
  `20260916000000_followups_and_imports_phase_b.sql`. Plant beim Senden einer Antwort
  (`lib/followups/schedule.ts` `markReplied()`/`scheduleFollowUps()`) pro aktiver Regel
  (Reihenfolge `sort`) einen `follow_ups`-Eintrag, `scheduled_for = p_replied_at +
  days_after_reply` Tage (Europe/Zurich), sofern für Anfrage und Regel noch weniger als
  `max_count` Einträge existieren UND noch kein OFFENER Eintrag (`sent_at`/`cancelled_at`/
  `failed_at` alle `null`) für diese Regel/Anfrage existiert (verhindert eine zweite, parallele
  Planung derselben Regel bei einem erneuten Aufruf, z. B. Antwort im Admin nochmals gesendet).
  Sperrt die Anfrage für die Dauer der Transaktion (`pg_advisory_xact_lock`), damit zwei
  gleichzeitige Aufrufe für dieselbe Anfrage nacheinander statt parallel laufen und `max_count`
  nie überschritten wird. `security definer`, Execute-Recht nur für `service_role`.

## Sicherheit (RLS)

RLS ist auf allen Tabellen aktiv.

- Katalogtabellen (`model_families`, `models`, `products`, `product_fitment`,
  `pricelist_notes`): `anon` (öffentlicher Kundenflow) hat ausschliesslich `select` und
  ausschliesslich auf aktive Zeilen. Tabellen mit eigener `active`-Spalte (`model_families`,
  `models`, `products`) prüfen diese direkt; Tabellen ohne eigene `active`-Spalte
  (`product_fitment`, `pricelist_notes`) prüfen die aktive Elternzeile. `authenticated`
  (Admin) hat auf denselben Tabellen alle Operationen (select, insert, update, delete) auf
  allen Zeilen, auch inaktiven, z. B. für die Preislisten-Pflege und das Wiederherstellen
  entfernter Produkte.
- Alle anderen Tabellen (`pricelist_imports`, `inquiries`, `outbound_emails`,
  `follow_up_rules`, `follow_ups`, `settings`, `inquiry_counters`): alle Operationen nur für
  `authenticated`. Öffentliche Schreibzugriffe (z. B. `POST /api/inquiries`) laufen
  serverseitig über den Service-Role-Client (`lib/supabase/admin.ts`) und umgehen RLS ohnehin.
- `inquiries.timing` und `inquiries.channel` sind sprachneutrale IDs (Check-Constraint):
  `timing` ∈ `asap | m1_2 | m3_6 | flexible`, `channel` ∈ `phone | email | whatsapp`, beide
  nullable. Anzeige und Mails lösen die ID über die i18n-Dictionaries auf (siehe
  `docs/architektur.md`, Abschnitt „i18n“).
- Storage-Bucket `model-photos`: `public = true`, `select` für alle, `insert`/`update`/`delete`
  nur für `authenticated`.
- Admin = jeder authentifizierte Supabase-User, kein Rollenmodell (zwei Konten: dÄHLer,
  Trending Media, siehe unten).

## Lokal starten

Voraussetzung: Docker läuft.

```bash
npx supabase start              # oder: npm run db:start
npx supabase db reset           # Migrationen + supabase/seed.sql neu einspielen, oder: npm run db:reset
npx tsx scripts/create-admin-users.ts  # Admin-User neu anlegen, siehe unten
npm run db:types                # generiert lib/supabase/database.types.ts neu (ersetzt die Handarbeit)
```

`supabase start` gibt die lokalen URLs/Keys aus (API, Studio unter Port 54323, Inbucket für
Test-Mails unter Port 54324). Die Werte für `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` aus der Ausgabe in `.env`
übernehmen.

## Zwei Admin-User anlegen

Kein Rollenmodell, jeder bestätigte Supabase-Auth-User ist Admin. Zwei Konten: dÄHLer und
Trending Media. `auth.users` ist Teil der Datenbank und wird von `npx supabase db reset`
mit geleert (weder `supabase/seed.sql` noch die Migration legen Auth-User an, das kann
`seed.sql` nicht portabel und versionsunabhängig leisten). Die beiden Admin-Konten müssen
darum **nach jedem Reset** neu angelegt werden:

```bash
npx tsx scripts/create-admin-users.ts
```

`scripts/create-admin-users.ts` ist idempotent (prüft `auth.users` per E-Mail, legt nur
fehlende Konten an, kann also gefahrlos mehrfach laufen) und lädt `.env` selbst
(`process.loadEnvFile`). Passwörter kommen aus `ADMIN_DAEHLER_PASSWORD` /
`ADMIN_TRENDINGMEDIA_PASSWORD` (siehe `.env.example`); ohne gesetzte Variable nutzt das
Skript lokal einen Dev-Fallback, der ausschliesslich im Skript selbst hinterlegt ist
(Konstante `LOCAL_DEV_PASSWORD_FALLBACK` in `scripts/create-admin-users.ts`, nur für den
lokalen Docker-Stack ohne öffentliche Erreichbarkeit; hier bewusst nicht abgedruckt). Für
die Cloud-Instanz beide Variablen zwingend individuell setzen, bevor das Skript dort läuft.

Kein npm-Script dafür (`package.json` ist für diese Aufgabe gesperrt); direkt mit
`npx tsx` aufrufen, wie oben.

| E-Mail | Passwort aus Umgebungsvariable | Zweck |
|---|---|---|
| `admin@daehler.com` | `ADMIN_DAEHLER_PASSWORD` | dÄHLer |
| `admin@trendingmedia.ch` | `ADMIN_TRENDINGMEDIA_PASSWORD` | Trending Media |

**Alternative: über Supabase Studio** (lokal: `http://localhost:54323`, Cloud:
Projekt-Dashboard): Authentication → Users → "Add user" → E-Mail + Passwort setzen, "Auto
Confirm User" aktivieren (kein Bestätigungsmail-Versand nötig, `enable_confirmations =
false` ist lokal ohnehin Standard).

## Später: Cloud-Projekt anbinden

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push        # lokale Migrationen auf das Cloud-Projekt anwenden
```

`supabase db push` wendet nur die Migrationen an, nicht `seed.sql`. Einstellungen
(`settings`) und die Familien-Platzhalter danach einmalig manuell einspielen (z. B.
`psql <connection-string> -f supabase/seed.sql`) oder über den Admin nachpflegen. Nach dem
Link `npm run db:types` erneut laufen lassen, damit `database.types.ts` gegen das Cloud-Schema
generiert wird.
