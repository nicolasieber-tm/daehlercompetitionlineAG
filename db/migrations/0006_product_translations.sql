-- Englische Produkttexte (Entscheid 21.09.2026, Posten 4 Sprachumschaltung):
-- die Excel-Preisliste bleibt die einzige Quelle für Produkte, und sie ist
-- deutsch. Damit ein englischsprachiger Kunde «Heckflügel Carbon» versteht,
-- hält product_translations je Sprache eine Übersetzung PRO QUELLTEXT (nicht
-- pro Produkt): derselbe Name kommt in vielen Baureihen vor und wird nur
-- einmal übersetzt. Schlüssel ist der normalisierte deutsche Text
-- (lib/translations/resolve.ts normalizeSourceText()); übersetzt werden
-- Produktnamen, Beschreibungen, die Restinformation von Leistungsstufen
-- («M6 & A8-Getriebe»), Gruppentitel, Excel-Kategorien und die Hinweistexte
-- (pricelist_notes). Gefüllt wird die Tabelle automatisch nach jedem
-- Excel-Import per Sprachmodell (lib/translations/sync.ts), korrigiert im
-- Admin unter «Übersetzungen» (origin 'manual' wird nie überschrieben).
-- Fehlt eine Übersetzung, zeigt der Flow den deutschen Text.

create table product_translations (
  id uuid primary key default gen_random_uuid(),
  locale text not null,
  source_text text not null,
  translated_text text not null,
  origin text not null default 'auto',
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_translations_locale_check check (locale in ('en')),
  constraint product_translations_origin_check check (origin in ('auto', 'manual')),
  constraint product_translations_locale_source_key unique (locale, source_text)
);

create trigger set_updated_at before update on product_translations
  for each row execute function set_updated_at();

comment on table product_translations is
  'Übersetzungen der deutschen Excel-Produkttexte je Sprache, Schlüssel ist der normalisierte Quelltext (lib/translations). origin auto = per Sprachmodell nach dem Import, manual = im Admin korrigiert (wird nie automatisch überschrieben). model = verwendetes Sprachmodell bei auto.';

-- Eingefrorene Übersetzungen der gewählten Positionen zum Zeitpunkt der
-- Anfrage ({ "en": { "<Quelltext>": "<Übersetzung>" } }), damit
-- Bestätigungsmail, Teilen-Seite und Antwortentwurf einer englischen
-- Anfrage auch dann stabil bleiben, wenn eine Übersetzung später im Admin
-- geändert wird - wie name/price_total in inquiries.selections.
alter table inquiries add column translations jsonb;

comment on column inquiries.translations is
  'Übersetzungen der Positionstexte zum Zeitpunkt der Anfrage, je Sprache ({"en": {Quelltext: Übersetzung}}), null wenn keine vorhanden. Snapshot wie selections, wird nie nachträglich neu berechnet.';
