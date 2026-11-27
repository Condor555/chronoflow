-- Chrono Flow 3.3.0
-- Migration additiva: gestione commesse opzionale e allocazioni multiple per giornata.
-- Non modifica né elimina dati/tabelle esistenti.

begin;

create table if not exists public.work_projects (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  description text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_projects_code_not_blank check (btrim(code) <> ''),
  constraint work_projects_description_not_blank check (btrim(description) <> ''),
  constraint work_projects_code_length check (char_length(code) <= 40),
  constraint work_projects_description_length check (char_length(description) <= 120),
  constraint work_projects_id_user_unique unique (id, user_id)
);

create unique index if not exists work_projects_user_code_unique
  on public.work_projects (user_id, lower(btrim(code)));
create index if not exists work_projects_user_active_idx
  on public.work_projects (user_id, is_active, code);

create table if not exists public.work_allocations (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null,
  work_date date not null,
  start_time time,
  end_time time,
  duration_minutes integer not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_allocations_project_owner_fk
    foreign key (project_id, user_id)
    references public.work_projects(id, user_id)
    on update cascade
    on delete restrict,
  constraint work_allocations_duration_valid check (duration_minutes between 1 and 1440),
  constraint work_allocations_note_length check (char_length(note) <= 240),
  constraint work_allocations_time_pair check (
    (start_time is null and end_time is null)
    or (start_time is not null and end_time is not null and end_time > start_time)
  )
);

create index if not exists work_allocations_user_date_idx
  on public.work_allocations (user_id, work_date);
create index if not exists work_allocations_project_date_idx
  on public.work_allocations (project_id, work_date);

create or replace function public.chrono_flow_330_touch_updated_at()
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

drop trigger if exists work_projects_touch_updated_at on public.work_projects;
create trigger work_projects_touch_updated_at
before update on public.work_projects
for each row execute function public.chrono_flow_330_touch_updated_at();

drop trigger if exists work_allocations_touch_updated_at on public.work_allocations;
create trigger work_allocations_touch_updated_at
before update on public.work_allocations
for each row execute function public.chrono_flow_330_touch_updated_at();

alter table public.work_projects enable row level security;
alter table public.work_allocations enable row level security;

-- Idempotenza: ricrea solo le policy della feature 3.3.0.
drop policy if exists "work_projects_select_own" on public.work_projects;
drop policy if exists "work_projects_insert_own" on public.work_projects;
drop policy if exists "work_projects_update_own" on public.work_projects;
drop policy if exists "work_projects_delete_own" on public.work_projects;

create policy "work_projects_select_own" on public.work_projects
  for select to authenticated using (auth.uid() = user_id);
create policy "work_projects_insert_own" on public.work_projects
  for insert to authenticated with check (auth.uid() = user_id);
create policy "work_projects_update_own" on public.work_projects
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "work_projects_delete_own" on public.work_projects
  for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "work_allocations_select_own" on public.work_allocations;
drop policy if exists "work_allocations_insert_own" on public.work_allocations;
drop policy if exists "work_allocations_update_own" on public.work_allocations;
drop policy if exists "work_allocations_delete_own" on public.work_allocations;

create policy "work_allocations_select_own" on public.work_allocations
  for select to authenticated using (auth.uid() = user_id);
create policy "work_allocations_insert_own" on public.work_allocations
  for insert to authenticated with check (auth.uid() = user_id);
create policy "work_allocations_update_own" on public.work_allocations
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "work_allocations_delete_own" on public.work_allocations
  for delete to authenticated using (auth.uid() = user_id);

grant select, insert, update, delete on public.work_projects to authenticated;
grant select, insert, update, delete on public.work_allocations to authenticated;

commit;
