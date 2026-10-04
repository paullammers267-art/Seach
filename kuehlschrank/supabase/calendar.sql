-- Alltagsheld – Gemeinsame Kalender (z. B. Familie, WG, Verein)
-- Einmal im SQL Editor ausführen (nach schema.sql). Kann gefahrlos erneut ausgeführt werden.
-- Nur Mitglieder sehen und ändern die Termine; Beitreten geht nur mit dem Einladungscode.

create table if not exists public.shared_calendars (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  color       text not null default '#2563eb',
  owner       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  invite_code text not null unique default lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  created_at  timestamptz not null default now()
);

create table if not exists public.calendar_members (
  calendar_id uuid not null references public.shared_calendars (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text,
  joined_at   timestamptz not null default now(),
  primary key (calendar_id, user_id)
);

create table if not exists public.shared_events (
  id          uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references public.shared_calendars (id) on delete cascade,
  data        jsonb not null,
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by  uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now()
);
create index if not exists shared_events_calendar on public.shared_events (calendar_id);

-- Mitgliedschaft prüfen (security definer: vermeidet Endlosschleifen in den Regeln)
create or replace function public.is_calendar_member(cal uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.calendar_members m where m.calendar_id = cal and m.user_id = auth.uid());
$$;

alter table public.shared_calendars enable row level security;
alter table public.calendar_members enable row level security;
alter table public.shared_events    enable row level security;

drop policy if exists "Kalender sehen"     on public.shared_calendars;
drop policy if exists "Kalender anlegen"   on public.shared_calendars;
drop policy if exists "Kalender ändern"    on public.shared_calendars;
drop policy if exists "Kalender löschen"   on public.shared_calendars;
create policy "Kalender sehen"   on public.shared_calendars for select to authenticated using (owner = (select auth.uid()) or public.is_calendar_member(id));
create policy "Kalender anlegen" on public.shared_calendars for insert to authenticated with check (owner = (select auth.uid()));
create policy "Kalender ändern"  on public.shared_calendars for update to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy "Kalender löschen" on public.shared_calendars for delete to authenticated using (owner = (select auth.uid()));

drop policy if exists "Mitglieder sehen"   on public.calendar_members;
drop policy if exists "Mitglied austreten" on public.calendar_members;
drop policy if exists "Name ändern"        on public.calendar_members;
create policy "Mitglieder sehen"   on public.calendar_members for select to authenticated using (public.is_calendar_member(calendar_id));
create policy "Mitglied austreten" on public.calendar_members for delete to authenticated using (
  user_id = (select auth.uid()) or exists (select 1 from public.shared_calendars c where c.id = calendar_id and c.owner = (select auth.uid())));
create policy "Name ändern"        on public.calendar_members for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "Termine sehen"    on public.shared_events;
drop policy if exists "Termine anlegen"  on public.shared_events;
drop policy if exists "Termine ändern"   on public.shared_events;
drop policy if exists "Termine löschen"  on public.shared_events;
create policy "Termine sehen"   on public.shared_events for select to authenticated using (public.is_calendar_member(calendar_id));
create policy "Termine anlegen" on public.shared_events for insert to authenticated with check (public.is_calendar_member(calendar_id) and created_by = (select auth.uid()));
create policy "Termine ändern"  on public.shared_events for update to authenticated using (public.is_calendar_member(calendar_id)) with check (public.is_calendar_member(calendar_id));
create policy "Termine löschen" on public.shared_events for delete to authenticated using (public.is_calendar_member(calendar_id));

-- Wer einen Kalender anlegt, ist automatisch Mitglied
create or replace function public.shared_calendar_owner_member()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.calendar_members (calendar_id, user_id, name)
  values (new.id, new.owner, coalesce((select raw_user_meta_data ->> 'name' from auth.users where id = new.owner), ''))
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists shared_calendar_owner_member on public.shared_calendars;
create trigger shared_calendar_owner_member after insert on public.shared_calendars
  for each row execute function public.shared_calendar_owner_member();

-- Bearbeitet von / Zeitpunkt immer vom Server
create or replace function public.shared_events_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists shared_events_touch on public.shared_events;
create trigger shared_events_touch before insert or update on public.shared_events
  for each row execute function public.shared_events_touch();

-- Mit Einladungscode beitreten
create or replace function public.join_calendar(code text, display_name text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare cal uuid;
begin
  if auth.uid() is null then raise exception 'nicht angemeldet'; end if;
  select id into cal from public.shared_calendars where invite_code = lower(trim(code));
  if cal is null then raise exception 'Einladung ungültig'; end if;
  insert into public.calendar_members (calendar_id, user_id, name)
  values (cal, auth.uid(), coalesce(nullif(trim(display_name), ''), (select raw_user_meta_data ->> 'name' from auth.users where id = auth.uid()), ''))
  on conflict (calendar_id, user_id) do update set name = coalesce(nullif(trim(excluded.name), ''), public.calendar_members.name);
  return cal;
end $$;
revoke all on function public.join_calendar(text, text) from public, anon;
grant execute on function public.join_calendar(text, text) to authenticated;

-- Neuen Einladungscode erzeugen (alter Link wird ungültig) – nur für den Besitzer
create or replace function public.new_invite_code(cal uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare c text := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
begin
  update public.shared_calendars set invite_code = c where id = cal and owner = auth.uid();
  if not found then raise exception 'nur der Besitzer kann das'; end if;
  return c;
end $$;
revoke all on function public.new_invite_code(uuid) from public, anon;
grant execute on function public.new_invite_code(uuid) to authenticated;
