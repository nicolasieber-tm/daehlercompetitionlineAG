-- Rückmeldung dÄHLer 28.10.2026 (Beispielmail «Guten Tag Herr Dähler»): optionale
-- Anrede des Kunden im Kontaktschritt (Herr / Frau). Nur für die Anrede in
-- Bestätigungsmail und Antwortentwurf ({{anrede}}), nie aus dem Vornamen
-- abgeleitet. null = keine Angabe, dann «Vorname Name» wie bisher.
alter table inquiries add column salutation text
  check (salutation is null or salutation in ('herr', 'frau'));

comment on column inquiries.salutation is
  'Optionale Anrede aus dem Kontaktschritt: herr | frau, null ohne Angabe. Steuert {{anrede}} in den Mailtexten (lib/mail/anrede.ts).';
