-- Privater Storage-Bucket "imports" für die vom Excel-Parser gelieferten
-- Rohdaten (ParsedFamily[] als JSON), die applyPendingImport() beim
-- Übernehmen eines Preislisten-Uploads erneut lädt (siehe
-- lib/pricelist/imports.ts, docs/architektur.md Abschnitt "Excel-Import im
-- Admin"). Anders als "model-photos" ist dieser Bucket nicht öffentlich: die
-- Preislisten sind interne Kalkulationsdaten (Teile-/Montagepreise), nicht
-- nur die im Flow sichtbaren Endpreise.

insert into storage.buckets (id, name, public)
values ('imports', 'imports', false)
on conflict (id) do nothing;

-- storage.objects ist bereits RLS-aktiv (siehe 20260911000000_init.sql,
-- Kommentar bei den model-photos-Policies) - hier nur die Policies für den
-- neuen Bucket anlegen. Nur authenticated (Admin), keine anon-Policy: der
-- Bucket ist nicht public.

create policy imports_authenticated_select
  on storage.objects for select
  to authenticated
  using (bucket_id = 'imports');

create policy imports_authenticated_insert
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'imports');

create policy imports_authenticated_update
  on storage.objects for update
  to authenticated
  using (bucket_id = 'imports')
  with check (bucket_id = 'imports');

create policy imports_authenticated_delete
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'imports');
