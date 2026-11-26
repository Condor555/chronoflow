-- Chrono Flow v2.3 — schema multiutente Supabase
-- Eseguire una sola volta nel SQL Editor del progetto Supabase.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  target_minutes integer not null default 456 check (target_minutes between 60 and 900),
  office_break_minutes integer not null default 30 check (office_break_minutes between 0 and 240),
  smart_break_minutes integer not null default 60 check (smart_break_minutes between 0 and 240),
  travel_break_minutes integer not null default 30 check (travel_break_minutes between 0 and 240),
  overtime_threshold integer not null default 10 check (overtime_threshold between 0 and 240),
  ticket_office boolean not null default true,
  ticket_smart boolean not null default false,
  ticket_travel boolean not null default false,
  timezone text not null default 'Europe/Rome',
  family_settings jsonb not null default '{"children":[]}'::jsonb check (jsonb_typeof(family_settings) = 'object'),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  work_date date not null,
  planned_type text not null default 'office' check (planned_type in ('office','smart','travel','absence')),
  actual_type text check (actual_type is null or actual_type in ('office','smart','travel','absence')),
  absence_type text check (absence_type is null or absence_type in (
    'vacation','sickness','child_sickness','parental_leave','maternity_leave',
    'paternity_mandatory','paternity_alternative','marriage_leave','mandatory_leave',
    'leave','recovery','sunday_holiday_recovery','holiday'
  )),
  child_id text,
  events jsonb not null default '[]'::jsonb check (jsonb_typeof(events) = 'array'),
  ticket_override boolean,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, work_date)
);

create index if not exists work_days_user_date_idx on public.work_days (user_id, work_date desc);

alter table public.profiles enable row level security;
alter table public.work_days enable row level security;

-- Ogni utente può leggere e modificare solo il proprio profilo.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- Ogni utente può leggere e modificare solo le proprie giornate.
drop policy if exists "work_days_select_own" on public.work_days;
create policy "work_days_select_own" on public.work_days for select using (auth.uid() = user_id);
drop policy if exists "work_days_insert_own" on public.work_days;
create policy "work_days_insert_own" on public.work_days for insert with check (auth.uid() = user_id);
drop policy if exists "work_days_update_own" on public.work_days;
create policy "work_days_update_own" on public.work_days for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "work_days_delete_own" on public.work_days;
create policy "work_days_delete_own" on public.work_days for delete using (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists work_days_set_updated_at on public.work_days;
create trigger work_days_set_updated_at before update on public.work_days
for each row execute function public.set_updated_at();

-- Crea automaticamente il profilo al primo accesso.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Consenti agli utenti autenticati di usare tabelle e sequenze pubbliche.
grant usage on schema public to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.work_days to authenticated;
