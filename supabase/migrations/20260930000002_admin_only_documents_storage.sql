-- Firestore Rules protect padletItems. Keep the associated Supabase Storage
-- writes aligned with the same admin-only editing policy.
drop policy if exists "Authenticated upload documents" on storage.objects;
drop policy if exists "Authenticated delete documents" on storage.objects;

create policy "Admins may upload documents"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'documents'
  and exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  )
);

create policy "Admins may delete documents"
on storage.objects for delete to authenticated
using (
  bucket_id = 'documents'
  and exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  )
);
