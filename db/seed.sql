-- Seed-Daten für den lokalen Postgres (npm run db:seed bzw.
-- scripts/migrate.ts --seed). Nur Konfiguration und Platzhalter, keine Preise oder
-- Produkte (die kommen ausschliesslich per Excel-Import, siehe CLAUDE.md,
-- Abschnitt "Arbeitsweise"). Alle insert-Statements sind idempotent (on
-- conflict do nothing / do update), damit ein wiederholter Lauf nicht
-- scheitert.

-- ---------------------------------------------------------------------------
-- Einstellungen (Absender, Signatur, Firmenadresse)
--
-- Nur fehlende Schlüssel anlegen (do nothing): scripts/start.sh spielt den
-- Seed bei jedem Railway-Start ein. Mit "do update" wurden Werte, die der
-- Kunde im Admin unter Einstellungen geändert hatte (Postfach, Kopie,
-- Telefon in der Signatur), bei jedem Deploy zurückgesetzt (Befund
-- 21.09.2026). Gleiches gilt unten für die Follow-up-Regel und die
-- Startfotos.
-- ---------------------------------------------------------------------------

insert into settings (key, value) values
  ('mail_from_name', 'dÄHLer Competition Line AG'),
  ('mail_from', 'anfrage@daehler.com'),
  ('mail_inbox', 'info@daehler.com'),
  ('mail_bcc', 'info@daehler.com'),
  ('mail_reply_to', 'info@daehler.com'),
  ('signature_name', 'Christoph Dähler'),
  ('signature_phone', '+41 31 819 88 77'),
  ('company_address', 'dÄHLer Competition Line AG, Belp')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Beispiel-Follow-up-Regel (inaktiv, der Kunde aktiviert und passt im
-- Admin an, siehe CLAUDE.md Abschnitt "Follow-ups (Posten 6)")
-- ---------------------------------------------------------------------------

insert into follow_up_rules (id, name, days_after_reply, subject, body, max_count, active, sort)
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
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Familien-Platzhalter ohne Preisliste (Kurzablauf "auf Anfrage", siehe
-- CLAUDE.md, Abschnitt "Modelle ohne Preisliste")
-- ---------------------------------------------------------------------------

-- Namen bewusst ohne Markenwort (Wiesmann ausgenommen, da dort der
-- Markenname selbst der einzig sinnvolle Platzhaltername ist): die
-- Formel setzt die Marke ohnehin über prependBrand() davor, ein
-- Markenwort im Namen ergäbe sonst z.B. "MINI Älteres MINI-Modell"
-- (siehe lib/catalog/vehicle-label.ts stripBrandWord()/vehicleFamilyLine()).
insert into model_families (brand, name, slug, has_pricelist, sort) values
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
-- Nur wenn noch kein Foto hinterlegt ist (photo_url is null), wie
-- lib/pricelist/apply.ts applySeedPhotos(): ein im Admin hochgeladenes
-- Foto darf der Seed beim nächsten Start nicht durch das Startfoto ersetzen.
-- ---------------------------------------------------------------------------

update model_families set photo_url = '/img/models/m2g87.jpg'
  where slug = 'm2-g87' and photo_url is null;
update model_families set photo_url = '/img/models/m3g81.jpg'
  where slug = 'm3-m4-g80-g81-g82-g83' and photo_url is null;
update model_families set photo_url = '/img/models/m5g99.jpg'
  where slug = 'm5-g90-m5-g99-touring' and photo_url is null;
update model_families set photo_url = '/img/models/x3g45.jpg'
  where slug = 'x3-g45' and photo_url is null;
