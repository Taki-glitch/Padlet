-- Protect the final active administrator against both sequential and concurrent
-- demotion/deletion. Apply manually after reviewing; this file is not run by the app.
create or replace function public.prevent_removing_last_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_count bigint;
begin
  if tg_op = 'UPDATE' and not (old.role = 'admin' and new.role <> 'admin') then
    return new;
  end if;
  if tg_op = 'DELETE' and old.role <> 'admin' then
    return old;
  end if;

  -- A transaction-scoped advisory lock serializes the count and the role/delete.
  perform pg_advisory_xact_lock(hashtext('public.profiles.prevent_removing_last_admin'));
  select count(*) into admin_count from public.profiles where role = 'admin';
  if admin_count <= 1 then
    raise exception 'At least one administrator must remain active.' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger profiles_prevent_last_admin_change
before update of role or delete on public.profiles
for each row execute function public.prevent_removing_last_admin();
