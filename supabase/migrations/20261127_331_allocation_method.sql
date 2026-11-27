-- Chrono Flow 3.3.1
-- Migration additiva: distingue allocazioni automatiche e ore manuali.
-- Necessaria per ricalcolare in modo affidabile le ripartizioni automatiche dopo
-- una modifica della giornata, anche su un altro dispositivo.

begin;

alter table public.work_allocations
  add column if not exists allocation_method text not null default 'hours';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'work_allocations_method_valid'
      and conrelid = 'public.work_allocations'::regclass
  ) then
    alter table public.work_allocations
      add constraint work_allocations_method_valid
      check (allocation_method in ('automatic', 'hours'));
  end if;
end
$$;

comment on column public.work_allocations.allocation_method is
  'automatic: ripartizione uguale dell’orario lavorato; hours: ore specificate manualmente';

commit;
