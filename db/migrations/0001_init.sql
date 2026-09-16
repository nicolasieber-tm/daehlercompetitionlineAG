-- dÄHLer Anfrage-Erlebnis: Datenbank-Grundschema, Railway-only.
-- Konsolidiertes Schema (siehe docs/umbau-railway.md, Abschnitt
-- "Zielarchitektur", und CLAUDE.md, Abschnitt "Datenmodell"), ohne
-- RLS, Policies oder Storage: jeder Zugriff läuft ausschliesslich
-- serverseitig durch die App über den Postgres-Pool (lib/db/client.ts).
-- generate_share_token() entfällt, der Token entsteht in der App (siehe
-- lib/inquiry/share.ts). pricelist_imports.created_by referenziert die
-- better-auth-Tabelle "user" (Migration 0002_auth.sql, Phase E2) erst ab
-- dieser Phase, ohne Fremdschlüssel-Zwang in dieser Migration.
--
-- Tabelle `photos` (Fotos liegen als bytea in der DB), siehe
-- docs/umbau-railway.md Abschnitt "Fotos und Import-Zwischenspeicher"),
-- pricelist_imports.payload jsonb (Import-Zwischenspeicher).
--
-- Reihenfolge: Erweiterungen, Trigger-Funktion, Tabellen (Abhängigkeiten
-- zuerst), Indizes, Trigger, Funktionen next_inquiry_number()/
-- claim_follow_up()/schedule_follow_ups(). Idempotent genug für einen
-- frischen Lauf (create table/index ohne if not exists ist hier bewusst
-- strikt: eine zweite Ausführung soll scripts/migrate.ts nie erreichen,
-- das regelt die Tabelle schema_migrations).

-- ---------------------------------------------------------------------------
-- Erweiterungen
-- ---------------------------------------------------------------------------

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Trigger-Funktion für updated_at
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function set_updated_at() is
  'Setzt updated_at auf now() bei jedem UPDATE. Wird per Trigger an alle Tabellen mit updated_at-Spalte gehängt.';

-- ---------------------------------------------------------------------------
-- Tabellen: Katalog (ausschliesslich per Excel-Import befüllt, Ausnahme
-- markierte Admin-Felder, siehe CLAUDE.md Abschnitt "Datenquelle")
-- ---------------------------------------------------------------------------

create table model_families (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  name text not null,
  slug text not null unique,
  codes text[] not null default '{}',
  pricelist_no text,
  source_file text,
  has_pricelist boolean not null default true,
  photo_url text,
  short_text text,
  sort integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint model_families_brand_check
    check (brand in ('BMW', 'MINI', 'Toyota', 'Wiesmann'))
);

comment on table model_families is
  'Baureihe, eine Excel-Datei = eine Familie. photo_url, short_text, sort sind Admin-Felder.';

create table models (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references model_families (id) on delete cascade,
  name text not null,
  slug text not null,
  fuel text,
  series_ps integer,
  series_nm integer,
  series_ps_suggested integer[] not null default '{}',
  photo_url text,
  sort integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint models_fuel_check
    check (fuel is null or fuel in ('benzin', 'diesel', 'elektro')),
  -- Nur der Slug ist je Familie eindeutig (der Parser macht Namen je Familie
  -- eindeutig, siehe docs/excel-import.md, Kraftstoff-Zusatz bei Duplikaten,
  -- aber das ist eine Parser-Garantie, kein DB-Constraint auf name).
  constraint models_family_id_slug_key unique (family_id, slug)
);

comment on table models is
  'Motorisierung/Variante einer Familie (Spalte in Zeile 2 der Excel). series_ps, series_nm, photo_url sind Admin-Felder.';

create table products (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references model_families (id) on delete cascade,
  category text not null,
  source_category text,
  group_label text,
  name text not null,
  description text,
  article_no text,
  rc text,
  price_parts numeric,
  price_install numeric,
  price_approval numeric,
  price_total numeric,
  price_status text not null default 'on_request',
  price_note text,
  ps_base integer[] not null default '{}',
  ps_to integer,
  nm_to integer,
  variant_group text,
  fits_all boolean not null default false,
  sort integer not null default 0,
  source_row integer,
  content_hash text,
  active boolean not null default true,
  gearbox text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_category_check
    check (category in ('motor', 'auspuff', 'fahrwerk', 'raeder', 'exterieur', 'interieur')),
  constraint products_price_status_check
    check (price_status in ('priced', 'in_preparation', 'on_request')),
  constraint products_gearbox_check
    check (gearbox is null or gearbox in ('manual', 'automatic'))
  -- content_hash ist bewusst nicht unique (siehe docs/excel-import.md:
  -- Kollisionen sind reale Daten, z. B. identische Adaptersätze je Radsatz).
  -- Index statt Constraint, siehe Abschnitt Indizes weiter unten.
);

comment on table products is
  'Produktzeile aus der Excel-Preisliste. category ist das Flow-Mapping, source_category die Originalüberschrift.';
comment on column products.gearbox is
  'Getriebespezifisch aus dem Produktnamen abgeleitet (lib/catalog/gearbox.ts), null wenn getriebeneutral. Wird bei jedem Import neu berechnet.';

create table product_fitment (
  product_id uuid not null references products (id) on delete cascade,
  model_id uuid not null references models (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (product_id, model_id)
);

comment on table product_fitment is
  'Welche Modell-Variante ein Produkt bekommt (Marker-Spalten der Excel).';

create table pricelist_notes (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references model_families (id) on delete cascade,
  category text,
  text text not null,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table pricelist_notes is
  'Hinweistexte aus der Excel (Garantie, Gutachten), je family_id und Excel-source_category.';

create table pricelist_imports (
  id uuid primary key default gen_random_uuid(),
  filenames text[] not null default '{}',
  status text not null default 'pending',
  diff jsonb,
  summary jsonb,
  payload jsonb,
  applied_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pricelist_imports_status_check
    check (status in ('pending', 'applied', 'discarded', 'failed'))
);

comment on table pricelist_imports is
  'Ein Excel-Upload im Admin. pending = Diff angezeigt, applied = übernommen, discarded = verworfen, failed = beim Übernehmen sind Fehler aufgetreten (siehe summary.errors).';
comment on column pricelist_imports.payload is
  'Vom Parser gelieferte Rohdaten (ParsedFamily[] als JSON), die applyPendingImport() beim Übernehmen erneut lädt; wird nach Übernehmen/Verwerfen auf null gesetzt.';
comment on column pricelist_imports.created_by is
  'Better-auth-User-Id (Tabelle "user", Migration 0002_auth.sql, Phase E2). Keine Fremdschlüssel-Referenz hier, damit diese Migration unabhängig von der Auth-Migration bleibt; auf Anwendungsebene geprüft.';

-- ---------------------------------------------------------------------------
-- Tabellen: Anfragen
-- ---------------------------------------------------------------------------

create table inquiries (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  status text not null default 'neu',
  source text not null default 'web',
  locale text not null default 'de',
  family_id uuid references model_families (id) on delete set null,
  model_id uuid references models (id) on delete set null,
  vehicle_text text,
  year text,
  been_here boolean not null default false,
  categories text[] not null default '{}',
  consulting boolean not null default false,
  selections jsonb not null default '[]'::jsonb,
  follow_up_answers jsonb not null default '{}'::jsonb,
  character text,
  timing text,
  first_name text,
  last_name text,
  city text,
  phone text,
  email text,
  channel text,
  message text,
  estimated_total numeric,
  checks jsonb not null default '[]'::jsonb,
  draft_subject text,
  draft_reply text,
  share_token text not null unique,
  raw_text text,
  ai_extraction jsonb,
  gearbox text,
  series_ps int,
  replied_at timestamptz,
  answer_received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inquiries_status_check
    check (status in ('neu', 'in_bearbeitung', 'beantwortet', 'abgeschlossen')),
  constraint inquiries_source_check
    check (source in ('web', 'quick')),
  constraint inquiries_locale_check
    check (locale in ('de', 'en')),
  constraint inquiries_character_check
    check (character is null or character in ('dezent', 'sportlich', 'maximum')),
  constraint inquiries_timing_check
    check (timing is null or timing in ('asap', 'm1_2', 'm3_6', 'flexible')),
  constraint inquiries_channel_check
    check (channel is null or channel in ('phone', 'email', 'whatsapp')),
  constraint inquiries_categories_check
    check (categories <@ array['motor', 'auspuff', 'fahrwerk', 'raeder', 'exterieur', 'interieur']::text[]),
  constraint inquiries_gearbox_check
    check (gearbox is null or gearbox in ('manual', 'automatic', 'unknown'))
);

comment on table inquiries is
  'Eine Kundenanfrage aus dem Flow (source=web) oder dem Schnellweg (source=quick).';
comment on column inquiries.gearbox is
  'Antwort auf die Getriebefrage im Fahrzeug-Schritt (manual/automatic/unknown), null wenn nicht gefragt.';
comment on column inquiries.series_ps is
  'Effektive Serienleistung zum Zeitpunkt der Anfrage (models.series_ps, sonst die im Fahrzeug-Schritt gewählte Serienleistungs-Chip-Auswahl, siehe components/flow/state.ts effectiveSeriesPs()). Nullable: Kurzablauf ohne Modell, oder Serienleistung unbekannt. Für die Vorher/Nachher-Darstellung nach dem Absenden.';

create table outbound_emails (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references inquiries (id) on delete cascade,
  type text not null,
  to_email text not null,
  subject text,
  body_text text,
  resend_id text,
  status text not null default 'sent',
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outbound_emails_type_check
    check (type in ('confirmation', 'inbox', 'summary', 'reply', 'follow_up')),
  constraint outbound_emails_status_check
    check (status in ('sent', 'failed'))
);

comment on table outbound_emails is
  'Protokoll jedes Mailversands über Resend, inklusive Fehlern (die Anfrage darf dabei nie verloren gehen).';

create table follow_up_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  days_after_reply integer not null,
  subject text not null,
  body text not null,
  max_count integer not null default 1,
  active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table follow_up_rules is
  'Konfigurierbare Follow-up-Regeln (Posten 6), Text mit Platzhaltern {{vorname}}, {{name}}, {{fahrzeug}}, {{nummer}}.';

create table follow_ups (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references inquiries (id) on delete cascade,
  rule_id uuid references follow_up_rules (id) on delete set null,
  scheduled_for date not null,
  sent_at timestamptz,
  cancelled_at timestamptz,
  outbound_email_id uuid references outbound_emails (id) on delete set null,
  attempts integer not null default 0,
  last_error text,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table follow_ups is
  'Geplanter Follow-up-Versand pro Anfrage und Regel. cancelled_at wird bei "Antwort erhalten" gesetzt.';
comment on column follow_ups.attempts is
  'Anzahl bisheriger Versandversuche (atomar erhöht über claim_follow_up()). Limit siehe lib/followups/run.ts (MAX_FOLLOW_UP_ATTEMPTS), danach failed_at.';
comment on column follow_ups.last_error is
  'Fehlertext des letzten fehlgeschlagenen Versandversuchs, zur Einsicht im Admin.';
comment on column follow_ups.failed_at is
  'Gesetzt, sobald der letzte erlaubte Versandversuch fehlgeschlagen ist: endgültig aufgegeben, taucht nicht mehr in der Fällig-Abfrage auf. Getrennt von cancelled_at (das steht für "Antwort erhalten" bzw. einen sonst nicht mehr sinnvollen Eintrag, siehe lib/followups/run.ts).';

create table settings (
  key text primary key,
  value text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table settings is
  'Einfache Key-Value-Einstellungen: Mail-Absender, Signatur, Firmenadresse (siehe db/seed.sql für Defaults).';

-- Interne Hilfstabelle für next_inquiry_number(), nicht Teil des in
-- CLAUDE.md aufgeführten Datenmodells, aber notwendig, damit die
-- Nummernvergabe pro Jahr eindeutig und nebenläufigkeitssicher ist.
create table inquiry_counters (
  year integer primary key,
  last integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table inquiry_counters is
  'Zähler für next_inquiry_number(), ein Eintrag pro Jahr. Nicht direkt von der App verwendet.';

-- ---------------------------------------------------------------------------
-- Tabelle: photos (siehe docs/umbau-railway.md, Abschnitt "Fotos und
-- Import-Zwischenspeicher"). Auslieferung über GET /api/photos/[id].
-- ---------------------------------------------------------------------------

create table photos (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  owner_id uuid not null,
  content_type text not null,
  bytes bytea not null,
  size int not null,
  sha1 text not null,
  created_at timestamptz not null default now(),
  constraint photos_kind_check
    check (kind in ('family', 'model'))
);

comment on table photos is
  'Fotos für model_families und models, als bytea in der DB statt in einem Storage-Bucket. owner_id verweist je nach kind auf model_families.id oder models.id (keine Fremdschlüssel-Referenz, da eine Spalte für beide Zieltabellen).';

-- ---------------------------------------------------------------------------
-- Indizes
-- ---------------------------------------------------------------------------

-- models_family_id_idx entfällt: der unique-Index auf (family_id, slug)
-- bedient Abfragen nach family_id bereits als führende Spalte.
create index products_family_id_category_sort_idx on products (family_id, category, sort);
create index products_family_id_content_hash_idx on products (family_id, content_hash);
create index product_fitment_model_id_idx on product_fitment (model_id);
create index pricelist_notes_family_id_idx on pricelist_notes (family_id);
create index pricelist_imports_created_by_idx on pricelist_imports (created_by);

create index inquiries_created_at_idx on inquiries (created_at desc);
create index inquiries_status_idx on inquiries (status);
create index inquiries_email_idx on inquiries (email);
create index inquiries_family_id_idx on inquiries (family_id);
create index inquiries_model_id_idx on inquiries (model_id);
-- inquiries.share_token hat durch den unique-Constraint bereits einen Index.

create index outbound_emails_inquiry_id_idx on outbound_emails (inquiry_id);
create index follow_ups_inquiry_id_idx on follow_ups (inquiry_id);
create index follow_ups_rule_id_idx on follow_ups (rule_id);
create index follow_ups_outbound_email_id_idx on follow_ups (outbound_email_id);
create index follow_ups_scheduled_for_idx on follow_ups (scheduled_for)
  where sent_at is null and cancelled_at is null and failed_at is null;

create index photos_kind_owner_id_idx on photos (kind, owner_id);

-- ---------------------------------------------------------------------------
-- Trigger updated_at (alle Tabellen mit updated_at-Spalte)
-- ---------------------------------------------------------------------------

create trigger set_updated_at before update on model_families
  for each row execute function set_updated_at();
create trigger set_updated_at before update on models
  for each row execute function set_updated_at();
create trigger set_updated_at before update on products
  for each row execute function set_updated_at();
create trigger set_updated_at before update on pricelist_notes
  for each row execute function set_updated_at();
create trigger set_updated_at before update on pricelist_imports
  for each row execute function set_updated_at();
create trigger set_updated_at before update on inquiries
  for each row execute function set_updated_at();
create trigger set_updated_at before update on outbound_emails
  for each row execute function set_updated_at();
create trigger set_updated_at before update on follow_up_rules
  for each row execute function set_updated_at();
create trigger set_updated_at before update on follow_ups
  for each row execute function set_updated_at();
create trigger set_updated_at before update on settings
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Funktion: next_inquiry_number()
-- Format JJJJ-NNNN, eigene Zählertabelle pro Jahr, Row-Lock (for update)
-- gegen Nebenläufigkeit bei mehreren gleichzeitigen Anfragen.
-- ---------------------------------------------------------------------------

create or replace function next_inquiry_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Jahr nach Schweizer Ortszeit (Europe/Zurich), nicht nach der Server-/
  -- Session-Zeitzone: die Nummer JJJJ-NNNN muss für dÄHLer stimmen, auch
  -- rund um Silvester bei UTC-Offset-Wechsel (CET/CEST).
  v_year integer := extract(year from now() at time zone 'Europe/Zurich')::integer;
  v_last integer;
begin
  insert into inquiry_counters (year, last)
  values (v_year, 0)
  on conflict (year) do nothing;

  select last into v_last
  from inquiry_counters
  where year = v_year
  for update;

  v_last := v_last + 1;

  update inquiry_counters
  set last = v_last
  where year = v_year;

  -- Vierstellig mit führenden Nullen, ab der 10'000. Anfrage eines Jahres
  -- fünfstellig (greatest verhindert ein stilles Abschneiden mit lpad, das
  -- ab last = 10000 wieder mit bereits vergebenen Nummern kollidieren würde).
  return v_year::text || '-' || lpad(v_last::text, greatest(4, length(v_last::text)), '0');
end;
$$;

comment on function next_inquiry_number() is
  'Liefert die nächste Anfragenummer im Format JJJJ-NNNN.';

-- ---------------------------------------------------------------------------
-- Funktion: claim_follow_up(p_id, p_max_attempts)
-- Beansprucht einen Eintrag für den Versand und erhöht attempts in
-- demselben atomaren UPDATE. Claimt nur, wenn noch nicht gesendet, nicht
-- storniert, nicht endgültig aufgegeben (failed_at) und attempts <
-- p_max_attempts. p_max_attempts wird von lib/followups/run.ts
-- (MAX_FOLLOW_UP_ATTEMPTS) übergeben, Default 3 für direkte SQL-Aufrufe.
-- ---------------------------------------------------------------------------

create or replace function claim_follow_up(p_id uuid, p_max_attempts integer default 3)
returns setof follow_ups
language sql
security definer
set search_path = public
as $$
  update follow_ups
  set sent_at = now(), attempts = attempts + 1
  where id = p_id
    and sent_at is null
    and cancelled_at is null
    and failed_at is null
    and attempts < p_max_attempts
  returning *;
$$;

comment on function claim_follow_up(uuid, integer) is
  'Beansprucht einen follow_ups-Eintrag für den Versand und erhöht attempts atomar im selben UPDATE (Guard: sent_at/cancelled_at/failed_at null, attempts < p_max_attempts).';

-- ---------------------------------------------------------------------------
-- Funktion: schedule_follow_ups(p_inquiry_id, p_replied_at)
-- Plant pro aktiver Regel (sort) einen follow_ups-Eintrag, sofern noch
-- weniger als max_count Einträge existieren UND noch kein offener Eintrag
-- (sent_at/cancelled_at/failed_at alle null) für diese Regel/Anfrage
-- existiert. Sperrt die Anfrage für die Dauer der Transaktion
-- (pg_advisory_xact_lock), damit zwei gleichzeitige Aufrufe für dieselbe
-- Anfrage nacheinander statt parallel laufen.
-- ---------------------------------------------------------------------------

create or replace function schedule_follow_ups(p_inquiry_id uuid, p_replied_at timestamptz)
returns setof follow_ups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule record;
  v_scheduled_for date;
  v_row follow_ups;
begin
  -- Pro Anfrage serialisieren: ein zweiter gleichzeitiger Aufruf für
  -- dieselbe p_inquiry_id wartet hier, bis die erste Transaktion committet
  -- (oder rollt zurück) und sieht danach den bereits eingefügten Stand.
  perform pg_advisory_xact_lock(hashtext(p_inquiry_id::text));

  for v_rule in
    select id, days_after_reply, max_count
    from follow_up_rules
    where active = true
    order by sort asc
  loop
    -- Keine zweite offene Planung derselben Regel für dieselbe Anfrage.
    -- "offen" = weder gesendet, noch storniert, noch endgültig
    -- fehlgeschlagen (sent_at/cancelled_at/failed_at alle null).
    continue when exists (
      select 1 from follow_ups
      where inquiry_id = p_inquiry_id
        and rule_id = v_rule.id
        and sent_at is null
        and cancelled_at is null
        and failed_at is null
    );

    if (
      select count(*) from follow_ups
      where inquiry_id = p_inquiry_id and rule_id = v_rule.id
    ) < v_rule.max_count then
      -- Kalendertag in Europe/Zurich von p_replied_at, plus days_after_reply
      -- ganze Tage (date + integer addiert Kalendertage direkt, kein erneuter
      -- Zeitzonenbezug nötig): entspricht addDaysToZurichDate() in
      -- lib/followups/schedule.ts.
      v_scheduled_for := ((p_replied_at at time zone 'Europe/Zurich')::date) + v_rule.days_after_reply;

      insert into follow_ups (inquiry_id, rule_id, scheduled_for)
      values (p_inquiry_id, v_rule.id, v_scheduled_for)
      returning * into v_row;

      return next v_row;
    end if;
  end loop;
  return;
end;
$$;

comment on function schedule_follow_ups(uuid, timestamptz) is
  'Plant pro aktiver Regel (sort) einen follow_ups-Eintrag, max_count je Regel, race-sicher via pg_advisory_xact_lock auf die Anfrage. Überspringt eine Regel, für die bereits ein offener Eintrag existiert.';
