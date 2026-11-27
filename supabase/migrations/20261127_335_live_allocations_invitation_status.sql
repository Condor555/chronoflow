-- Chrono Flow 3.3.5
-- Migration additiva: percentuali persistenti per le allocazioni automatiche e
-- inviti calendario idempotenti/persistenti. Non elimina dati e non allarga RLS.

begin;

alter table public.work_allocations
  add column if not exists allocation_percentage numeric(5,2);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'work_allocations_percentage_valid'
      and conrelid = 'public.work_allocations'::regclass
  ) then
    alter table public.work_allocations
      add constraint work_allocations_percentage_valid
      check (allocation_percentage is null or (allocation_percentage > 0 and allocation_percentage <= 100));
  end if;
end
$$;

-- Le versioni precedenti dividevano sempre in parti uguali. Il backfill conserva
-- esattamente quella semantica, ma rende stabile la percentuale mentre il timer cresce.
with automatic_counts as (
  select id, round(100.0 / count(*) over (partition by user_id, work_date), 2) as percentage
  from public.work_allocations
  where allocation_method = 'automatic' and allocation_percentage is null
)
update public.work_allocations a
set allocation_percentage = c.percentage
from automatic_counts c
where a.id = c.id;

comment on column public.work_allocations.allocation_percentage is
  'Percentuale stabile applicata al tempo lavorato netto per allocation_method=automatic';

-- Restituisce l'invito pendente esistente invece di creare duplicati o generare
-- un errore: la stessa email resta rappresentata da una sola riga persistente.
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

  select id into v_id
  from public.cf_calendar_invitations
  where space_id = v_space and status = 'pending'
    and lower(invitee_email::text) = lower(v_email::text)
  order by created_at desc limit 1;
  if v_id is not null then return v_id; end if;

  insert into public.cf_calendar_invitations(space_id, inviter_id, invitee_email)
  values (v_space, auth.uid(), v_email) returning id into v_id;
  return v_id;
end $$;

-- Il dashboard è la sorgente persistente dopo refresh/PWA/altro dispositivo e
-- materializza gli inviti scaduti prima di restituire tutti gli stati al proprietario.
create or replace function public.cf_get_calendar_sharing_dashboard()
returns jsonb
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare v_user uuid := auth.uid(); v_space uuid; v_result jsonb;
begin
  if v_user is null then raise exception 'Autenticazione richiesta'; end if;
  v_space := public.cf_ensure_personal_calendar_space();
  update public.cf_calendar_invitations
    set status = 'expired', responded_at = coalesce(responded_at, now())
    where space_id = v_space and status = 'pending' and expires_at <= now();
  select jsonb_build_object(
    'space', to_jsonb(s),
    'settings', to_jsonb(st),
    'invitations', coalesce((select jsonb_agg(jsonb_build_object(
      'id', i.id, 'invitee_email', i.invitee_email::text, 'status', i.status,
      'created_at', i.created_at, 'expires_at', i.expires_at, 'responded_at', i.responded_at
    ) order by i.created_at desc) from public.cf_calendar_invitations i where i.space_id = v_space), '[]'::jsonb),
    'members', coalesce((select jsonb_agg(jsonb_build_object(
      'id', m.id, 'display_name', public.cf_user_label(m.user_id),
      'email_masked', public.cf_mask_email(u.email), 'role', m.role,
      'invitation_id', m.invitation_id, 'created_at', m.created_at
    ) order by m.created_at desc)
      from public.cf_calendar_members m join auth.users u on u.id = m.user_id
      where m.space_id = v_space and m.status = 'active'), '[]'::jsonb)
  ) into v_result
  from public.cf_calendar_spaces s
  join public.cf_calendar_share_settings st on st.space_id = s.id
  where s.id = v_space and s.owner_id = v_user;
  return v_result;
end $$;

grant execute on function public.cf_invite_calendar_viewer(text) to authenticated;
grant execute on function public.cf_get_calendar_sharing_dashboard() to authenticated;

commit;
