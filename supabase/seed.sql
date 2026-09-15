-- Seed-Daten für `supabase db reset`.
-- Nur Konfiguration und Platzhalter, keine Preise oder Produkte (die kommen
-- ausschliesslich per Excel-Import, siehe CLAUDE.md, Abschnitt
-- "Arbeitsweise"). Alle insert-Statements sind idempotent (on conflict do
-- nothing / do update), damit ein wiederholter `db reset` nicht scheitert.

-- ---------------------------------------------------------------------------
-- Einstellungen (Absender, Signatur, Firmenadresse)
-- ---------------------------------------------------------------------------

insert into public.settings (key, value) values
  ('mail_from_name', 'dÄHLer Competition Line AG'),
  ('mail_from', 'anfrage@daehler.com'),
  ('mail_inbox', 'info@daehler.com'),
  ('mail_bcc', 'info@daehler.com'),
  ('mail_reply_to', 'info@daehler.com'),
  ('signature_name', 'Christoph Dähler'),
  ('signature_phone', '+41 31 819 88 77'),
  ('company_address', 'dÄHLer Competition Line AG, Belp')
on conflict (key) do update set value = excluded.value;

-- ---------------------------------------------------------------------------
-- Beispiel-Follow-up-Regel (inaktiv, der Kunde aktiviert und passt im Admin
-- an, siehe docs/architektur.md, Abschnitt "Follow-ups")
-- ---------------------------------------------------------------------------

insert into public.follow_up_rules (id, name, days_after_reply, subject, body, max_count, active, sort)
values (
  '00000000-0000-0000-0000-000000000001',
  'Nachfrage 14 Tage nach Antwort',
  14,
  'Ihre Anfrage bei dÄHLer, Nr. {{nummer}}',
  'Guten Tag {{vorname}} {{name}}' || chr(10) || chr(10) ||
  'Vor einigen Tagen haben wir Ihnen zu Ihrem {{fahrzeug}} ein Angebot zukommen lassen. ' ||
  'Gerne möchten wir nachfragen, ob sich bei Ihnen inzwischen Fragen ergeben haben oder ob wir ' ||
  'für Sie einen Termin vereinbaren dürfen.' || chr(10) || chr(10) ||
  'Wir freuen uns auf Ihre Rückmeldung.' || chr(10) || chr(10) ||
  'Freundliche Grüsse',
  1,
  false,
  0
)
on conflict (id) do update set
  name = excluded.name,
  days_after_reply = excluded.days_after_reply,
  subject = excluded.subject,
  body = excluded.body,
  max_count = excluded.max_count,
  sort = excluded.sort;

-- ---------------------------------------------------------------------------
-- Familien-Platzhalter ohne Preisliste (Kurzablauf "auf Anfrage", siehe
-- CLAUDE.md, Abschnitt "Modelle ohne Preisliste")
-- ---------------------------------------------------------------------------

-- Namen bewusst ohne Markenwort (Wiesmann ausgenommen, da dort der
-- Markenname selbst der einzig sinnvolle Platzhaltername ist): die
-- Formel setzt die Marke ohnehin über prependBrand() davor, ein
-- Markenwort im Namen ergäbe sonst z.B. "MINI Älteres MINI-Modell"
-- (Feinschliff-Prüfung 15.09.2026, siehe lib/catalog/vehicle-label.ts
-- stripBrandWord()/vehicleFamilyLine()).
insert into public.model_families (brand, name, slug, has_pricelist, sort) values
  ('Wiesmann', 'Wiesmann', 'wiesmann', false, 999),
  ('BMW', 'Älteres Modell', 'bmw-aelteres-modell', false, 999),
  ('MINI', 'Älteres Modell', 'mini-aelteres-modell', false, 999),
  ('Toyota', 'Anderes Modell', 'toyota-anderes-modell', false, 999)
on conflict (slug) do update set
  brand = excluded.brand,
  name = excluded.name,
  has_pricelist = excluded.has_pricelist,
  sort = excluded.sort;

-- ---------------------------------------------------------------------------
-- Startfotos für bereits bekannte Modellfamilien (siehe
-- lib/catalog/seed-photos.ts, Quelle der Wahrheit für diese Zuordnung).
-- Reine UPDATE-Statements: solange die jeweilige Familie noch nicht per
-- Excel-Import angelegt wurde, treffen sie keine Zeile und tun nichts.
-- ---------------------------------------------------------------------------

update public.model_families set photo_url = '/img/models/m2g87.jpg'
  where slug = 'm2-g87';
update public.model_families set photo_url = '/img/models/m3g81.jpg'
  where slug = 'm3-m4-g80-g81-g82-g83';
update public.model_families set photo_url = '/img/models/m5g99.jpg'
  where slug = 'm5-g90-m5-g99-touring';
update public.model_families set photo_url = '/img/models/x3g45.jpg'
  where slug = 'x3-g45';
