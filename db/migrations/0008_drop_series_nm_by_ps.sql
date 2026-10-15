-- Rückmeldung dÄHLer 15.10.2026: das Drehmoment wird nur noch als Zielwert
-- der Leistungsstufe aus der Excel gezeigt («620 PS / 740 Nm»), nie als
-- Serienwert oder Zuwachs. Die Excel nennt kein Serien-Drehmoment, die
-- Excel-Listen werden dafür nicht geändert, und eine Pflege im Admin für
-- alle Motorisierungen ist nicht gewünscht. Die Spalten aus 0007 entfallen
-- deshalb wieder (models.series_nm bleibt als Spalte bestehen, wird aber
-- weder im Admin gepflegt noch angezeigt).
alter table models drop column if exists series_nm_by_ps;
alter table inquiries drop column if exists series_nm;
