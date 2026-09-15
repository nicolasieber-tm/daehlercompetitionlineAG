-- Rückmeldung zweiter Klicktest (Kundenflow M2 G87), siehe CLAUDE.md
-- Abschnitt "AUFGABE", Punkt 3: die Vorher/Nachher-Leistungszeile auf dem
-- Abschluss-Screen, der Teilen-Seite (app/p/[token]/page.tsx) und in der
-- Bestätigungs-/Zusammenfassungsmail braucht die vom Kunden gewählte
-- Serienleistung auch NACH dem Absenden. models.series_ps ist bei vielen
-- Modellen null (z.B. M2 G87 "M2": series_ps_suggested {460,480}, siehe
-- components/flow/state.ts effectiveSeriesPs()) - die tatsächlich gewählte
-- Basis (Chip-Auswahl im Fahrzeug-Schritt, state.seriesPsChoice) wurde
-- bislang nirgends persistiert und war nach dem Absenden nicht mehr
-- rekonstruierbar. lib/inquiry/create.ts speichert sie ab jetzt mit.
alter table public.inquiries
  add column if not exists series_ps int;

comment on column public.inquiries.series_ps is
  'Effektive Serienleistung zum Zeitpunkt der Anfrage (models.series_ps, sonst die im Fahrzeug-Schritt gewählte Serienleistungs-Chip-Auswahl, siehe components/flow/state.ts effectiveSeriesPs()). Nullable: Kurzablauf ohne Modell, oder Serienleistung unbekannt. Für die Vorher/Nachher-Darstellung nach dem Absenden (Abschluss-Screen, Teilen-Seite, Bestätigungs-/Zusammenfassungsmail).';
