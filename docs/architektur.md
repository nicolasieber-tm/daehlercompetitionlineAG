# Architektur und Spezifikation (verbindlich für die Umsetzung)

Ergänzt `CLAUDE.md`. Bei Widerspruch gilt `CLAUDE.md`. Dieses Dokument legt fest, was `CLAUDE.md` offen lässt: Datenmodell, Ordnerstruktur, API, Mail, i18n, Regeln, Deploy.

## Stack (fix)

- Next.js 15, App Router, TypeScript strict, React 19. Paketmanager: npm.
- Tailwind CSS v4 (CSS-first `@theme`), keine UI-Bibliothek. Design-Tokens aus `docs/vorschau.html` übernehmen (siehe Abschnitt Design).
- Supabase: Postgres, Auth (E-Mail + Passwort), Storage (Bucket `model-photos`, public read). Lokal via `npx supabase start` (Docker). Migrationen in `supabase/migrations/`, Typen via `npm run db:types` nach `lib/supabase/database.types.ts`.
- `@supabase/ssr` für Server/Client-Clients. Drei Clients in `lib/supabase/`: `server.ts` (Cookies, RLS), `client.ts` (Browser), `admin.ts` (Service-Role, nur serverseitig).
- Resend (`resend` npm) für Mail. Anthropic SDK (`@anthropic-ai/sdk`) für Posten 3 und optionales Polieren des Antwortentwurfs.
- SheetJS (`xlsx`, Build von cdn.sheetjs.com 0.20.x) für `.xls` (BIFF8) und `.xlsx`.
- Validierung: `zod`. Tests: `vitest`. E2E: `@playwright/test` (nur Smoke).
- Hosting: Railway (Node, `npm run build` / `npm start`), Cron via Railway Cron auf `/api/cron/follow-ups`.

## Ordnerstruktur

```
app/
  layout.tsx                 Root-Layout, Fonts, Theme
  page.tsx                   Kundenflow (Server Component lädt Katalog, übergibt an <Flow/>)
  p/[token]/page.tsx         Read-only Ansicht einer Anfrage (Paket als Link teilen)
  admin/                     Adminbereich (Layout mit Auth-Guard)
    layout.tsx, page.tsx (Übersicht Anfragen)
    anfragen/[id]/page.tsx   Detail, Antwortentwurf
    preislisten/page.tsx     Upload + Diff + Übernehmen, Import-Historie
    modelle/page.tsx         Fotos, Kurzbeschrieb, Serien-PS/Nm
    follow-ups/page.tsx      Regeln (Posten 6)
    schnellweg/page.tsx      Posten 3
    einstellungen/page.tsx   Absender, Signatur, Telefon, Posteingang
    login/page.tsx
  api/
    inquiries/route.ts                  POST: Anfrage aus dem Flow
    inquiries/[id]/summary-mail/route.ts POST: «Zusammenfassung an mich senden»
    admin/...                           Admin-APIs (Auth-geschützt)
    cron/follow-ups/route.ts            GET/POST, Header `Authorization: Bearer $CRON_SECRET`
components/
  flow/        Schritte des Kundenflows (Client Components)
  admin/       Admin-UI
  ui/          Basisbausteine (Tile, Chip, Button, Field, Progress, Summary)
lib/
  supabase/    Clients, database.types.ts
  pricelist/   parser.ts, diff.ts, apply.ts, types.ts  (siehe docs/excel-import.md)
  catalog/     queries.ts (Familien, Modelle, Produkte), categories.ts (Mapping, Reihenfolge, Texte), variant-groups.ts, upsell.ts
  inquiry/     create.ts, number.ts, summary.ts (Textzusammenfassung), share.ts
  rules/       checks.ts (Prüfhinweise, eine Datei)
  draft/       template.ts (deterministischer Antwortentwurf), polish.ts (optional KI)
  mail/        resend.ts (Versand + Override + BCC), templates/*.ts (HTML + Text)
  followups/   schedule.ts, run.ts
  ai/          extract.ts (Posten 3), client.ts
  i18n/        de.ts, en.ts, index.ts (t(), Locale-Context), format.ts (CHF, Datum)
supabase/
  config.toml, migrations/*.sql, seed.sql
scripts/
  parse-pricelists.ts   CLI: alle Dateien in docs/preislisten parsen, JSON + Statistik ausgeben
  import-pricelists.ts  CLI: Erstbefüllung in die DB (nutzt lib/pricelist/apply.ts)
docs/
  vorschau.html, preislisten/*.xls, architektur.md, excel-import.md
public/img/models/*.jpg, public/img/flow/*.jpg   Startfotos aus der Vorschau
```

## Datenmodell (Postgres)

Alle Tabellen mit `id uuid default gen_random_uuid()`, `created_at timestamptz default now()`, `updated_at` via Trigger.

### Katalog (ausschliesslich per Import befüllt, Ausnahme: markierte Admin-Felder)

`model_families` — eine Excel-Datei = eine Baureihe
- `brand text` (BMW | MINI | Toyota | Wiesmann)
- `name text` (Zeile 2 Spalte B, z. B. «3er G20, G21»), `slug text unique`
- `codes text[]` (aus dem Namen: G20, G21 ...), `pricelist_no text` (z. B. 46259), `source_file text`
- `has_pricelist bool` (false für Wiesmann und «Älteres Modell»-Platzhalter)
- `photo_url text` **Admin**, `short_text text` **Admin**, `sort int` **Admin**, `active bool`

`models` — Motorisierung/Variante = Spalte in Zeile 2
- `family_id`, `name text` (z. B. «M40i», «M3 Touring»), `slug`, `fuel text` (benzin | diesel | elektro | null)
- `series_ps int` **Admin**, `series_nm int` **Admin**, `series_ps_suggested int[]` (Import: alle «Basis xxx PS»-Werte der passenden Leistungsprodukte)
- `photo_url text` **Admin** (optional, überschreibt Familie), `sort int`, `active bool`
- unique (`family_id`, `slug`); der Parser macht Namen je Familie eindeutig (Kraftstoff-Zusatz bei Duplikaten)

`products`
- `family_id`, `category text` (motor | auspuff | fahrwerk | raeder | exterieur | interieur), `source_category text` (Originalüberschrift der Excel)
- `group_label text` (letzte Gruppenzeile mit Doppelpunkt innerhalb der Kategorie, z. B. «DME Leistungssteigerungen:»)
- `name text`, `description text`, `article_no text`, `rc text`
- `price_parts numeric`, `price_install numeric`, `price_approval numeric`, `price_total numeric`
- `price_status text` (priced | in_preparation | on_request), `price_note text`
- `ps_base int[]`, `ps_to int`, `nm_to int` (aus dem Namen geparst, null wenn nicht erkennbar)
- `variant_group text` (siehe `lib/catalog/variant-groups.ts`; Optionen derselben Gruppe schliessen sich im Flow aus)
- `fits_all bool` (true, wenn die Zeile keine Marker hat), `sort int`, `source_row int`, `content_hash text` (nicht unique, nur Index), `active bool`

`product_fitment` (`product_id`, `model_id`) PK — welche Variante das Produkt bekommt.

`pricelist_notes` — Hinweistexte aus der Excel (Garantie, Gutachten), `family_id`, `category`, `text`, `sort`.

`pricelist_imports`
- `filenames text[]`, `status text` (pending | applied | discarded), `diff jsonb`, `summary jsonb` (Zähler neu/geändert/entfernt je Familie), `applied_at`, `created_by uuid`
- Der Import ist zweistufig: Upload erzeugt `pending` mit Diff, «Übernehmen» wendet an.

### Anfragen

`inquiries`
- `number text unique` (Format `JJJJ-NNNN`, Sequenz pro Jahr via Postgres-Funktion `next_inquiry_number()`)
- `status text` (neu | in_bearbeitung | beantwortet | abgeschlossen), `source text` (web | quick), `locale text` (de | en)
- `family_id`, `model_id` (nullable), `vehicle_text text` (Freitext, wenn kein Modell zuordenbar), `year text`, `been_here bool`
- `categories text[]`, `consulting bool` (Komplettpaket), `selections jsonb` (Array `{product_id, category, name, description, price_total, price_status}`), `follow_up_answers jsonb` (`{motor: '...', auspuff: '...'}`)
- `character text` (dezent | sportlich | maximum), `timing text` (asap | m1_2 | m3_6 | flexible)
- `first_name, last_name, city, phone, email, channel (phone | email | whatsapp), message`
- Alle Auswahlwerte (timing, channel, character, follow_up_answers) werden als sprachneutrale IDs gespeichert; die Dictionaries liefern `{ id, label }`-Optionen, Anzeige und Mails lösen über die ID auf.
- `estimated_total numeric`, `checks jsonb` (Array von `{id, text}`), `draft_subject text`, `draft_reply text`
- `share_token text unique` (URL-sicher, 22 Zeichen), `raw_text text` (Schnellweg), `ai_extraction jsonb`
- `replied_at timestamptz`, `answer_received_at timestamptz`

`outbound_emails`: `inquiry_id`, `type` (confirmation | inbox | summary | reply | follow_up), `to_email`, `subject`, `body_text`, `resend_id`, `status`, `error`, `sent_at`.

`follow_up_rules`: `name`, `days_after_reply int`, `subject text`, `body text` (Platzhalter `{{vorname}}`, `{{name}}`, `{{fahrzeug}}`, `{{nummer}}`), `max_count int`, `active bool`, `sort int`.

`follow_ups`: `inquiry_id`, `rule_id`, `scheduled_for date`, `sent_at`, `cancelled_at`, `outbound_email_id`.

`settings`: `key text pk`, `value text`. Schlüssel: `mail_from_name`, `mail_from`, `mail_inbox`, `mail_bcc`, `mail_reply_to`, `signature_name`, `signature_phone`, `company_address`.

### Sicherheit

- RLS auf allen Tabellen. Katalogtabellen: `select` für `anon` nur auf `active = true`; `authenticated` (Admin) hat auf allen Tabellen alle Operationen und sieht auch inaktive Zeilen. `next_inquiry_number()` explizit für `service_role` ausführbar, Jahr nach `Europe/Zurich`. Schreibzugriffe aus öffentlichen APIs laufen serverseitig über den Service-Role-Client.
- Admin = jeder authentifizierte Supabase-User (zwei Konten: dÄHLer, Trending Media). Kein Rollenmodell.
- `/admin/*` durch `middleware.ts` geschützt (Redirect auf `/admin/login`).

## Kundenflow (Details zur Vorschau)

Schrittfolge: `car` → `wish` → je gewählte Kategorie `cat:<id>` → `character` → `contact` → `done`. Zustand im Client (`useReducer`), nicht in der URL. Fortschrittsbalken wie Vorschau.

1. **Fahrzeug**: Marken-Chips (BMW, MINI, Toyota, Wiesmann). Familien-Kacheln mit Foto (Fallback: Kachel ohne Foto, Text «Foto folgt» nur im Admin, nicht im Flow). Nach Wahl der Familie: Motorisierungs-Chips (`models`), gruppiert nach `fuel`. Wenn `series_ps_suggested` mehrere Werte hat und `series_ps` nicht gesetzt ist: Chips «Serienleistung: 460 PS / 480 PS» zur Auswahl (filtert Leistungsprodukte nach `ps_base`). Baujahr-Select, «Schon mal bei uns gewesen». Serien-PS/Nm anzeigen, wenn bekannt.
   - Wiesmann und Familien mit `has_pricelist = false` sowie Baujahr «älter» → **Kurzablauf**: `wish` (nur Kategorien, keine Produkte) → `character` → `contact` → `done` ohne Preise.
2. **Wunsch**: 6 Foto-Kacheln (Texte in `lib/catalog/categories.ts`), Mehrfachauswahl, Kachel «Komplettpaket, beraten Sie mich».
3. **Kategorie-Schritt**: Produkte des Modells (`product_fitment` oder `fits_all`), nach `group_label` gruppiert, Reihenfolge `sort`. Kachel: Name, Beschreibung, «ab CHF 4'180» oder «in Vorbereitung» / «auf Anfrage». Gleiche `variant_group` = exklusiv, sonst kombinierbar. Folgefrage je Kategorie (Motor, Auspuff, Fahrwerk, Räder) wie Vorschau. Motor: PS-Zähler Serie → Ziel (`ps_to` des gewählten Leistungsprodukts). «Passt gut dazu» (`lib/catalog/upsell.ts`, Texte wie Vorschau, Sie-Form): schlägt eine nicht gewählte Kategorie vor, «Dazunehmen» fügt sie als nächsten Schritt ein.
   - Unterhalb der Produkte: Hinweise aus `pricelist_notes` der Kategorie als Kleingedrucktes (z. B. Ergänzungsgarantie).
4. **Charakter**: Dezent / Sportlich / Maximum + optionales Freitextfeld.
5. **Termin und Kontakt**: Zeitraum-Chips (So bald wie möglich, in 1 bis 2 Monaten, in 3 bis 6 Monaten, Flexibel), Felder, bevorzugter Kanal (Telefon, E-Mail, WhatsApp), Datenschutzhinweis. Submit → `POST /api/inquiries`.
6. **Abschluss**: Nummer, Foto, Vorher/Nachher-Tabelle, Paket mit Richtsumme, «Paket als Link teilen» (kopiert `/p/<token>`, Web Share API auf Mobile), «Zusammenfassung an mich senden» (ruft `summary-mail`), nächste Schritte.

Texte: Sie-Form, Schweizer Schreibweise, keine Gedankenstriche in Kundentexten. Preise `CHF 4'180`. Richtsumme = Summe `price_total` der gewählten Produkte, Hinweis «unverbindlich, Kompatibilität wird geprüft» wenn Positionen ohne Preis dabei sind zusätzlich «ohne Positionen auf Anfrage».

## i18n

Eigene, leichte Lösung ohne Routing: `lib/i18n/de.ts` und `en.ts` exportieren dasselbe typisierte Objekt. `LocaleProvider` (Client) liest Cookie `lang` (de | en), Umschalter im Kopf des Flows. Serverseitig liest `layout.tsx` das Cookie und setzt `<html lang>`. Produktnamen und Beschreibungen bleiben Deutsch (aus der Excel). Mails und Antwortentwurf verwenden `inquiries.locale`. Alle Kundentexte, Kategorie-Texte, Folgefragen, Upsell-Texte, Prüfhinweise und Mailvorlagen in den Dictionaries, nie hart im JSX.

## Anfrage anlegen (`lib/inquiry/create.ts`)

1. Zod-Validierung des Payloads. 2. Produkte aus DB nachladen (Preise nie vom Client übernehmen). 3. `number` via `next_inquiry_number()`. 4. `checks` via `lib/rules/checks.ts`. 5. `estimated_total`. 6. `draft_subject`, `draft_reply` via `lib/draft/template.ts`. 7. `share_token`. 8. Insert. 9. Mails: Bestätigung an Kunde (Typ `confirmation`), Anfrage-Mail an `settings.mail_inbox` (Typ `inbox`) mit Zusammenfassung (`lib/inquiry/summary.ts`, Format wie Ticket in der Vorschau), Prüfhinweisen, Antwortentwurf und Link `/admin/anfragen/<id>`. Mailfehler dürfen die Anfrage nicht verlieren: Anfrage zuerst speichern, Mailfehler in `outbound_emails.error`.

## Prüfhinweise (`lib/rules/checks.ts`)

Array von Regeln `{ id, text: {de, en}, when: (ctx) => boolean }` mit `ctx = { inquiry, products, model, family }`. Regeln aus `CLAUDE.md` plus: Familie ohne Preisliste, Produkt mit `price_status !== 'priced'` gewählt, Komplettpaket gewünscht. Keine Regel im UI-Code.

## Antwortentwurf (`lib/draft/template.ts`)

Deterministische Vorlage, Sie-Form, Struktur aus `CLAUDE.md`, Referenz `draft()` in `docs/vorschau.html`, umgestellt auf Sie. Signatur aus `settings`. Betreff (`draft.subject` im Dictionary): «Ihre Anfrage für den BMW M2 G87, M2, Nr. 2026-0012» (vehicleLabel-Formel, siehe `lib/catalog/vehicle-label.ts`: Familienname plus «, Modellname»). Positionen im Entwurf mit Beschreibung und Preis: «• Motor: Stufe 1 (620 PS / 740 Nm), ab CHF 4'180». Optional `lib/draft/polish.ts`: wenn `ANTHROPIC_API_KEY` gesetzt, wird die Vorlage sprachlich geglättet, Fakten (Preise, Positionen, Leistungen) dürfen sich nicht ändern; Ergebnis wird gegen die Vorlage geprüft (alle Preise und Positionsnamen müssen vorkommen), sonst Vorlage behalten.

## Mail (`lib/mail/`)

- `sendMail({ to, subject, html, text, type, inquiryId })`: Absender aus `settings`, `bcc` = `settings.mail_bcc`, `reply_to` = `settings.mail_reply_to`. Wenn `MAIL_TO_OVERRIDE` gesetzt: alle Empfänger durch diese Adresse ersetzen und Original-Empfänger im Betreff-Präfix `[TEST an x@y]` nennen. Jeder Versand wird in `outbound_emails` protokolliert.
- Vorlagen (HTML + Text, dunkles Brand-Design, mobil lesbar): `confirmation` (Zusammenfassung, Paket, Richtpreis, Link auf `/p/<token>`), `inbox` (interne Zusammenfassung, Prüfhinweise, Entwurf, Admin-Link), `summary` («Zusammenfassung an mich senden»), `reply` (der bearbeitete Entwurf), `follow_up`.

## Follow-ups (Posten 6)

- Beim Senden einer Antwort (`reply`) wird `replied_at` gesetzt, `status = beantwortet`, und pro aktiver Regel ein `follow_ups`-Eintrag mit `scheduled_for = replied_at + days_after_reply` angelegt (max. `max_count` je Regel und Anfrage).
- Cron (`/api/cron/follow-ups`, täglich): sendet fällige, nicht gesendete, nicht stornierte Follow-ups, wenn `answer_received_at` null und Status nicht `abgeschlossen`. «Antwort erhalten» im Admin setzt `answer_received_at` und storniert offene Follow-ups.

## Posten 3, Schnellweg (`lib/ai/extract.ts`)

- Vor dem Schreiben des Codes den Skill `claude-api` laden (Modell-IDs, Structured Output, Tool Use).
- Eingabe: Freitext. Claude erhält den Katalog kompakt (Familien, Modelle, Produktnamen je Kategorie) und liefert per Tool-Aufruf ein JSON: Fahrzeug (family_slug, model_slug, confidence), Kategorien, gewählte Produkte (product_id, confidence), Charakter, Termin, Kontakt, offene Fragen. Unsichere Zuordnungen (`confidence < 0.7`) werden im Admin markiert.
- Admin prüft, korrigiert (Dropdowns), klickt «Anfrage anlegen» → `source = quick`, danach derselbe Weg wie eine Tool-Anfrage (ohne Bestätigungsmail an den Kunden).

## Excel-Import im Admin

Mehrfach-Upload (alle 42 Dateien auf einmal oder einzelne). Jede Datei wird geparst (`docs/excel-import.md`), Familien werden über `slug(name)` gematcht, Fallback `source_file`. Diff je Familie: neue Modelle, neue Produkte, Preisänderungen (alt → neu), entfernte Produkte, geänderte Fitments. Anzeige, dann «Übernehmen». Beim Übernehmen: nur die hochgeladenen Familien werden ersetzt (Produkte der Familie: Zuordnung bestehend ↔ neu zuerst über `content_hash` (unverändert), dann über `article_no` + `name` (geändert, z. B. Preis), Rest neu; nicht mehr vorhandene → `active = false`). Admin-Felder (`photo_url`, `short_text`, `series_ps`, `series_nm`, `sort`) bleiben erhalten. Familien, die nicht hochgeladen wurden, bleiben unverändert.

## Design

Tokens aus `docs/vorschau.html` in `app/globals.css` als Tailwind `@theme`: Hintergrund `#121516` / `#171b1c`, Panel `#1c2122` / `#22282a`, Linien `#2b3234` / `#3a4346`, Text `#f1f2f2`, Muted `#9aa3a5`, Dim `#626b6d`, Rot `#e21014` / `#f0393d`, OK `#3dbe7a`, Warn `#e2a83c`. Fonts: Barlow Condensed (Display, Uppercase), Barlow (Body), IBM Plex Mono (Preise) via `next/font/google`. Kacheln, Chips, Fortschrittsbalken, Vorher/Nachher-Tabelle, Summary-Box exakt wie Vorschau. Mobile first: Kacheln 1-spaltig unter 480 px, 2-spaltig bis 800 px. Admin: gleiches Farbsystem, dichter, Tabellen mit `overflow-x: auto`.

## Umgebungsvariablen (`.env.example`)

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

## Konventionen

- Sprache im Code: Englisch für Bezeichner, Deutsch für Kommentare erlaubt. UI-Texte nur über i18n.
- Keine Preise oder Produkte im Code. Startfotos und Familienreihenfolge dürfen in `supabase/seed.sql` stehen.
- Jede Route-Handler-Datei validiert mit zod und antwortet JSON `{ ok: true, ... }` oder `{ ok: false, error }`.
- `npm run lint`, `npm run typecheck`, `npm test` müssen grün sein, `npm run build` muss durchlaufen.
