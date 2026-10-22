-- Les profils sont créés uniquement depuis auth.users. Les rôles ne sont jamais
-- fournis par le navigateur et seul le service_role peut les modifier.
create type public.app_role as enum ('admin', 'user');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9][a-z0-9._-]{2,31}$'),
  role public.app_role not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
create policy "Users may read their own profile" on public.profiles for select to authenticated using (id = auth.uid());

create function public.handle_new_user_profile()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  supplied_username text := lower(coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), split_part(new.email, '@', 1)));
begin
  if new.email !~ '^[a-z0-9][a-z0-9._-]{2,31}@auth\.padlet\.invalid$' then
    raise exception 'Invalid technical email convention';
  end if;
  if supplied_username !~ '^[a-z0-9][a-z0-9._-]{2,31}$' then
    raise exception 'Invalid username metadata';
  end if;
  insert into public.profiles (id, username) values (new.id, supplied_username);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute procedure public.handle_new_user_profile();

create function public.set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
create trigger profiles_set_updated_at before update on public.profiles for each row execute procedure public.set_updated_at();
