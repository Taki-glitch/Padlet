-- Retourne l'espace utilisé (en octets) par le bucket "documents".
-- security definer : le calcul ne dépend plus des politiques RLS de listage.
create or replace function public.documents_storage_usage()
returns bigint
language sql
stable
security definer
set search_path = public, storage
as $$
  select coalesce(sum((metadata->>'size')::bigint), 0)
  from storage.objects
  where bucket_id = 'documents';
$$;

revoke all on function public.documents_storage_usage() from public, anon;
grant execute on function public.documents_storage_usage() to authenticated;
