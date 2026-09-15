-- Rückmeldungen aus dem ersten Klicktest (Kundenflow M2 G87), siehe
-- CLAUDE.md Abschnitt "AUFGABE" und docs/excel-import.md, Abschnitt
-- "Getriebe (Kraftübertragung)".
--
-- products.gearbox: aus dem Produktnamen abgeleitetes Feld (siehe
-- lib/catalog/gearbox.ts gearboxFor()), NICHT aus der Excel selbst (die
-- Preisliste enthält keine Getriebe-Spalte je Modell). Nullable: die
-- meisten Produkte sind getriebeneutral (z.B. Exterieur, Fahrwerk).
alter table public.products
  add column if not exists gearbox text;

alter table public.products
  add constraint products_gearbox_check
    check (gearbox is null or gearbox in ('manual', 'automatic'));

comment on column public.products.gearbox is
  'Getriebespezifisch aus dem Produktnamen abgeleitet (lib/catalog/gearbox.ts), null wenn getriebeneutral. Wird bei jedem Import neu berechnet.';

-- inquiries.gearbox: die vom Kunden im Fahrzeug-Schritt beantwortete
-- Getriebefrage. 'unknown' ist ein eigener, gespeicherter Wert ("Weiss ich
-- nicht", Kategorie-Schritte zeigen dann alle getriebespezifischen Produkte
-- weiterhin an); null bedeutet: die Frage wurde gar nicht gestellt (Modell
-- ohne getriebespezifische Produkte, oder Kurzablauf ohne Modell).
alter table public.inquiries
  add column if not exists gearbox text;

alter table public.inquiries
  add constraint inquiries_gearbox_check
    check (gearbox is null or gearbox in ('manual', 'automatic', 'unknown'));

comment on column public.inquiries.gearbox is
  'Antwort auf die Getriebefrage im Fahrzeug-Schritt (manual/automatic/unknown), null wenn nicht gefragt.';
