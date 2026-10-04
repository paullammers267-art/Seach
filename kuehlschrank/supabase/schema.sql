-- Alltagsheld – Datenbank für Konto & Cloud-Sync
-- Einmal im Supabase-Dashboard unter „SQL Editor“ einfügen und auf „Run“ klicken.
-- Jede Person sieht und ändert ausschließlich ihre eigene Zeile (Row Level Security).

create table if not exists public.user_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;

drop policy if exists "Eigene Daten lesen"   on public.user_data;
drop policy if exists "Eigene Daten anlegen" on public.user_data;
drop policy if exists "Eigene Daten ändern"  on public.user_data;
drop policy if exists "Eigene Daten löschen" on public.user_data;

create policy "Eigene Daten lesen"   on public.user_data for select to authenticated using ((select auth.uid()) = user_id);
create policy "Eigene Daten anlegen" on public.user_data for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Eigene Daten ändern"  on public.user_data for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Eigene Daten löschen" on public.user_data for delete to authenticated using ((select auth.uid()) = user_id);

-- Zeitstempel immer vom Server (für den Abgleich zwischen Geräten)
create or replace function public.user_data_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists user_data_touch on public.user_data;
create trigger user_data_touch before insert or update on public.user_data
  for each row execute function public.user_data_touch();

-- „Konto löschen“ in der App: löscht das eigene Konto samt Daten (DSGVO)
create or replace function public.delete_user()
returns void language sql security definer set search_path = '' as $$
  delete from auth.users where id = auth.uid();
$$;

revoke all on function public.delete_user() from public, anon;
grant execute on function public.delete_user() to authenticated;
