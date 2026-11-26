-- Chrono Flow · Calendar sharing option 1
-- Apply once in Supabase SQL Editor. Safe to re-run where noted.
-- Security model: source/projection rows are never directly readable by viewers.
-- A SECURITY DEFINER RPC checks the active membership and masks every disabled field.

create extension if not exists pgcrypto;
create extension if not exists citext;

create table if not exists public.cf_calendar_spaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'personal' check (kind in ('personal','family','group')),
  name text not null default 'Il mio calendario' check (char_length(name) between 1 and 80),
  is_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, kind)
);

create table if not exists public.cf_calendar_share_settings (
  space_id uuid primary key references public.cf_calendar_spaces(id) on delete cascade,
  share_work_mode boolean not null default true,
  share_generic_absence boolean not null default false,
  share_times boolean not null default false,
  share_overtime boolean not null default false,
  share_meal_vouchers boolean not null default false,
  share_leave_balance boolean not null default false,
  share_absence_details boolean not null default false,
  share_personal_notes boolean not null default false,
  share_children_info boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.cf_calendar_invitations (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.cf_calendar_spaces(id) on delete cascade,
  inviter_id uuid not null references auth.users(id) on delete cascade,
  invitee_email citext not null,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','cancelled','expired')),
  accepted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  responded_at timestamptz,
  check (expires_at > created_at)
);

create unique index if not exists cf_calendar_invites_one_pending
  on public.cf_calendar_invitations(space_id, lower(invitee_email::text))
  where status = 'pending';

create table if not exists public.cf_calendar_members (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.cf_calendar_spaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('viewer','member','admin')),
  status text not null default 'active' check (status in ('active','revoked')),
  invitation_id uuid references public.cf_calendar_invitations(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (space_id, user_id)
);

create table if not exists public.cf_calendar_entries (
  space_id uuid not null references public.cf_calendar_spaces(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  work_date date not null,
  mode text check (mode is null or mode in ('office','smart','travel','other')),
  is_absent boolean not null default false,
  generic_absence_label text,
  clock_in time,
  clock_out time,
  overtime_minutes integer check (overtime_minutes is null or overtime_minutes between 0 and 10080),
  meal_voucher boolean,
  leave_balance_days numeric(8,2),
  absence_type text,
  personal_notes text,
  children_info jsonb,
  source_updated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (space_id, work_date)
);

create index if not exists cf_calendar_entries_range_idx
  on public.cf_calendar_entries(space_id, work_date);
create index if not exists cf_calendar_members_user_idx
  on public.cf_calendar_members(user_id, status);
create index if not exists cf_calendar_invites_email_idx
  on public.cf_calendar_invitations(lower(invitee_email::text), status);

create or replace function public.cf_touch_updated_at()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists cf_spaces_touch on public.cf_calendar_spaces;
create trigger cf_spaces_touch before update on public.cf_calendar_spaces
for each row execute function public.cf_touch_updated_at();
drop trigger if exists cf_settings_touch on public.cf_calendar_share_settings;
create trigger cf_settings_touch before update on public.cf_calendar_share_settings
for each row execute function public.cf_touch_updated_at();
drop trigger if exists cf_entries_touch on public.cf_calendar_entries;
create trigger cf_entries_touch before update on public.cf_calendar_entries
for each row execute function public.cf_touch_updated_at();

alter table public.cf_calendar_spaces enable row level security;
alter table public.cf_calendar_share_settings enable row level security;
alter table public.cf_calendar_invitations enable row level security;
alter table public.cf_calendar_members enable row level security;
alter table public.cf_calendar_entries enable row level security;

-- Direct table access remains owner-only (or invitee for the invitation envelope).
drop policy if exists cf_spaces_owner_select on public.cf_calendar_spaces;
create policy cf_spaces_owner_select on public.cf_calendar_spaces for select to authenticated
using (owner_id = auth.uid());
drop policy if exists cf_spaces_owner_update on public.cf_calendar_spaces;
create policy cf_spaces_owner_update on public.cf_calendar_spaces for update to authenticated
using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists cf_settings_owner_all on public.cf_calendar_share_settings;
create policy cf_settings_owner_all on public.cf_calendar_share_settings for all to authenticated
using (exists (select 1 from public.cf_calendar_spaces s where s.id = space_id and s.owner_id = auth.uid()))
with check (exists (select 1 from public.cf_calendar_spaces s where s.id = space_id and s.owner_id = auth.uid()));

drop policy if exists cf_invites_parties_select on public.cf_calendar_invitations;
create policy cf_invites_parties_select on public.cf_calendar_invitations for select to authenticated
using (
  inviter_id = auth.uid()
  or lower(invitee_email::text) = lower(coalesce(auth.jwt() ->> 'email',''))
);
drop policy if exists cf_invites_owner_insert on public.cf_calendar_invitations;
create policy cf_invites_owner_insert on public.cf_calendar_invitations for insert to authenticated
with check (
  inviter_id = auth.uid()
  and exists (select 1 from public.cf_calendar_spaces s where s.id = space_id and s.owner_id = auth.uid())
);
drop policy if exists cf_invites_owner_update on public.cf_calendar_invitations;
create policy cf_invites_owner_update on public.cf_calendar_invitations for update to authenticated
using (inviter_id = auth.uid()) with check (inviter_id = auth.uid());

drop policy if exists cf_members_parties_select on public.cf_calendar_members;
create policy cf_members_parties_select on public.cf_calendar_members for select to authenticated
using (
  user_id = auth.uid()
  or exists (select 1 from public.cf_calendar_spaces s where s.id = space_id and s.owner_id = auth.uid())
);

drop policy if exists cf_entries_owner_all on public.cf_calendar_entries;
create policy cf_entries_owner_all on public.cf_calendar_entries for all to authenticated
using (owner_id = auth.uid()) with check (
  owner_id = auth.uid()
  and exists (select 1 from public.cf_calendar_spaces s where s.id = space_id and s.owner_id = auth.uid())
);

-- Nobody reads raw rows through PostgREST except their owner. Viewers must use cf_get_shared_calendar.
revoke all on public.cf_calendar_spaces from anon;
revoke all on public.cf_calendar_share_settings from anon;
revoke all on public.cf_calendar_invitations from anon;
revoke all on public.cf_calendar_members from anon;
revoke all on public.cf_calendar_entries from anon;
grant select, update on public.cf_calendar_spaces to authenticated;
grant select, insert, update on public.cf_calendar_share_settings to authenticated;
grant select, insert, update on public.cf_calendar_invitations to authenticated;
grant select on public.cf_calendar_members to authenticated;
grant select, insert, update, delete on public.cf_calendar_entries to authenticated;

create or replace function public.cf_user_label(p_user_id uuid)
returns text
language sql stable security definer
set search_path = pg_catalog, auth
as $$
  select coalesce(
    nullif(trim(raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(raw_user_meta_data ->> 'name'), ''),
    split_part(coalesce(email, 'Utente Chrono Flow'), '@', 1)
  ) from auth.users where id = p_user_id
$$;

create or replace function public.cf_mask_email(p_email text)
returns text language sql immutable set search_path = pg_catalog as $$
  select case
    when position('@' in coalesce(p_email,'')) <= 2 then '***' || substring(p_email from position('@' in p_email))
    else left(p_email, 2) || '***' || substring(p_email from position('@' in p_email))
  end
$$;

create or replace function public.cf_ensure_personal_calendar_space()
returns uuid
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare v_user uuid := auth.uid(); v_space uuid;
begin
  if v_user is null then raise exception 'Autenticazione richiesta'; end if;
  insert into public.cf_calendar_spaces(owner_id, kind, name)
  values (v_user, 'personal', 'Il mio calendario')
  on conflict (owner_id, kind) do update set owner_id = excluded.owner_id
  returning id into v_space;
  insert into public.cf_calendar_share_settings(space_id) values (v_space)
  on conflict (space_id) do nothing;
  return v_space;
end $$;

create or replace function public.cf_get_calendar_sharing_dashboard()
returns jsonb
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare v_user uuid := auth.uid(); v_space uuid; v_result jsonb;
begin
  if v_user is null then raise exception 'Autenticazione richiesta'; end if;
  v_space := public.cf_ensure_personal_calendar_space();
  select jsonb_build_object(
    'space', to_jsonb(s),
    'settings', to_jsonb(st),
    'invitations', coalesce((select jsonb_agg(jsonb_build_object(
      'id', i.id, 'invitee_email', i.invitee_email::text, 'status', i.status,
      'created_at', i.created_at, 'expires_at', i.expires_at
    ) order by i.created_at desc) from public.cf_calendar_invitations i where i.space_id = v_space), '[]'::jsonb),
    'members', coalesce((select jsonb_agg(jsonb_build_object(
      'id', m.id, 'display_name', public.cf_user_label(m.user_id),
      'email_masked', public.cf_mask_email(u.email), 'role', m.role, 'created_at', m.created_at
    ) order by m.created_at desc)
      from public.cf_calendar_members m join auth.users u on u.id = m.user_id
      where m.space_id = v_space and m.status = 'active'), '[]'::jsonb)
  ) into v_result
  from public.cf_calendar_spaces s
  join public.cf_calendar_share_settings st on st.space_id = s.id
  where s.id = v_space and s.owner_id = v_user;
  return v_result;
end $$;

create or replace function public.cf_set_calendar_sharing_enabled(p_enabled boolean)
returns boolean
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare v_space uuid;
begin
  v_space := public.cf_ensure_personal_calendar_space();
  update public.cf_calendar_spaces set is_enabled = coalesce(p_enabled,false) where id = v_space and owner_id = auth.uid();
  return coalesce(p_enabled,false);
end $$;

create or replace function public.cf_update_calendar_sharing_settings(p_settings jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare v_space uuid; v_row public.cf_calendar_share_settings;
begin
  v_space := public.cf_ensure_personal_calendar_space();
  update public.cf_calendar_share_settings set
    share_work_mode = coalesce((p_settings ->> 'share_work_mode')::boolean, true),
    share_generic_absence = coalesce((p_settings ->> 'share_generic_absence')::boolean, false),
    share_times = coalesce((p_settings ->> 'share_times')::boolean, false),
    share_overtime = coalesce((p_settings ->> 'share_overtime')::boolean, false),
    share_meal_vouchers = coalesce((p_settings ->> 'share_meal_vouchers')::boolean, false),
    share_leave_balance = coalesce((p_settings ->> 'share_leave_balance')::boolean, false),
    share_absence_details = coalesce((p_settings ->> 'share_absence_details')::boolean, false),
    share_personal_notes = coalesce((p_settings ->> 'share_personal_notes')::boolean, false),
    share_children_info = coalesce((p_settings ->> 'share_children_info')::boolean, false)
  where space_id = v_space returning * into v_row;
  return to_jsonb(v_row);
end $$;

create or replace function public.cf_invite_calendar_viewer(p_email text)
returns uuid
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare v_space uuid; v_email citext; v_id uuid; v_my_email text;
begin
  if auth.uid() is null then raise exception 'Autenticazione richiesta'; end if;
  v_email := lower(trim(coalesce(p_email,'')))::citext;
  if v_email::text !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Email non valida'; end if;
  select email into v_my_email from auth.users where id = auth.uid();
  if lower(v_my_email) = lower(v_email::text) then raise exception 'Non puoi invitare te stesso'; end if;
  v_space := public.cf_ensure_personal_calendar_space();
  if exists (
    select 1 from public.cf_calendar_members m join auth.users u on u.id = m.user_id
    where m.space_id = v_space and m.status = 'active' and lower(u.email) = lower(v_email::text)
  ) then raise exception 'Questa persona ha già accesso'; end if;
  update public.cf_calendar_invitations set status = 'expired', responded_at = now()
  where space_id = v_space and status = 'pending' and expires_at <= now();
  insert into public.cf_calendar_invitations(space_id, inviter_id, invitee_email)
  values (v_space, auth.uid(), v_email) returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'Esiste già un invito in attesa per questa email';
end $$;

create or replace function public.cf_cancel_calendar_invitation(p_invitation_id uuid)
returns boolean
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
begin
  update public.cf_calendar_invitations i set status = 'cancelled', responded_at = now()
  where i.id = p_invitation_id and i.inviter_id = auth.uid() and i.status = 'pending';
  if not found then raise exception 'Invito non trovato o non annullabile'; end if;
  return true;
end $$;

create or replace function public.cf_list_calendar_invitations()
returns table(id uuid, space_id uuid, owner_display_name text, status text, created_at timestamptz, expires_at timestamptz)
language sql security definer
set search_path = public, auth, pg_temp
as $$
  select i.id, i.space_id, public.cf_user_label(s.owner_id),
    case when i.status = 'pending' and i.expires_at <= now() then 'expired' else i.status end,
    i.created_at, i.expires_at
  from public.cf_calendar_invitations i
  join public.cf_calendar_spaces s on s.id = i.space_id
  where auth.uid() is not null
    and lower(i.invitee_email::text) = lower(coalesce(auth.jwt() ->> 'email',''))
  order by i.created_at desc
$$;

create or replace function public.cf_respond_calendar_invitation(p_invitation_id uuid, p_accept boolean)
returns boolean
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare v_invite public.cf_calendar_invitations;
begin
  if auth.uid() is null then raise exception 'Autenticazione richiesta'; end if;
  select * into v_invite from public.cf_calendar_invitations
  where id = p_invitation_id for update;
  if not found or lower(v_invite.invitee_email::text) <> lower(coalesce(auth.jwt() ->> 'email','')) then
    raise exception 'Invito non disponibile per questo account';
  end if;
  if v_invite.status <> 'pending' or v_invite.expires_at <= now() then raise exception 'Invito scaduto o già gestito'; end if;
  if p_accept then
    insert into public.cf_calendar_members(space_id, user_id, role, status, invitation_id, revoked_at)
    values (v_invite.space_id, auth.uid(), 'viewer', 'active', v_invite.id, null)
    on conflict (space_id, user_id) do update set status = 'active', role = 'viewer', invitation_id = excluded.invitation_id, revoked_at = null;
    update public.cf_calendar_invitations set status = 'accepted', accepted_by = auth.uid(), responded_at = now() where id = v_invite.id;
  else
    update public.cf_calendar_invitations set status = 'rejected', accepted_by = auth.uid(), responded_at = now() where id = v_invite.id;
  end if;
  return true;
end $$;

create or replace function public.cf_revoke_calendar_member(p_member_id uuid)
returns boolean
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
begin
  update public.cf_calendar_members m set status = 'revoked', revoked_at = now()
  where m.id = p_member_id and m.status = 'active'
    and exists (select 1 from public.cf_calendar_spaces s where s.id = m.space_id and s.owner_id = auth.uid());
  if not found then raise exception 'Accesso non trovato'; end if;
  return true;
end $$;

create or replace function public.cf_list_shared_calendars()
returns table(space_id uuid, owner_id uuid, owner_display_name text, owner_email_masked text, name text, kind text)
language sql security definer
set search_path = public, auth, pg_temp
as $$
  select s.id, s.owner_id, public.cf_user_label(s.owner_id), public.cf_mask_email(u.email), s.name, s.kind
  from public.cf_calendar_members m
  join public.cf_calendar_spaces s on s.id = m.space_id
  join auth.users u on u.id = s.owner_id
  where auth.uid() is not null and m.user_id = auth.uid() and m.status = 'active' and s.is_enabled
  order by public.cf_user_label(s.owner_id)
$$;

create or replace function public.cf_get_shared_calendar(p_space_id uuid, p_from date, p_to date)
returns table(
  work_date date, mode text, is_absent boolean, generic_absence_label text,
  clock_in text, clock_out text, overtime_minutes integer, meal_voucher boolean,
  leave_balance_days numeric, absence_type text, personal_notes text, children_info jsonb
)
language plpgsql stable security definer
set search_path = public, auth, pg_temp
as $$
declare v_owner boolean; v_allowed boolean;
begin
  if auth.uid() is null then raise exception 'Autenticazione richiesta'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then raise exception 'Intervallo non valido'; end if;
  select s.owner_id = auth.uid(),
    (s.owner_id = auth.uid()) or (s.is_enabled and exists (
      select 1 from public.cf_calendar_members m where m.space_id = s.id and m.user_id = auth.uid() and m.status = 'active'
    )) into v_owner, v_allowed
  from public.cf_calendar_spaces s where s.id = p_space_id;
  if not coalesce(v_allowed,false) then raise exception 'Accesso al calendario non consentito'; end if;

  return query
  select e.work_date,
    case when v_owner or st.share_work_mode then e.mode else null end,
    case when v_owner or st.share_generic_absence or st.share_absence_details then e.is_absent else false end,
    case when v_owner or st.share_generic_absence then case when e.is_absent then 'Assente' else null end else null end,
    case when v_owner or st.share_times then to_char(e.clock_in, 'HH24:MI') else null end,
    case when v_owner or st.share_times then to_char(e.clock_out, 'HH24:MI') else null end,
    case when v_owner or st.share_overtime then e.overtime_minutes else null end,
    case when v_owner or st.share_meal_vouchers then e.meal_voucher else null end,
    case when v_owner or st.share_leave_balance then e.leave_balance_days else null end,
    case when v_owner or st.share_absence_details then e.absence_type else null end,
    case when v_owner or st.share_personal_notes then e.personal_notes else null end,
    case when v_owner or st.share_children_info then e.children_info else null end
  from public.cf_calendar_entries e
  join public.cf_calendar_share_settings st on st.space_id = e.space_id
  where e.space_id = p_space_id and e.work_date between p_from and p_to
  order by e.work_date;
end $$;

create or replace function public.cf_upsert_calendar_projection(p_entries jsonb)
returns integer
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare v_space uuid; v_count integer := 0; v_item jsonb; v_date date; v_mode text;
begin
  if auth.uid() is null then raise exception 'Autenticazione richiesta'; end if;
  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) > 400 then raise exception 'Elenco giornate non valido'; end if;
  v_space := public.cf_ensure_personal_calendar_space();
  for v_item in select value from jsonb_array_elements(p_entries) loop
    v_date := (v_item ->> 'work_date')::date;
    v_mode := nullif(v_item ->> 'mode','');
    if v_mode is not null and v_mode not in ('office','smart','travel','other') then raise exception 'Modalità non valida'; end if;
    insert into public.cf_calendar_entries(
      space_id, owner_id, work_date, mode, is_absent, generic_absence_label,
      clock_in, clock_out, overtime_minutes, meal_voucher, leave_balance_days,
      absence_type, personal_notes, children_info, source_updated_at
    ) values (
      v_space, auth.uid(), v_date, v_mode, coalesce((v_item ->> 'is_absent')::boolean,false),
      left(nullif(v_item ->> 'generic_absence_label',''),80),
      nullif(v_item ->> 'clock_in','')::time, nullif(v_item ->> 'clock_out','')::time,
      nullif(v_item ->> 'overtime_minutes','')::integer,
      nullif(v_item ->> 'meal_voucher','')::boolean,
      nullif(v_item ->> 'leave_balance_days','')::numeric,
      left(nullif(v_item ->> 'absence_type',''),120),
      left(nullif(v_item ->> 'personal_notes',''),2000), v_item -> 'children_info', now()
    ) on conflict (space_id, work_date) do update set
      mode = excluded.mode, is_absent = excluded.is_absent,
      generic_absence_label = excluded.generic_absence_label,
      clock_in = excluded.clock_in, clock_out = excluded.clock_out,
      overtime_minutes = excluded.overtime_minutes, meal_voucher = excluded.meal_voucher,
      leave_balance_days = excluded.leave_balance_days, absence_type = excluded.absence_type,
      personal_notes = excluded.personal_notes, children_info = excluded.children_info,
      source_updated_at = excluded.source_updated_at;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

create or replace function public.cf_delete_calendar_projection(p_from date, p_to date)
returns integer
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare v_space uuid; v_count integer;
begin
  if auth.uid() is null then raise exception 'Autenticazione richiesta'; end if;
  if p_to < p_from or p_to - p_from > 400 then raise exception 'Intervallo non valido'; end if;
  v_space := public.cf_ensure_personal_calendar_space();
  delete from public.cf_calendar_entries where space_id = v_space and owner_id = auth.uid() and work_date between p_from and p_to;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.cf_user_label(uuid) from public, anon, authenticated;
revoke all on function public.cf_mask_email(text) from public, anon;
revoke all on function public.cf_ensure_personal_calendar_space() from public, anon;
revoke all on function public.cf_get_calendar_sharing_dashboard() from public, anon;
revoke all on function public.cf_set_calendar_sharing_enabled(boolean) from public, anon;
revoke all on function public.cf_update_calendar_sharing_settings(jsonb) from public, anon;
revoke all on function public.cf_invite_calendar_viewer(text) from public, anon;
revoke all on function public.cf_cancel_calendar_invitation(uuid) from public, anon;
revoke all on function public.cf_list_calendar_invitations() from public, anon;
revoke all on function public.cf_respond_calendar_invitation(uuid,boolean) from public, anon;
revoke all on function public.cf_revoke_calendar_member(uuid) from public, anon;
revoke all on function public.cf_list_shared_calendars() from public, anon;
revoke all on function public.cf_get_shared_calendar(uuid,date,date) from public, anon;
revoke all on function public.cf_upsert_calendar_projection(jsonb) from public, anon;
revoke all on function public.cf_delete_calendar_projection(date,date) from public, anon;

grant execute on function public.cf_ensure_personal_calendar_space() to authenticated;
grant execute on function public.cf_get_calendar_sharing_dashboard() to authenticated;
grant execute on function public.cf_set_calendar_sharing_enabled(boolean) to authenticated;
grant execute on function public.cf_update_calendar_sharing_settings(jsonb) to authenticated;
grant execute on function public.cf_invite_calendar_viewer(text) to authenticated;
grant execute on function public.cf_cancel_calendar_invitation(uuid) to authenticated;
grant execute on function public.cf_list_calendar_invitations() to authenticated;
grant execute on function public.cf_respond_calendar_invitation(uuid,boolean) to authenticated;
grant execute on function public.cf_revoke_calendar_member(uuid) to authenticated;
grant execute on function public.cf_list_shared_calendars() to authenticated;
grant execute on function public.cf_get_shared_calendar(uuid,date,date) to authenticated;
grant execute on function public.cf_upsert_calendar_projection(jsonb) to authenticated;
grant execute on function public.cf_delete_calendar_projection(date,date) to authenticated;

comment on table public.cf_calendar_entries is 'Private owner projection. Viewers can only read masked values through cf_get_shared_calendar.';
comment on table public.cf_calendar_spaces is 'Personal today; kind supports future family/group spaces without replacing the model.';
