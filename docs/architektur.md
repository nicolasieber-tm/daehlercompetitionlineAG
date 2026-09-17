# Architektur und Spezifikation (verbindlich für die Umsetzung)

Ergänzt `CLAUDE.md`. Bei Widerspruch gilt `CLAUDE.md`. Dieses Dokument legt fest, was `CLAUDE.md` offen lässt: Datenmodell, Ordnerstruktur, API, Mail, i18n, Regeln, Deploy.

## Stack (fix)

- Next.js 15, App Router, TypeScript strict, React 19. Paketmanager: npm.
- Tailwind CSS v4 (CSS-first `@theme`), keine UI-Bibliothek. Design-Tokens aus `docs/vorschau.html` übernehmen (siehe Abschnitt Design).
- Postgres (lokal: Docker-Container `docker-compose.yml`, Port 5433; produktiv: Railway-Plugin). Zugriff ausschliesslich serverseitig über `lib/db/client.ts` (Paket `postgres`, kein PostgREST, keine RLS). Migrationen in `db/migrations/*.sql`, Runner `scripts/migrate.ts`, Row-Typen handgepflegt in `lib/db/rows.ts`.
- Admin-Login über `better-auth` (`lib/auth/`): E-Mail + Passwort, Sessions in Postgres, zwei feste Konten (`scripts/create-admin-users.ts`).
- Fotos (Baureihen/Modelle) als `bytea` in der Tabelle `photos`, ausgeliefert über `GET /api/photos/[id]` (ETag, `Cache-Control: immutable`).
- Resend (`resend` npm) für Mail. Anthropic SDK (`@anthropic-ai/sdk`) für Posten 3 und optionales Polieren des Antwortentwurfs.
- SheetJS (`xlsx`, Build von cdn.sheetjs.com 0.20.x) für `.xls` (BIFF8) und `.xlsx`.
- Validierung: `zod`. Tests: `vitest`. E2E: `@playwright/test` (nur Smoke).
- Hosting: Railway, ein App-Service (`npm run build` / `npm start`, `railway.json`/Railpack). Follow-ups (Posten 6) laufen als interner Timer im selben Prozess (`lib/followups/scheduler.ts`, `instrumentation.ts`), kein separater Cron-Service; `/api/cron/follow-ups` bleibt als manueller Auslöser (`scripts/cron-followups.ts`). Backups über Railway Pro Volume-Backups, `scripts/backup.sh` nur noch manuell. Details: `docs/deploy-railway.md`.
- **Entscheid 16.09.2026** (`docs/umbau-railway.md`): bis zu diesem Datum lief die App auf Supabase (Postgres über supabase-js/PostgREST, Supabase Auth, Storage-Buckets `model-photos`/`imports`, lokal `npx supabase start`). Supabase entfiel vollständig (Projektkontingent der Organisation erschöpft, zweiter Anbieter unerwünscht) und wurde durch die oben beschriebene Railway-only-Lösung ersetzt (`@supabase/*` und der Ordner `supabase/` sind aus dem Repo entfernt); aktueller Stand und Details: `docs/db.md`. **Ergänzung 16.09.2026:** kein eigener Cron-/Backup-Service mehr, siehe oben und `docs/umbau-railway.md`.

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
    auth/[...all]/route.ts              better-auth-Handler (Login/Logout/Session)
    cron/follow-ups/route.ts            GET/POST, Header `Authorization: Bearer $CRON_SECRET`
    health/route.ts                     Railway-Healthcheck (`select 1`)
components/
  flow/        Schritte des Kundenflows (Client Components)
  admin/       Admin-UI
  ui/          Basisbausteine (Tile, Chip, Button, Field, Progress, Summary)
lib/
  db/          client.ts (`postgres`-Pool), rows.ts (Row-Typen), helpers.ts
  auth/        server.ts (better-auth-Instanz, `requireAdmin`), client.ts (Login-Formular)
  pricelist/   parser.ts, diff.ts, apply.ts, types.ts  (siehe docs/excel-import.md)
  catalog/     queries.ts (Familien, Modelle, Produkte), categories.ts (Mapping, Reihenfolge, Texte), variant-groups.ts, upsell.ts
  inquiry/     create.ts, number.ts, summary.ts (Textzusammenfassung), share.ts
  rules/       checks.ts (Prüfhinweise, eine Datei)
  draft/       template.ts (deterministischer Antwortentwurf), polish.ts (optional KI)
  mail/        resend.ts (Versand + Override + BCC), templates/*.ts (HTML + Text)
  followups/   schedule.ts, run.ts
  ai/          extract.ts (Posten 3), client.ts
  i18n/        de.ts, en.ts, index.ts (t(), Locale-Context), format.ts (CHF, Datum)
db/
  migrations/*.sql (Runner: scripts/migrate.ts), seed.sql
scripts/
  parse-pricelists.ts     CLI: alle Dateien in docs/preislisten parsen, JSON + Statistik ausgeben
  import-pricelists.ts    CLI: Erstbefüllung in die DB (nutzt lib/pricelist/apply.ts)
  migrate.ts               Migrationsrunner (`--seed`, `--status`)
  create-admin-users.ts    Legt die zwei Admin-Konten an (better-auth)
  cron-followups.ts        Ruft `/api/cron/follow-ups` auf (manueller Auslöser, lokal bzw. Admin "Fällige jetzt senden"; der automatische Versand läuft über lib/followups/scheduler.ts)
  backup.sh                Manueller `pg_dump | gzip` Ad-hoc-Dump (Backups laufen sonst über Railway Pro Volume-Backups)
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
- `gearbox text` (manual | automatic | null, aus dem Namen abgeleitet, siehe `lib/catalog/gearbox.ts`; Ergänzung 15.09.2026, Rückmeldung erster Klicktest) - kein Excel-Feld, wird bei jedem Import neu berechnet, auch bei unverändertem `content_hash` (siehe `docs/excel-import.md`, Abschnitt "Abgeleitete Felder bei unverändertem content_hash")
- `fits_all bool` (true, wenn die Zeile keine Marker hat), `sort int`, `source_row int`, `content_hash text` (nicht unique, nur Index), `active bool`

`product_fitment` (`product_id`, `model_id`) PK — welche Variante das Produkt bekommt.

`pricelist_notes` — Hinweistexte aus der Excel (Garantie, Gutachten), `family_id`, `category`, `text`, `sort`.

`pricelist_imports`
- `filenames text[]`, `status text` (pending | applied | discarded), `diff jsonb`, `summary jsonb` (Zähler neu/geändert/entfernt je Familie), `applied_at`, `created_by text` (better-auth-User-Id, keine UUID, siehe `docs/db.md`)
- Der Import ist zweistufig: Upload erzeugt `pending` mit Diff, «Übernehmen» wendet an.

### Anfragen

`inquiries`
- `number text unique` (Format `JJJJ-NNNN`, Sequenz pro Jahr via Postgres-Funktion `next_inquiry_number()`)
- `status text` (neu | in_bearbeitung | beantwortet | abgeschlossen), `source text` (web | quick), `locale text` (de | en)
- `family_id`, `model_id` (nullable), `vehicle_text text` (Freitext, wenn kein Modell zuordenbar), `year text`, `been_here bool`
- `gearbox text` (manual | automatic | unknown | null; Ergänzung 15.09.2026, Rückmeldung erster Klicktest) - Antwort auf die Getriebefrage im Fahrzeug-Schritt (nur gestellt, wenn das Modell mindestens ein getriebespezifisches Produkt hat); `unknown` ist ein eigener, gespeicherter Wert («Weiss ich nicht»), `null` bedeutet: Frage nicht gestellt
- `categories text[]`, `consulting bool` (Komplettpaket), `selections jsonb` (Array `{product_id, category, name, description, price_total, price_status, ps_to, nm_to, variant_group}`; `ps_to`/`nm_to`/`variant_group` seit **Korrektur 15.09.2026** (Prüfung Modul Produkte, Befund 2/4) mitgespeichert - ohne sie kennt `lib/inquiry/context.ts` `parseItems()` beim späteren Mailversand weder die Zielleistung noch, ob eine Position eine Leistungsstufe ist, siehe unten), `follow_up_answers jsonb` (`{motor: '...', auspuff: '...'}`)
- `character text` (dezent | sportlich | maximum), `timing text` (asap | m1_2 | m3_6 | flexible)
- `series_ps int` (nullable; Rückmeldung zweiter Klicktest, ursprünglich `supabase/migrations/20260916010000_inquiries_series_ps.sql`, inzwischen konsolidiert in `db/migrations/0001_init.sql`) - effektiv wirksame Serienleistung zum Zeitpunkt der Anfrage (`models.series_ps`, sonst die im Fahrzeug-Schritt gewählte Serienleistungs-Chip-Auswahl, `effectiveSeriesPs()`). `models.series_ps` allein reicht nach dem Absenden nicht mehr: bei mehreren `series_ps_suggested`-Werten (z. B. M2 G87 «M2»: 460/480 PS) bleibt es dauerhaft `null`, die tatsächliche Wahl wäre sonst verloren. Für die Vorher/Nachher-Leistungszeile auf Abschluss-Screen, Teilen-Seite und Bestätigungs-/Zusammenfassungsmail (siehe unten); `models.series_nm` bleibt unverändert per Join gelesen (statisch je Modell, keine eigene Spalte nötig).
- `line text` (nullable, Ergänzung 17.09.2026, Kundenentscheid „bei X1 und X2 gibt es dieselben Motorisierungen, das Modell ist X1 oder X2“, siehe `db/migrations/0004_inquiries_line.sql`) - im Fahrzeug-Schritt gewählte Alternative bei mehrdeutiger Baureihe (`vehicleLineOptions()`-Id, z. B. `x2`), `null` wenn die Frage nicht gestellt wurde (Baureihe eindeutig) oder unbeantwortet blieb. Siehe Abschnitt „Fahrzeugbezeichnung“ Regel 6.
- `first_name, last_name, email, channel (phone | email | whatsapp), message` (Pflicht wie bisher, siehe `viewContact()`/`canNext()` in `docs/vorschau.html`)
- `city, phone` (beide nullable, Rückmeldung zweiter Klicktest: leerer String zählt als `null`). Ort ist nie Pflicht. Telefon ist optional, ausser bei `channel` «phone» oder «whatsapp» - dann Pflicht (Validierung in `lib/inquiry/schema.ts` `InquiryPayloadSchema`, nicht im geteilten `withInquiryPayloadRefinements()`: der Schnellweg, `lib/ai/to-payload.ts` `QuickInquiryPayloadSchema`, verlangt unverändert nur «Telefon ODER E-Mail», unabhängig vom Kanal). Zusammenfassungen und Admin lassen den Ort weg, wenn `null` (kein leeres Feld, kein «, »-Rest, z. B. `lib/inquiry/summary.ts`, `lib/mail/templates/inbox.ts`, `components/admin/InquiriesTable.tsx`).
- Alle Auswahlwerte (timing, channel, character, follow_up_answers) werden als sprachneutrale IDs gespeichert; die Dictionaries liefern `{ id, label }`-Optionen, Anzeige und Mails lösen über die ID auf.
- `estimated_total numeric`, `checks jsonb` (Array von `{id, text}`), `draft_subject text`, `draft_reply text`
- `share_token text unique` (URL-sicher, 22 Zeichen), `raw_text text` (Schnellweg), `ai_extraction jsonb`
- `replied_at timestamptz`, `answer_received_at timestamptz`

`outbound_emails`: `inquiry_id`, `type` (confirmation | inbox | summary | reply | follow_up), `to_email`, `subject`, `body_text`, `resend_id`, `status`, `error`, `sent_at`.

`follow_up_rules`: `name`, `days_after_reply int`, `subject text`, `body text` (Platzhalter `{{vorname}}`, `{{name}}`, `{{fahrzeug}}`, `{{nummer}}`), `max_count int`, `active bool`, `sort int`.

`follow_ups`: `inquiry_id`, `rule_id`, `scheduled_for date`, `sent_at`, `cancelled_at`, `outbound_email_id`.

`settings`: `key text pk`, `value text`. Schlüssel: `mail_from_name`, `mail_from`, `mail_inbox`, `mail_bcc`, `mail_reply_to`, `signature_name`, `signature_phone`, `company_address`.

### Sicherheit

- Keine Row Level Security, keine PostgREST-Rollen (`anon`/`authenticated`/`service_role`): jeder Zugriff läuft ausnahmslos serverseitig durch die App über den einen Postgres-Pool (`lib/db/client.ts`), der Browser spricht nie direkt mit der DB. `next_inquiry_number()` und die übrigen DB-Funktionen laufen mit den vollen Rechten dieser einen Verbindung.
- Admin = jeder authentifizierte `better-auth`-User (zwei Konten: dÄHLer, Trending Media). Kein Rollenmodell. Login/Session siehe `lib/auth/`, `docs/db.md` Abschnitt "Admin-Konten".
- `/admin/*` und `/api/admin/*` durch `middleware.ts` geschützt (Redirect auf `/admin/login`), `requireAdmin()`/`getAdminUser()` (`lib/admin/auth.ts`) prüfen serverseitig zusätzlich die Session.
- **Entscheid 16.09.2026** (`docs/umbau-railway.md`): bis zu diesem Datum lief die Absicherung über Supabase (RLS auf allen Tabellen, Katalogtabellen mit `select` für `anon` nur auf `active = true`, PostgREST-Rollen `anon`/`authenticated`/`service_role`, Supabase Auth). Mit dem Wegfall von Supabase entfielen RLS und die PostgREST-Rollen ersatzlos; an ihre Stelle traten die oben beschriebene rein serverseitige Zugriffskontrolle und `better-auth`.

## Kundenflow (Details zur Vorschau)

Schrittfolge: `car` → `wish` → je gewählte Kategorie `cat:<id>` → `character` → `contact` → `done`. Zustand im Client (`useReducer`), nicht in der URL. Fortschrittsbalken wie Vorschau.

1. **Fahrzeug**: Marken-Chips (BMW, MINI, Toyota, Wiesmann). Familien-Kacheln mit Foto (Fallback: Kachel ohne Foto, Text «Foto folgt» nur im Admin, nicht im Flow). Nach Wahl der Familie: Motorisierungs-Chips (`models`), gruppiert nach `fuel`. Wenn `series_ps_suggested` mehrere Werte hat und `series_ps` nicht gesetzt ist: Chips «Serienleistung: 460 PS / 480 PS» zur Auswahl (filtert Leistungsprodukte nach `ps_base`). Ist die Baureihe für die gewählte Motorisierung mehrdeutig (`vehicleLineOptions()`, siehe Abschnitt „Fahrzeugbezeichnung“ Regel 6, z. B. X1/X2): zusätzlich Pflicht-Chips «Welches Modell fahren Sie?» (`inquiries.line`). Baujahr-Select, «Schon mal bei uns gewesen». Serien-PS/Nm anzeigen, wenn bekannt.
   - **Getriebefrage** (Ergänzung 15.09.2026, Rückmeldung erster Klicktest): wenn das gewählte Modell mindestens ein Produkt mit `gearbox != null` hat (`CatalogModel.hasGearboxSpecificProducts`, `lib/catalog/queries.ts`), Chips «Handschalter» / «Automat» / «Weiss ich nicht», Pflicht vor «Weiter» wie die Serienleistungs-Chips. Steuert im Kategorie-Schritt die Sichtbarkeit getriebespezifischer Produkte (`manual` blendet `automatic` aus und umgekehrt, `unknown`/unbeantwortet zeigt alle).
   - Wiesmann und Familien mit `has_pricelist = false` sowie Baujahr «älter» → **Kurzablauf**: `wish` (nur Kategorien, keine Produkte) → `character` → `contact` → `done` ohne Preise.
2. **Wunsch**: 6 Foto-Kacheln (Texte in `lib/catalog/categories.ts`), Mehrfachauswahl, Kachel «Komplettpaket, beraten Sie mich».
3. **Kategorie-Schritt**: Produkte des Modells (`product_fitment` oder `fits_all`), nach `group_label` gruppiert, Reihenfolge `sort`. Kachel: Titel/Nebenzeile/Detail aus `lib/catalog/product-display.ts` `productDisplay()` (Ergänzung 15.09.2026, Rückmeldung erster Klicktest: löst mehrdeutige Leistungsstufen-Kacheln auf, z. B. zwei M2-G87-Stufe-1-Varianten mit identischer Basis-Angabe - Titel «Stufe 1» bzw. «Stufe 1 mit V/max-Aufhebung», Nebenzeile «590 PS / 720 Nm», Detail «M6 & A8-Getriebe»; **Korrektur 15.09.2026**, Prüfung Modul Parser: `description` fliesst jetzt mit ein, siehe `docs/excel-import.md` Abschnitt "Abgeleitete Produkttitel"), «ab CHF 4'180» oder «in Vorbereitung» / «auf Anfrage». Gleiche `variant_group` = exklusiv, sonst kombinierbar. Motor/Auspuff/Fahrwerk sind zusätzlich in Zwischenüberschriften gegliedert (generisch über `variant_group`/`source_category`, nicht über Namenslisten, siehe `components/flow/steps/CategoryStep.tsx` `buildSubsections()`): Motor «Leistungsstufen» / «Weitere Optionen» / «Kraftübertragung»; Auspuff «Anlagen» / «Endrohre» / «Weitere Optionen» / «Active-Sound»; Fahrwerk «Fahrwerk» / «Weitere Optionen» / «Bremse». Getriebespezifische Produkte werden zusätzlich nach der Getriebefrage aus Schritt 1 gefiltert (siehe dort). Folgefrage je Kategorie (Motor, Auspuff, Fahrwerk, Räder) wie Vorschau. Motor: PS-Zähler Serie → Ziel (`ps_to` des gewählten Leistungsprodukts). «Passt gut dazu» (`lib/catalog/upsell.ts`, Texte wie Vorschau, Sie-Form): schlägt eine nicht gewählte Kategorie vor, «Dazunehmen» fügt sie als nächsten Schritt ein.
   - Unterhalb der Produkte: Hinweise aus `pricelist_notes` der Kategorie als Kleingedrucktes (z. B. Ergänzungsgarantie).
   - **V/max-Doppelung** (Rückmeldung zweiter Klicktest): wählt der Kunde eine Motor-Leistungsstufe, deren Name die V/max-Aufhebung bereits enthält (`lib/catalog/product-display.ts` `hasVmaxLift()`, dasselbe Muster wie der Titel-Zusatz), wird jedes andere Motor-Produkt, das keine Leistungsstufe ist (`isStageProduct()`) und ebenfalls V/max im Namen trägt (z. B. M2 G87 «Aufhebung der serienmässigen V/max Begrenzung», ein eigenständiges Produkt, NICHT in `variant_group` «leistung» und damit ausserhalb der normalen Exklusivgruppen-Logik), als gesperrt dargestellt: Kachel ausgegraut, nicht wählbar, Hinweis «In {Stufe} enthalten» (`steps.category.includedInStage`). War es bereits gewählt, entfernt der Reducer es automatisch beim Wählen der Stufe, und umgekehrt (Einzel-V/max zuerst, danach die Stufe) mit demselben Ergebnis (`components/flow/state.ts` `isVmaxLocked()`/`vmaxLiftStage()`, `PICK_PRODUCT`). Der Prüfhinweis `vmax_doppelt` (`lib/rules/checks.ts`) bleibt unverändert als Sicherheitsnetz für den (durch die Sperre eigentlich ausgeschlossenen) Fall einer bereits gespeicherten, älteren Anfrage.
4. **Charakter**: Dezent / Sportlich / Maximum + optionales Freitextfeld.
5. **Termin und Kontakt**: Zeitraum-Chips (So bald wie möglich, in 1 bis 2 Monaten, in 3 bis 6 Monaten, Flexibel), Felder (Vorname, Name, Ort optional, Telefon optional ausser bei Kanal Telefon/WhatsApp, E-Mail), bevorzugter Kanal (Telefon, E-Mail, WhatsApp), Datenschutzhinweis. Submit → `POST /api/inquiries`.
6. **Abschluss**: Nummer, Foto, Vorher/Nachher-Tabelle, Paket mit Richtsumme, «Paket als Link teilen» (kopiert `/p/<token>`, Web Share API auf Mobile), «Zusammenfassung an mich senden» (ruft `summary-mail`), nächste Schritte.
   - **Vorher/Nachher-Leistung** (Rückmeldung zweiter Klicktest, wie `beforeAfter()` in `docs/vorschau.html`): die Zeile «Leistung» zeigt vorher die Serienleistung (`seriesPs`/`seriesNm`, siehe `inquiries.series_ps` oben; `series_nm` nur wenn bekannt), nachher `ps_to`/`nm_to` der gewählten Leistungsstufe, beide als grosse Zahl in der Display-Schrift (`components/ui/PowerValue.tsx`, wie `.stat b`/`.delta .n` in der Vorschau), Einheit klein, dazu ein grünes Plus «+160 PS» (zusätzlich «+x Nm», wenn beide Nm-Werte bekannt sind). Ohne gewählte Stufe bleibt die bisherige Text-Darstellung (Serienleistung, «Beratung» bzw. gewählte Motor-Optionen). Reine Rechen-/Textfunktionen in `lib/catalog/power-before-after.ts` (`buildPowerBeforeAfter()`, `formatPowerLine()`). **Ergänzung 16.09.2026** (Kundenwunsch: dieselbe Vorher/Nachher-Übersicht auch in den Kundenmails): die gesamte Zeilen-Herleitung (nicht nur die Leistungszahlen) liegt seither gemeinsam in `lib/catalog/before-after.ts` `buildBeforeAfterRows()`, verwendet von `components/flow/beforeAfter.ts` (dünner camelCase-Adapter für Abschluss-Screen/Teilen-Seite, unveränderte Ausgabe) UND von `lib/mail/render.ts` `beforeAfterTable()` (siehe unten) - die frühere einzelne Mail-Zeile `motorPowerLine()`/«Leistung: 460 PS → 620 PS / 740 Nm (+160 PS)» in der `definitionList` ist entfallen, dieselbe Information steht jetzt in der Tabelle.

Texte: Sie-Form, Schweizer Schreibweise, keine Gedankenstriche in Kundentexten. Preise `CHF 4'180`. Richtsumme = Summe `price_total` der gewählten Produkte, Hinweis «unverbindlich, Kompatibilität wird geprüft» wenn Positionen ohne Preis dabei sind zusätzlich «ohne Positionen auf Anfrage».

## Fahrzeugbezeichnung (`lib/catalog/vehicle-label.ts`, Stand 15.09.2026, Feinschliff 15.09.2026, Modellwahl 17.09.2026)

Eine reine Funktion `vehicleDisplayLabel({ brand, name, codes, has_pricelist }, model | null, vehicleText | null)` liefert überall dieselbe, natürlich lesbare Bezeichnung (Flow, Abschluss, Teilen-Seite, Mails, Betreff, Antwortentwurf, Admin). Regel:

1. **Linie** = Familienname ohne die Codes (`codes[]` aus dem Import, Tokens wie `G20`, `F87`, `NA5`) und ohne Trennzeichen-Reste; Markenwort am Anfang der Linie (MINI, TOYOTA) wird nicht doppelt ausgegeben. Enthält die Linie Alternativen (`/` oder `,`), z. B. `M3 / M4`, `M2 / M2 Competition / M2 CS`, `X3M, X4M`, `8er / M8`, wird die Alternative gewählt, die die meisten Wörter mit der Motorisierung teilt (Vergleich ohne Leerzeichen und Gross/Klein: `X3M` = `X3 M`); teilt keine ein Wort, gilt die erste Alternative. **Ausnahme 8er/M8 (Ergänzung 15.09.2026, Feinschliff-Prüfung):** eine Alternative, die selbst ein M-Modell bezeichnet (Segmentname passt auf `/^M\d(?:$|[\s/])/`, also „M“ + genau eine Ziffer, danach Wortende, Leerzeichen oder `/` - `M8`, `M5`, `M3`, `M2`, `M3 CS`, `M2 Competition`, `M3/Comp.`), zählt nicht als Alternative, wenn die Motorisierung selbst kein M-Modell ist (dieselbe Prüfung auf die Motorisierung angewendet - bewusst NICHT „beginnt mit M + Ziffer“, sonst erfasste das auch M-Performance-Motorisierungen wie `M35i`, `M40i`, `M40d`, `M50`, `M50i`, `M50d`, `M60i`, `M135i`, `M235i`, `M550d`, `M760i`, die keine M-Modelle sind - Stichprobe `X3 G45 M50` in den aktiven Daten). `BMW 8er 40i (G14, G15, G16)` ist damit eindeutig: `M8` scheidet für `40i` von vornherein aus, unabhängig vom Wortvergleich. Ist die Motorisierung selbst ein M-Modell (`M8`, `M5`, `M6`, ...), gilt die Ausnahme nicht, alle Alternativen bleiben im Rennen. Siehe `isMModelName()`/`applicableSegments()` in `lib/catalog/vehicle-label.ts`.
2. **Motorisierung**: Wörter der Motorisierung, die schon in der gewählten Linie stehen, werden weggelassen; der Rest wird angehängt (`M2` + `M2` → `M2`; `M2` + `M2 CS` → `M2 CS`; `3er` + `M40i` → `3er M40i`; `M3` + `M3 Touring` → `M3 Touring`; `MINI Countryman` + `Cooper S` → `MINI Countryman Cooper S`).
3. **Codes** in Klammern, wenn vorhanden. **Präzisierung 15.09.2026** (Feinschliff-Prüfung): besteht der Familienname aus Alternativ-Segmenten, die im Text jeweils ihre EIGENEN Codes tragen (ein Code-Token folgt direkt auf das Alternativ-Wort, getrennt durch Leerzeichen, `,` oder `/`, z. B. `X1 U11 / X2 U10`, `8er G14, G15, G16 / M8 F91, F92, F93`, `M5 F10, M6 F06, F12, F13`, `X3M F97, X4M F98`, `X5M F95/LCI, X6M F96/LCI`), kommen in die Klammer nur die Codes der GEWÄHLTEN Alternative: `BMW M8 (F91, F92, F93)`, `BMW 8er 40i (G14, G15, G16)`, `BMW M6 (F06, F12, F13)`, `BMW M5 (F10)`, `BMW X3 M (F97)`, `BMW X5M (F95)`. Hat die gewählte Alternative keine eigenen Codes (kein Code-Token folgt ihr direkt, bevor die nächste Alternative beginnt, z. B. `M3` in `M3 / M4 G80, G81, G82, G83`), gelten ersatzweise alle Codes der Familie: `BMW M3 Touring (G80, G81, G82, G83)`. Generisch über die Reihenfolge der Tokens hergeleitet (`analyzeFamily()`), keine Namenslisten. Einfache Fälle ohne Alternativen bleiben unverändert: `BMW M2 (G87)`, `BMW 3er M40i (G20, G21)`, `MINI Countryman Cooper S (F60)`, `Toyota GR Supra 3.0i` (keine Codes → keine Klammer). Enthält die Motorisierung selbst schon eine Klammer (Kraftstoffart aus dem Excel-Namen, z. B. `Countryman One (Benzin)`, `Cooper SE (Electric)`), werden ihr Inhalt und die Codes zu EINER Klammer verschmolzen statt zwei Klammern hintereinander zu setzen: `MINI Countryman One (Benzin, F60)`, `MINI Clubman Cooper SE (Electric, F54)`.
4. **Ohne Motorisierung** (Kurzablauf, Platzhalter): `Marke + vehicleText` (`Wiesmann MF4`, `BMW E46 M3`); ohne vehicleText: `Marke + Linie` (`BMW Älteres Modell`). Ein Markenwort, das mitten im (von Hand gepflegten) Familiennamen steht statt am Anfang (z. B. „Älteres MINI-Modell“), wird in der Linie ebenfalls entfernt, bevor die Marke sauber davorgesetzt wird - sonst „MINI Älteres MINI-Modell“ (Feinschliff-Prüfung 15.09.2026). Die ausgelieferten Platzhalter-Familien (`db/seed.sql`) heissen deshalb einheitlich `Älteres Modell` (BMW, MINI), `Anderes Modell` (Toyota) und `Wiesmann` (Wiesmann), ohne Markenwort im Namen.
5. Intern (Anfrage-Mail, Admin-Detail, Zusammenfassung) steht zusätzlich die Zeile **Baureihe: `<Familienname>` · Motorisierung: `<Modellname>`**, damit dÄHLer die Preisliste sofort zuordnen kann.

Betreff-Beispiel: «Ihre Anfrage für den BMW M2 (G87), Nr. 2026-0012». Dank-Absatz mit Baujahr: «Danke für Ihre Anfrage für Ihren BMW M2 (G87), Jahrgang 2026.» (Komma statt einer zweiten Klammer hinter den Codes, siehe `draft.yearSuffix` in `lib/i18n/de.ts`/`en.ts` - Feinschliff-Prüfung 15.09.2026, Befund „Doppelklammer“).

**Mehrdeutige Baureihen (Ergänzung 15.09.2026, Feinschliff-Prüfung; kundensichtbar behoben 15.09.2026):** Baureihen, die mehrere Modelle unter denselben Motorisierungsnamen führen (`X1`/`X2`, `X3`/`X4`, `X5`/`X6` - je zwei Karosserieformen derselben Technik, gleiche Antriebe/Ausstattungslinien; ebenso `4er Coupé`/`Cabrio`/`Grand Coupé`), kann die Formel nicht auflösen: teilt die Motorisierung mit KEINER der (nach der Ausnahme 8er/M8 oben verbleibenden) Alternativen ein Wort (z. B. eine reine Antriebsbezeichnung wie `20d`, die es für beide/alle gibt), wählt Regel 1 nicht mehr stillschweigend die erste Alternative - ohne Grundlage, welches der Modelle der Kunde tatsächlich hat. Stattdessen zeigt die Linie ALLE verbleibenden Alternativen, durch ` / ` verbunden (Schreibweise wie im Familiennamen übernommen, z. B. `Grand Coupé`), mit ALLEN ihren Codes in der Klammer:

- `BMW X1 / X2 20i (U11, U10)` (Familie `X1 U11 / X2 U10`)
- `BMW X3 / X4 20i (G01, G02)` (Familie `X3 G01, X4 G02`)
- `BMW X5 / X6 40i (G05, G06)` (Familie `X5 G05, X6 G06`)
- `BMW 4er Coupé / Cabrio / Grand Coupé 20i (G22, G23, G26)` (Familie `4er Coupé G22, Cabrio G23, Grand Coupé G26`)

Nicht mehrdeutig bleibt, was die Motorisierung eindeutig einer Alternative zuordnet (`BMW X1 (U11)` für `X1`, `BMW M8 (F91, F92, F93)` für `M8`) oder wo die Ausnahme 8er/M8 nur eine Alternative übrig lässt (`BMW 8er 40i (G14, G15, G16)` für `40i` - `M8` scheidet aus, `8er` bleibt als einzige, eindeutige Alternative). `lib/catalog/vehicle-label.ts` exportiert dafür `vehicleLineIsAmbiguous(family, model)` (die Bool-Prüfung) und `vehicleAmbiguousAlternatives(family, model)` (die gezeigten Alternativ-Namen, leer wenn nicht mehrdeutig) - `vehicleDisplayLabel()` nutzt beide für die Linie selbst, `lib/rules/checks.ts` dieselbe Liste für den Prüfhinweis `modell_mehrdeutig` («Baureihe umfasst {alternatives}, Modell beim Kunden klären», `{alternatives}` z. B. `X1 / X2`), der dÄHLer weiterhin zur manuellen Klärung auffordert, wenn keine gültige Modellwahl gespeichert ist (siehe Regel 6).

**6. Gewählte Alternative (Kundenentscheid 17.09.2026, «bei X1 und X2 gibt es dieselben Motorisierungen, das Modell ist X1 oder X2»):** statt der Baureihe eine eigene Excel-Zeile pro Modell zu geben, fragt der Flow bei einer mehrdeutigen Baureihe (Regel 1, Ausnahme oben) direkt «Welches Modell fahren Sie?» und speichert die Antwort als `inquiries.line` (Text-Id, z. B. `x2`, siehe `db/migrations/0004_inquiries_line.sql`). `vehicleLineOptions(family, model | null)` liefert die wählbaren Alternativen als `{ id, label, codes }` (leer, wenn die Familie für das Modell NICHT mehrdeutig ist oder ohne Modell) - `id` ist der Slug des Alternativ-Namens (`X2` → `x2`, `Grand Coupé` → `grand-coupe`, Diakritika entfernt), `codes` die eigenen Codes dieser Alternative (Regel 3). `vehicleDisplayLabel()` bekommt dafür einen optionalen vierten Parameter `lineId`: ist er gesetzt und unter den aktuellen Optionen gültig, wird GENAU diese Alternative mit ihren eigenen Codes verwendet (`BMW X2 20i (U10)`, `BMW 4er Cabrio 20i (G23)`) statt der Sammelform aus Regel 1 (`BMW X1 / X2 20i (U11, U10)`) - ein ungültiger/veralteter Wert (Baureihe seit dem letzten Import nicht mehr mehrdeutig, oder eine unbekannte Id) verhält sich wie kein `lineId` (Sammelform bleibt der sichere Rückfall). `vehicleInternalLine()` ergänzt bei gültigem `lineId` «· Modell: X2» an die interne Zeile. `lib/inquiry/create.ts` prüft den vom Client gesendeten Wert bei jeder Anfrage erneut gegen `vehicleLineOptions()` (nie ungeprüft übernehmen) und speichert bei einem ungültigen Wert `null` statt eines manipulierten Strings; der Prüfhinweis `modell_mehrdeutig` (siehe oben) feuert dadurch nur noch, wenn KEINE gültige Wahl vorliegt (Kundenflow erzwingt sie vor «Weiter», nur der Schnellweg ohne Angabe bzw. eine per Freitext nicht zuordenbare Extraktion lässt sie offen). Schnellweg: `lib/ai/extract.ts` liefert zusätzlich `vehicle.line` (frei erkannter Modellname, z. B. `"X2"`, kein Slug aus einer Liste), `lib/ai/to-payload.ts` gleicht ihn per Label-Vergleich gegen `vehicleLineOptions()` ab, `QuickInquiryForm.tsx` zeigt bei mehrdeutiger Familie zusätzlich ein Modell-Dropdown zum manuellen Nachtragen/Korrigieren.

## i18n

Eigene, leichte Lösung ohne Routing: `lib/i18n/de.ts` und `en.ts` exportieren dasselbe typisierte Objekt. `LocaleProvider` (Client) liest Cookie `lang` (de | en), Umschalter im Kopf des Flows. Serverseitig liest `layout.tsx` das Cookie und setzt `<html lang>`. Produktnamen und Beschreibungen bleiben Deutsch (aus der Excel). Mails und Antwortentwurf verwenden `inquiries.locale`. Alle Kundentexte, Kategorie-Texte, Folgefragen, Upsell-Texte, Prüfhinweise und Mailvorlagen in den Dictionaries, nie hart im JSX.

## Anfrage anlegen (`lib/inquiry/create.ts`)

1. Zod-Validierung des Payloads. 2. Produkte aus DB nachladen (Preise nie vom Client übernehmen). 3. `number` via `next_inquiry_number()`. 4. `checks` via `lib/rules/checks.ts`. 5. `estimated_total`. 6. `draft_subject`, `draft_reply` via `lib/draft/template.ts`. 7. `share_token`. 8. Insert. 9. Mails: Bestätigung an Kunde (Typ `confirmation`), Anfrage-Mail an `settings.mail_inbox` (Typ `inbox`) mit Zusammenfassung (`lib/inquiry/summary.ts`, Format wie Ticket in der Vorschau), Prüfhinweisen, Antwortentwurf und Link `/admin/anfragen/<id>`. Mailfehler dürfen die Anfrage nicht verlieren: Anfrage zuerst speichern, Mailfehler in `outbound_emails.error`.

## Prüfhinweise (`lib/rules/checks.ts`)

Array von Regeln `{ id, text: {de, en}, when: (ctx) => boolean }` mit `ctx = { inquiry, products, model, family }`. Regeln aus `CLAUDE.md` plus: Familie ohne Preisliste, Produkt mit `price_status !== 'priced'` gewählt, Komplettpaket gewünscht. Ergänzung 15.09.2026 (Rückmeldung erster Klicktest): `getriebe_unbekannt` (ein getriebespezifisches Produkt wurde gewählt, `inquiries.gearbox` ist aber `null`/`unknown`) und `vmax_doppelt` (eine gewählte Leistungsstufe enthält die V/max-Aufhebung bereits im Namen, UND zusätzlich wurde das eigenständige V/max-Produkt gewählt). Ergänzung 15.09.2026 (Feinschliff-Prüfung): `modell_mehrdeutig` (`family` zusätzlich mit `brand`/`name`/`codes`, `inquiry` zusätzlich mit `line`), feuert über `vehicleLineIsAmbiguous()` (siehe Abschnitt „Fahrzeugbezeichnung“, mehrdeutige Baureihen X1/X2 · X3/X4 · X5/X6 · 4er Coupé/Cabrio/Grand Coupé, Ausnahme 8er/M8), wenn die Baureihe (nach der Ausnahme 8er/M8) mehrere Alternativen enthält, die Motorisierung mit keiner ein Wort teilt UND keine gültige `line` gespeichert ist (Ergänzung 17.09.2026, Kundenentscheid „bei X1 und X2 gibt es dieselben Motorisierungen, das Modell ist X1 oder X2“, siehe Abschnitt „Fahrzeugbezeichnung“ Regel 6 - der Kundenflow erzwingt die Wahl bereits vor „Weiter“, der Hinweis bleibt nur für den Schnellweg ohne Angabe); Text mit Platzhalter `{alternatives}`, per `tf()` mit `vehicleAmbiguousAlternatives(family, model)` gefüllt (z. B. „Baureihe umfasst X1 / X2, Modell beim Kunden klären“). Keine Regel im UI-Code.

## Antwortentwurf (`lib/draft/template.ts`)

Deterministische Vorlage, Sie-Form, Struktur aus `CLAUDE.md`, Referenz `draft()` in `docs/vorschau.html`, umgestellt auf Sie. Signatur aus `settings`. Betreff (`draft.subject` im Dictionary): «Ihre Anfrage für den BMW M2 (G87), Nr. 2026-0012» (Formel siehe Abschnitt «Fahrzeugbezeichnung»). Positionen im Entwurf mit Beschreibung und Preis: «• Motor: Stufe 1 (620 PS / 740 Nm), ab CHF 4'180». Optional `lib/draft/polish.ts`: wenn `ANTHROPIC_API_KEY` gesetzt, wird die Vorlage sprachlich geglättet, Fakten (Preise, Positionen, Leistungen) dürfen sich nicht ändern; Ergebnis wird gegen die Vorlage geprüft (alle Preise und Positionsnamen müssen vorkommen), sonst Vorlage behalten.

## Mail (`lib/mail/`)

- `sendMail({ to, subject, html, text, type, inquiryId })`: Absender aus `settings`, `bcc` = `settings.mail_bcc`, `reply_to` = `settings.mail_reply_to`. Wenn `MAIL_TO_OVERRIDE` gesetzt: alle Empfänger durch diese Adresse ersetzen und Original-Empfänger im Betreff-Präfix `[TEST an x@y]` nennen. Jeder Versand wird in `outbound_emails` protokolliert.
- Vorlagen (HTML + Text, dunkles Brand-Design, mobil lesbar): `confirmation` (Zusammenfassung, Paket, Richtpreis, Link auf `/p/<token>`), `inbox` (interne Zusammenfassung, Prüfhinweise, Entwurf, Admin-Link), `summary` («Zusammenfassung an mich senden»), `reply` (der bearbeitete Entwurf), `follow_up`.
- Ergänzung 15.09.2026 (Rückmeldung erster Klicktest): `confirmation`/`summary` zeigen Positionen über dieselbe gefaltete Darstellung wie der Antwortentwurf (`lib/catalog/product-display.ts` `displayItemFields()`, siehe oben). `inbox` (und `lib/inquiry/summary.ts` für das Admin-Ticket) zusätzlich den Original-Excel-Namen als Notiz («Excel: ...»), wenn er vom angezeigten Namen abweicht («dÄHLer kennt seine Bezeichnungen»), sowie «Getriebe: Handschalter» in der FAHRZEUG-Zeile, wenn `inquiries.gearbox` gesetzt ist. **Korrektur 15.09.2026** (Prüfung Modul Produkte, Befund 2): ob eine Position als Leistungsstufe gilt («Stufe N»/«Leistungssteigerung» statt Excel-Name), leiten `confirmation`/`summary`/`inbox`/`lib/inquiry/summary.ts` einheitlich über `lib/catalog/product-display.ts` `isStageItem()` her (`variant_group === 'leistung'`, dieselbe Regel wie Kachel und Antwortentwurf, `lib/draft/template.ts`) statt über `ps_to != null` - 13 aktive Stufen ohne `ps_to` (noch unbepreiste Platzhalter) zeigten sonst in den drei Kundentexten inkonsistent den rohen, mehrdeutigen Excel-Namen statt des einheitlichen Kurztitels. Fallback auf `ps_to != null` nur noch für eine vor dieser Korrektur gespeicherte `inquiries.selections`-Zeile ohne `variant_group`.
- **Ergänzung 16.09.2026** (Kundenwunsch: die Vorher/Nachher-Übersicht vom Abschluss-Screen soll individuell, farblich hervorgehoben in den Kundenmails erscheinen): `lib/mail/render.ts` `beforeAfterTable(rows, locale)` rendert dieselben Zeilen wie `components/ui/BeforeAfter.tsx` im Flow als E-Mail-taugliche Tabelle (Inline-CSS, kein Flexbox/Grid, max. 600px, Barlow-Fallback-Schriftstapel) - Kopf «Vorher»/«Nachher · by dÄHLer» (Nachher-Spalte rot `#E21014`), je Zeile Kategorie-Label klein/Grossbuchstaben, Vorher gedämpft, Nachher fett; die «Leistung»-Zeile bei gewählter Stufe mit grossen Zahlen (28px) und grünem Plus-Badge (`#3dbe7a`) wie `PowerValue` im Flow. `rows` kommen aus der gemeinsamen Zeilen-Herleitung `lib/catalog/before-after.ts` `buildBeforeAfterRows()` (siehe Abschnitt «Kundenflow», Punkt 6) - `confirmation`/`summary` zeigen die Tabelle unter der Überschrift «Vorher / Nachher» (`mail.shared.beforeAfterTitle`) nach der Einleitung/Zusammenfassung und vor der Positionsliste, die frühere einzelne «Leistung: ...»-Zeile in der `definitionList` ist dafür entfallen. `inbox` bekommt dieselben Zeilen als kompakten Klartext-Block (`monoBlock()`, Monospace) nach GESCHÄTZTES PAKET, «damit dÄHLer dasselbe sieht». Kurzablauf ohne gewählte Kategorien und ohne Komplettpaket: keine Tabelle (nur die weiterhin gewählten Kategorien zeigen «Serie → Beratung»). **Korrektur 16.09.2026** (Prüfer-Befund, Beleg Anfrage 2026-0272): die ursprüngliche Fassung legte pro Zeile zwei fertige Markup-Varianten ab (dreispaltig + bereits gestapelt) und blendete die passende über einen `<style>`-Block mit `@media (max-width:480px)`-Regel ein/aus. Mailclients, die `<style>` ganz verwerfen statt nur `@media` zu ignorieren (z.B. die Gmail-App bei Nicht-Google-Konten, Gmail-Webmail, diverse Webmailer), zeigten dadurch JEDE Zeile doppelt - ohne die rote «Nachher»-Kopfzeile, ohne Kategorie-Beschriftung, ohne Spaltenbreiten, dazu bei 375px horizontalen Overflow (`document.scrollWidth` 430px statt 375px) durch die gestapelte Variante ohne deren Umbruch-Regel. `beforeAfterTable()` baut die Tabelle jetzt ausschliesslich mit Inline-Styles (kein `<style>`-Block, keine Klassen-CSS) und nur EINER Markup-Variante: eine dreispaltige `<table>` mit `table-layout:fixed`, Prozentbreiten (Label 34%, Vorher/Nachher je 33%) und `word-wrap`/`overflow-wrap` auf jeder Zelle - dieselbe Darstellung in jedem Client, der `<table>`/inline `style` überhaupt rendert, ganz ohne Media Query, verifiziert bis 375px (`document.scrollWidth` bleibt bei 375px, auch mit der langen Exterieur-Aufzählung von 2026-0272). **Korrektur 2 (16.09.2026, Prüfer-Befund, Beleg Anfrage 2026-0272):** die dreispaltige Tabelle löste zwar Verdopplung und Overflow, liess der Vorher/Nachher-Wertspalte auf iPhone-Breiten aber nur ~74-92px Innenbreite (375-430px) - mit 2026-0272 brachen dadurch viele Wörter mitten im Wort um, ohne Trennstrich («Serienanla/ge», «Kompletta/nlage», «Hochleistungskatalysat/oren»). `beforeAfterTable()` stapelt jede Zeile jetzt zusätzlich: Kategorie-Label als eigene volle Zeile, darunter «Vorher → Nachher» als EIN zusammenhängender Fliesstext über `colspan="2"` (nicht mehr in zwei starre Hälften geteilt) - wie `components/ui/BeforeAfter.tsx` unter 600px stapelt, hier aber auf jeder Breite (kein Media Query, weiterhin nur ein Markup pro Zeile). Die Kopfzeile «Vorher»/«Nachher · by dÄHLer» bleibt zweispaltig (50/50, kurze Labels). Verifiziert mit Playwright (`Range.getClientRects` pro Wort, `scratchpad/verify-mail-ba/wrap2.ts`) über die neu gerenderte confirmation von 2026-0272: mitten im Wort umgebrochene Wörter @375px 1, @390px 1, @414px 1, @430px 0, @600px 0, @700px 0 - die verbliebenen Fälle sind kein Fehlumbruch, sondern «Bi-Klappensteuerung»/«H-Pipe», die exakt am ohnehin vorhandenen Bindestrich umbrechen. Screenshots (375px/700px, `page.setContent()`, ohne Server): `scratchpad/mail-preview/real-2026-0272-confirmation.{375,700}.png`, `scratchpad/mail-preview/m2-confirmation.{375,700}.png`, `scratchpad/mail-preview/wiesmann-confirmation.{375,700}.png`.

## Follow-ups (Posten 6)

- Beim Senden einer Antwort (`reply`) wird `replied_at` gesetzt, `status = beantwortet`, und pro aktiver Regel ein `follow_ups`-Eintrag mit `scheduled_for = replied_at + days_after_reply` angelegt (max. `max_count` je Regel und Anfrage).
- Der Scheduler im App-Prozess (`lib/followups/scheduler.ts`, stündlich, erster Lauf 5 Minuten nach dem Start) sendet fällige, nicht gesendete, nicht stornierte Follow-ups, wenn `answer_received_at` null und Status nicht `abgeschlossen`. **Sendefenster (Korrektur 16.09.2026, Prüfer-Befund):** ein einzelner Tick sendet nur zwischen 07:00 und 18:00 Europe/Zurich (`isWithinSendWindow()`); ausserhalb davon überspringt der Tick den Lauf komplett, ohne den Advisory-Lock anzufragen, und loggt das. Ohne dieses Fenster hätte der reine 60-Minuten-Timer Follow-up-Mails an Kunden zu jeder Uhrzeit verschickt, u.a. nachts zwischen 00:00 und 01:00 Uhr oder 5 Minuten nach einem Deploy zu beliebiger Zeit (der frühere separate Cron-Dienst lief bewusst nur einmal täglich um 07:00 Europe/Zurich, siehe Git-Historie von `docs/deploy-railway.md`). Ein fälliges Follow-up geht dadurch nicht verloren, sondern wird beim nächsten Tick innerhalb des Fensters gesendet. `/api/cron/follow-ups` bleibt als manueller Auslöser mit derselben Lock-Logik, aber bewusst OHNE Sendefenster (Admin «Fällige jetzt senden» soll jederzeit funktionieren). «Antwort erhalten» im Admin setzt `answer_received_at` und storniert offene Follow-ups.

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
DATABASE_URL=              # lokal: postgres://postgres:postgres@localhost:5433/daehler (docker-compose.yml)
PGSSLMODE=                 # auf Railway: require, lokal leer lassen
BETTER_AUTH_SECRET=        # openssl rand -hex 32
BETTER_AUTH_URL=           # lokal: http://localhost:3000, produktiv: die App-URL
RESEND_API_KEY=
MAIL_TO_OVERRIDE=          # Test: alle Mails hierhin
RESEND_FROM_OVERRIDE=      # Test: ersetzt die Absenderadresse, solange daehler.com bei Resend nicht verifiziert ist
ANTHROPIC_API_KEY=         # optional, Posten 3 und Entwurf-Polish
CRON_SECRET=
NEXT_PUBLIC_APP_URL=http://localhost:3000
ADMIN_DAEHLER_PASSWORD=          # scripts/create-admin-users.ts, Pflicht ausserhalb der lokalen Entwicklung
ADMIN_TRENDINGMEDIA_PASSWORD=    # dito
```

Vollständige, kommentierte Liste inkl. optionaler Variablen (`AI_MODEL`, `AI_LIVE_TEST`, `DRAFT_POLISH`): `.env.example`.

## Konventionen

- Sprache im Code: Englisch für Bezeichner, Deutsch für Kommentare erlaubt. UI-Texte nur über i18n.
- Keine Preise oder Produkte im Code. Startfotos und Familienreihenfolge dürfen in `db/seed.sql` stehen.
- Jede Route-Handler-Datei validiert mit zod und antwortet JSON `{ ok: true, ... }` oder `{ ok: false, error }`.
- `npm run lint`, `npm run typecheck`, `npm test` müssen grün sein, `npm run build` muss durchlaufen.
