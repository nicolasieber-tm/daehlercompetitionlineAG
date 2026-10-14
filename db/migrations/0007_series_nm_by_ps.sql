-- Rückmeldung dÄHLer 14.10.2026: im PS-Zähler soll das Drehmoment wie die
-- Leistung als Zuwachs erscheinen («+120 Nm»). Die Excel nennt nur das
-- Ziel-Drehmoment der Stufe, nie das Serien-Drehmoment, und eine
-- Motorisierung kann mehrere Serienleistungen haben (M2 G87: 460 / 480 PS,
-- series_ps_suggested), mit je eigenem Serien-Drehmoment. Der Admin pflegt
-- es deshalb je Serienleistung, Schlüssel ist die PS-Zahl als Text
-- ({"460": 550, "480": 600}); series_nm bleibt der allgemeine Wert für
-- Motorisierungen mit nur einer Serienleistung.
alter table models add column series_nm_by_ps jsonb not null default '{}'::jsonb;

comment on column models.series_nm_by_ps is
  'Admin-Feld: Serien-Drehmoment je Serienleistung, {"<PS>": <Nm>}. Vorrang vor series_nm, siehe components/flow/state.ts effectiveSeriesNm().';

-- Serien-Drehmoment zum Zeitpunkt der Anfrage (analog inquiries.series_ps),
-- damit Bestätigungsmail, Teilen-Seite und Admin den Zuwachs auch dann
-- zeigen, wenn der Admin-Wert später geändert wird.
alter table inquiries add column series_nm int;

comment on column inquiries.series_nm is
  'Serien-Drehmoment passend zu series_ps (models.series_nm_by_ps, sonst models.series_nm), serverseitig beim Anlegen ermittelt. Nullable.';
