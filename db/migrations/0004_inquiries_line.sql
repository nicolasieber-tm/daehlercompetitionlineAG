-- Kundenentscheid 17.09.2026 ("bei X1 und X2 gibt es dieselben
-- Motorisierungen, das Modell ist X1 oder X2"): mehrdeutige Baureihen
-- (X1/X2, X3/X4, X5/X6, 4er Coupé/Cabrio/Grand Coupé, siehe
-- docs/architektur.md Abschnitt "Fahrzeugbezeichnung") werden im Flow per
-- eigener Frage geklärt statt in der Excel-Preisliste aufgetrennt. Die
-- gewählte Alternative wird als id (lib/catalog/vehicle-label.ts
-- vehicleLineOptions(), z.B. "x2") festgehalten, nicht als fertiger Text -
-- die Formel löst daraus bei jedem Aufruf denselben, aktuellen Text auf
-- (Familienname kann sich beim nächsten Import ändern).
alter table inquiries add column line text;

comment on column inquiries.line is
  'Bei mehrdeutiger Baureihe (vehicleLineIsAmbiguous()) im Flow gewählte Alternative, als id aus lib/catalog/vehicle-label.ts vehicleLineOptions() (z.B. "x2"), sonst null. Wird beim Anlegen der Anfrage gegen die aktuellen Optionen geprüft (lib/inquiry/create.ts) - ungültige/veraltete Werte werden nicht gespeichert.';
