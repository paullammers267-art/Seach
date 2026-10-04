-- Alltagsheld – Push-Erinnerungen (auch bei geschlossener App)
-- Voraussetzung: schema.sql ist ausgeführt und die Edge Function „push-reminders“ ist angelegt.
-- Einmal im SQL Editor ausführen. Vorher die zwei Platzhalter ganz unten ersetzen.

-- Push-Anmeldungen der Geräte (eine Zeile pro Handy/Browser)
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  tz         text,
  device     text,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "Eigene Geräte lesen"   on public.push_subscriptions;
drop policy if exists "Eigene Geräte anlegen" on public.push_subscriptions;
drop policy if exists "Eigene Geräte ändern"  on public.push_subscriptions;
drop policy if exists "Eigene Geräte löschen" on public.push_subscriptions;
create policy "Eigene Geräte lesen"   on public.push_subscriptions for select to authenticated using ((select auth.uid()) = user_id);
create policy "Eigene Geräte anlegen" on public.push_subscriptions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Eigene Geräte ändern"  on public.push_subscriptions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Eigene Geräte löschen" on public.push_subscriptions for delete to authenticated using ((select auth.uid()) = user_id);

-- Bereits verschickte Nachrichten (damit nichts doppelt kommt) – nur für die Edge Function
create table if not exists public.push_sent (
  user_id uuid not null references auth.users (id) on delete cascade,
  key     text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.push_sent enable row level security;  -- keine Regeln = für die App unsichtbar

-- Zeitplaner: alle 5 Minuten die Funktion aufrufen
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('alltagsheld-push') where exists (select 1 from cron.job where jobname = 'alltagsheld-push');
select cron.schedule(
  'alltagsheld-push',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://mthtdwahlhxmtczczvbn.supabase.co/functions/v1/push-reminders',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer DEIN_ANON_KEY',
      'x-cron-secret', 'DEIN_CRON_SECRET'
    ),
    body    := '{}'::jsonb
  );
  $$
);
