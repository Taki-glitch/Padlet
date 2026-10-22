-- À appliquer après la migration profiles : les opérations Storage du navigateur
-- portent alors le JWT Supabase de l'utilisateur connecté. Le bucket reste public
-- pour conserver les URLs et les prévisualisations existantes.
drop policy if exists "Public read documents" on storage.objects;
drop policy if exists "Public upload documents" on storage.objects;
drop policy if exists "Public delete documents" on storage.objects;

create policy "Authenticated read documents"
on storage.objects for select to authenticated
using (bucket_id = 'documents');

create policy "Authenticated upload documents"
on storage.objects for insert to authenticated
with check (bucket_id = 'documents');

create policy "Authenticated delete documents"
on storage.objects for delete to authenticated
using (bucket_id = 'documents');
