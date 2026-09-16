-- Prüfbefund Modul "admin-login-fotos", Befund 1: pricelist_imports.created_by
-- war noch als uuid angelegt (Migration 0001), better-auth-User-Ids (Tabelle
-- "user", Migration 0002_auth.sql) sind aber beliebige text-Ids (z.B.
-- "pbKV0S0HcInkbmk5KWdYOBIv3W0o52r7", keine UUID-Form). Der Insert in
-- lib/pricelist/imports.ts createPendingImport() (aufgerufen mit
-- getAdminUser()-Id aus app/api/admin/pricelists/upload/route.ts) scheiterte
-- dadurch für jeden echten Admin-Login. Weiterhin ohne Fremdschlüssel-
-- Constraint (siehe Kommentar in 0001_init.sql), Prüfung bleibt auf
-- Anwendungsebene - unverändert gegenüber der ursprünglichen Absicht, nur
-- der Spaltentyp wechselt von uuid auf text.
alter table pricelist_imports
  alter column created_by type text using created_by::text;

comment on column pricelist_imports.created_by is
  'Better-auth-User-Id (Tabelle "user", Migration 0002_auth.sql) als text, keine UUID (better-auth-Ids sind keine UUIDs). Keine Fremdschlüssel-Referenz, damit diese Spalte unabhängig von der Auth-Migration bleibt; auf Anwendungsebene geprüft (siehe db/migrations/0001_init.sql, ursprünglicher Kommentar).';
