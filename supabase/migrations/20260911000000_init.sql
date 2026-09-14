-- dÄHLer Anfrage-Erlebnis: Datenbank-Grundschema.
-- Quelle: docs/architektur.md, Abschnitte "Datenmodell" und "Sicherheit".
-- Reihenfolge: Erweiterungen, Trigger-Funktion, Tabellen (Abhängigkeiten
-- zuerst), Indizes, Trigger, Funktionen, RLS, Storage.

-- ---------------------------------------------------------------------------
-- Erweiterungen
-- ---------------------------------------------------------------------------

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Trigger-Funktion für updated_at
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Setzt updated_at auf now() bei jedem UPDATE. Wird per Trigger an alle Tabellen mit updated_at-Spalte gehängt.';

-- ---------------------------------------------------------------------------
-- Tabellen: Katalog (ausschliesslich per Excel-Import befüllt, Ausnahme
-- markierte Admin-Felder, siehe docs/architektur.md)
-- ---------------------------------------------------------------------------

create table public.model_families (
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

comment on table public.model_families is
  'Baureihe, eine Excel-Datei = eine Familie. photo_url, short_text, sort sind Admin-Felder.';

create table public.models (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.model_families (id) on delete cascade,
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

comment on table public.models is
  'Motorisierung/Variante einer Familie (Spalte in Zeile 2 der Excel). series_ps, series_nm, photo_url sind Admin-Felder.';

create table public.products (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.model_families (id) on delete cascade,
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_category_check
    check (category in ('motor', 'auspuff', 'fahrwerk', 'raeder', 'exterieur', 'interieur')),
  constraint products_price_status_check
    check (price_status in ('priced', 'in_preparation', 'on_request'))
  -- content_hash ist bewusst nicht unique (siehe docs/excel-import.md:
  -- Kollisionen sind reale Daten, z. B. identische Adaptersätze je Radsatz).
  -- Index statt Constraint, siehe Abschnitt Indizes weiter unten.
);

comment on table public.products is
  'Produktzeile aus der Excel-Preisliste. category ist das Flow-Mapping, source_category die Originalüberschrift.';

create table public.product_fitment (
  product_id uuid not null references public.products (id) on delete cascade,
  model_id uuid not null references public.models (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (product_id, model_id)
);

comment on table public.product_fitment is
  'Welche Modell-Variante ein Produkt bekommt (Marker-Spalten der Excel).';

create table public.pricelist_notes (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.model_families (id) on delete cascade,
  category text,
  text text not null,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.pricelist_notes is
  'Hinweistexte aus der Excel (Garantie, Gutachten), je family_id und Excel-source_category.';

create table public.pricelist_imports (
  id uuid primary key default gen_random_uuid(),
  filenames text[] not null default '{}',
  status text not null default 'pending',
  diff jsonb,
  summary jsonb,
  applied_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pricelist_imports_status_check
    check (status in ('pending', 'applied', 'discarded'))
);

comment on table public.pricelist_imports is
  'Ein Excel-Upload im Admin. pending = Diff angezeigt, applied = übernommen, discarded = verworfen.';

-- ---------------------------------------------------------------------------
-- Tabellen: Anfragen
-- ---------------------------------------------------------------------------

create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  status text not null default 'neu',
  source text not null default 'web',
  locale text not null default 'de',
  family_id uuid references public.model_families (id) on delete set null,
  model_id uuid references public.models (id) on delete set null,
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
    check (categories <@ array['motor', 'auspuff', 'fahrwerk', 'raeder', 'exterieur', 'interieur']::text[])
);

comment on table public.inquiries is
  'Eine Kundenanfrage aus dem Flow (source=web) oder dem Schnellweg (source=quick).';

create table public.outbound_emails (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries (id) on delete cascade,
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

comment on table public.outbound_emails is
  'Protokoll jedes Mailversands über Resend, inklusive Fehlern (die Anfrage darf dabei nie verloren gehen).';

create table public.follow_up_rules (
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

comment on table public.follow_up_rules is
  'Konfigurierbare Follow-up-Regeln (Posten 6), Text mit Platzhaltern {{vorname}}, {{name}}, {{fahrzeug}}, {{nummer}}.';

create table public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries (id) on delete cascade,
  rule_id uuid references public.follow_up_rules (id) on delete set null,
  scheduled_for date not null,
  sent_at timestamptz,
  cancelled_at timestamptz,
  outbound_email_id uuid references public.outbound_emails (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.follow_ups is
  'Geplanter Follow-up-Versand pro Anfrage und Regel. cancelled_at wird bei "Antwort erhalten" gesetzt.';

create table public.settings (
  key text primary key,
  value text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.settings is
  'Einfache Key-Value-Einstellungen: Mail-Absender, Signatur, Firmenadresse (siehe supabase/seed.sql für Defaults).';

-- Interne Hilfstabelle für next_inquiry_number(), nicht Teil des in
-- docs/architektur.md aufgeführten Datenmodells, aber notwendig, damit die
-- Nummernvergabe pro Jahr eindeutig und nebenläufigkeitssicher ist.
create table public.inquiry_counters (
  year integer primary key,
  last integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.inquiry_counters is
  'Zähler für next_inquiry_number(), ein Eintrag pro Jahr. Nicht direkt von der App verwendet.';

-- ---------------------------------------------------------------------------
-- Indizes
-- ---------------------------------------------------------------------------

-- models_family_id_idx entfällt: der unique-Index auf (family_id, slug)
-- bedient Abfragen nach family_id bereits als führende Spalte.
create index products_family_id_category_sort_idx on public.products (family_id, category, sort);
create index products_family_id_content_hash_idx on public.products (family_id, content_hash);
create index product_fitment_model_id_idx on public.product_fitment (model_id);
create index pricelist_notes_family_id_idx on public.pricelist_notes (family_id);
create index pricelist_imports_created_by_idx on public.pricelist_imports (created_by);

create index inquiries_created_at_idx on public.inquiries (created_at desc);
create index inquiries_status_idx on public.inquiries (status);
create index inquiries_email_idx on public.inquiries (email);
create index inquiries_family_id_idx on public.inquiries (family_id);
create index inquiries_model_id_idx on public.inquiries (model_id);
-- inquiries.share_token hat durch den unique-Constraint bereits einen Index.

create index outbound_emails_inquiry_id_idx on public.outbound_emails (inquiry_id);
create index follow_ups_inquiry_id_idx on public.follow_ups (inquiry_id);
create index follow_ups_rule_id_idx on public.follow_ups (rule_id);
create index follow_ups_outbound_email_id_idx on public.follow_ups (outbound_email_id);
create index follow_ups_scheduled_for_idx on public.follow_ups (scheduled_for)
  where sent_at is null and cancelled_at is null;

-- ---------------------------------------------------------------------------
-- Trigger updated_at (alle Tabellen mit updated_at-Spalte)
-- ---------------------------------------------------------------------------

create trigger set_updated_at before update on public.model_families
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.models
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.products
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.pricelist_notes
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.pricelist_imports
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.inquiries
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.outbound_emails
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.follow_up_rules
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.follow_ups
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Funktion: next_inquiry_number()
-- Format JJJJ-NNNN, eigene Zählertabelle pro Jahr, Row-Lock (for update)
-- gegen Nebenläufigkeit bei mehreren gleichzeitigen Anfragen.
-- ---------------------------------------------------------------------------

create or replace function public.next_inquiry_number()
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
  insert into public.inquiry_counters (year, last)
  values (v_year, 0)
  on conflict (year) do nothing;

  select last into v_last
  from public.inquiry_counters
  where year = v_year
  for update;

  v_last := v_last + 1;

  update public.inquiry_counters
  set last = v_last
  where year = v_year;

  -- Vierstellig mit führenden Nullen, ab der 10'000. Anfrage eines Jahres
  -- fünfstellig (greatest verhindert ein stilles Abschneiden mit lpad, das
  -- ab last = 10000 wieder mit bereits vergebenen Nummern kollidieren würde).
  return v_year::text || '-' || lpad(v_last::text, greatest(4, length(v_last::text)), '0');
end;
$$;

comment on function public.next_inquiry_number() is
  'Liefert die nächste Anfragenummer im Format JJJJ-NNNN. security definer, damit inquiry_counters unabhängig von RLS-Rechten des Aufrufers beschreibbar ist.';

-- PostgreSQL erteilt neuen Funktionen standardmässig Execute an PUBLIC (also
-- auch an anon/authenticated über PostgREST). Anfragenummern werden gemäss
-- docs/architektur.md, Abschnitt "Sicherheit", ausschliesslich serverseitig
-- über den Service-Role-Client vergeben (der RLS und Grants ohnehin umgeht),
-- daher hier explizit entziehen, damit /rest/v1/rpc/next_inquiry_number
-- nicht von aussen aufrufbar ist und den Jahreszähler verbraucht.
revoke execute on function public.next_inquiry_number() from public, anon, authenticated;
-- Explizites Grant an service_role (in Supabase üblicherweise ohnehin
-- BYPASSRLS/Superuser-artig, aber Execute-Rechte sind davon unabhängig und
-- werden durch das revoke oben von PUBLIC nicht automatisch wiederhergestellt).
grant execute on function public.next_inquiry_number() to service_role;

-- ---------------------------------------------------------------------------
-- Funktion: generate_share_token() (optional, Token wird normalerweise in
-- der App erzeugt; die Spalte inquiries.share_token ist unique, egal woher
-- der Wert kommt)
-- ---------------------------------------------------------------------------

create or replace function public.generate_share_token()
returns text
language sql
volatile
as $$
  select rtrim(translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/', '-_'), '=');
$$;

comment on function public.generate_share_token() is
  'URL-sicherer 22-Zeichen-Token, optionaler DB-seitiger Fallback für inquiries.share_token. Normalerweise erzeugt lib/inquiry/share.ts den Token in der App.';

-- Wie next_inquiry_number(): Execute-Recht von PUBLIC, anon und authenticated
-- entziehen (Supabase erteilt neuen Funktionen per Default-Privileges auch
-- authenticated explizit Execute, ein revoke von PUBLIC allein reicht darum
-- nicht). Ungefährlich (keine Schreiboperation), aber die Funktion gehört
-- gemäss Sicherheitsmodell nicht zu den öffentlich aufrufbaren RPCs; nur der
-- Service-Role-Client darf sie nutzen.
revoke execute on function public.generate_share_token() from public, anon, authenticated;
grant execute on function public.generate_share_token() to service_role;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.model_families enable row level security;
alter table public.models enable row level security;
alter table public.products enable row level security;
alter table public.product_fitment enable row level security;
alter table public.pricelist_notes enable row level security;
alter table public.pricelist_imports enable row level security;
alter table public.inquiries enable row level security;
alter table public.outbound_emails enable row level security;
alter table public.follow_up_rules enable row level security;
alter table public.follow_ups enable row level security;
alter table public.settings enable row level security;
alter table public.inquiry_counters enable row level security;

-- Katalogtabellen: anon (öffentlicher Flow) sieht ausschliesslich aktive
-- Zeilen, nur lesend. authenticated (Admin) hat alle Operationen auf allen
-- Zeilen, auch inaktive (Pflege im Admin, Import-Historie, Wiederherstellen).
-- Tabellen ohne eigene active-Spalte (product_fitment, pricelist_notes)
-- richten sich für anon nach der aktiven Elternzeile.

create policy model_families_select_active_anon
  on public.model_families for select
  to anon
  using (active = true);

create policy model_families_all_authenticated
  on public.model_families for all
  to authenticated
  using (true)
  with check (true);

create policy models_select_active_anon
  on public.models for select
  to anon
  using (active = true);

create policy models_all_authenticated
  on public.models for all
  to authenticated
  using (true)
  with check (true);

create policy products_select_active_anon
  on public.products for select
  to anon
  using (active = true);

create policy products_all_authenticated
  on public.products for all
  to authenticated
  using (true)
  with check (true);

create policy product_fitment_select_parents_active_anon
  on public.product_fitment for select
  to anon
  using (
    exists (
      select 1 from public.products p
      where p.id = product_fitment.product_id and p.active = true
    )
    and exists (
      select 1 from public.models m
      where m.id = product_fitment.model_id and m.active = true
    )
  );

create policy product_fitment_all_authenticated
  on public.product_fitment for all
  to authenticated
  using (true)
  with check (true);

create policy pricelist_notes_select_family_active_anon
  on public.pricelist_notes for select
  to anon
  using (
    exists (
      select 1 from public.model_families f
      where f.id = pricelist_notes.family_id and f.active = true
    )
  );

create policy pricelist_notes_all_authenticated
  on public.pricelist_notes for all
  to authenticated
  using (true)
  with check (true);

-- Alle anderen Tabellen: ausschliesslich für authenticated (Admin), alle
-- Operationen. Öffentliche Schreibzugriffe (z. B. POST /api/inquiries)
-- laufen serverseitig über den Service-Role-Client und umgehen RLS ohnehin.

create policy pricelist_imports_all_authenticated
  on public.pricelist_imports for all
  to authenticated
  using (true)
  with check (true);

create policy inquiries_all_authenticated
  on public.inquiries for all
  to authenticated
  using (true)
  with check (true);

create policy outbound_emails_all_authenticated
  on public.outbound_emails for all
  to authenticated
  using (true)
  with check (true);

create policy follow_up_rules_all_authenticated
  on public.follow_up_rules for all
  to authenticated
  using (true)
  with check (true);

create policy follow_ups_all_authenticated
  on public.follow_ups for all
  to authenticated
  using (true)
  with check (true);

create policy settings_all_authenticated
  on public.settings for all
  to authenticated
  using (true)
  with check (true);

create policy inquiry_counters_all_authenticated
  on public.inquiry_counters for all
  to authenticated
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- Storage: Bucket model-photos, public lesbar, nur authenticated schreibt
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('model-photos', 'model-photos', true)
on conflict (id) do nothing;

-- storage.objects gehört bei Supabase der Rolle supabase_storage_admin, nicht
-- postgres (als die Migrationen laufen); ein alter table ... enable row level
-- security darauf schlägt mit "must be owner of table objects" fehl und
-- bricht die gesamte Migration ab (github.com/supabase/cli/issues/3599,
-- github.com/orgs/supabase/discussions/36611). RLS ist auf storage.objects
-- bei Supabase bereits standardmässig aktiv, daher hier keine eigene
-- Aktivierung nötig; nur die Policies anlegen (das ist als postgres erlaubt).

create policy model_photos_public_select
  on storage.objects for select
  to public
  using (bucket_id = 'model-photos');

create policy model_photos_authenticated_insert
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'model-photos');

create policy model_photos_authenticated_update
  on storage.objects for update
  to authenticated
  using (bucket_id = 'model-photos')
  with check (bucket_id = 'model-photos');

create policy model_photos_authenticated_delete
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'model-photos');
