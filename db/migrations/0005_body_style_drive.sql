-- Karosserieform und Antrieb (Entscheid 21.09.2026, Rückfrage «kann das
-- System zwischen Touring und Limousine unterscheiden?»): die Excel-
-- Preisliste kennt keine Karosserie-Spalte, aber vor allem Fahrwerks-
-- Produkte sind karosserie- bzw. antriebsspezifisch («Sportfahrwerk
-- höhenverstellbar Touring», «Sportfedernsatz F31,34», «Sportfedersatz
-- -25mm G31», «... mit xdrive»/«... ohne xdrive»). Beide Felder werden aus
-- dem Produktnamen abgeleitet (lib/catalog/body-style.ts,
-- lib/catalog/drive.ts), nie aus der Excel gelesen, und bei jedem Import
-- neu berechnet (wie products.gearbox). Der Flow fragt die Karosserieform
-- bzw. den Antrieb im Fahrzeug-Schritt ab, wenn das Modell Produkte mit
-- unterschiedlichen Karosserieformen bzw. Antrieben hat, und blendet im
-- Kategorie-Schritt die nicht passenden Varianten aus.

alter table products
  add column body_styles text[] not null default '{}',
  add column drive text;

alter table products
  add constraint products_drive_check
    check (drive is null or drive in ('xdrive', 'rwd'));

comment on column products.body_styles is
  'Karosserieformen, für die das Produkt gilt (limousine | touring | gran_turismo | coupe | cabrio | gran_coupe | dreituerer | fuenftuerer), aus dem Namen abgeleitet (lib/catalog/body-style.ts). Leer = gilt für alle Karosserieformen. Wird bei jedem Import neu berechnet.';
comment on column products.drive is
  'Antrieb, für den das Produkt gilt (xdrive | rwd), aus dem Namen abgeleitet (lib/catalog/drive.ts). null = antriebsneutral. Wird bei jedem Import neu berechnet.';

alter table inquiries
  add column body_style text,
  add column drive text;

alter table inquiries
  add constraint inquiries_body_style_check
    check (body_style is null or body_style in ('limousine', 'touring', 'gran_turismo', 'coupe', 'cabrio', 'gran_coupe', 'dreituerer', 'fuenftuerer')),
  add constraint inquiries_drive_check
    check (drive is null or drive in ('xdrive', 'rwd'));

comment on column inquiries.body_style is
  'Im Fahrzeug-Schritt gewählte Karosserieform (oder aus der Modellwahl inquiries.line abgeleitet, z.B. «Cabrio»), null wenn die Frage nicht gestellt wurde. Wird beim Anlegen gegen die aktuellen Optionen des Modells geprüft (lib/inquiry/create.ts).';
comment on column inquiries.drive is
  'Im Fahrzeug-Schritt gewählter Antrieb (xdrive | rwd), null wenn die Frage nicht gestellt wurde. Wird beim Anlegen gegen die aktuellen Optionen des Modells geprüft (lib/inquiry/create.ts).';
