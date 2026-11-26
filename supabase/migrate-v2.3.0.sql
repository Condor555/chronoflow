-- Chrono Flow 2.3.0 — migrazione una tantum dello schema esistente
-- Eseguire nel SQL Editor Supabase prima di pubblicare la nuova app.
-- Lo script non crea funzioni permanenti ed è idempotente.

begin;

alter table public.work_days
  drop constraint if exists work_days_absence_type_check;

alter table public.work_days
  add constraint work_days_absence_type_check
  check (
    absence_type is null or absence_type in (
      'vacation',
      'sickness',
      'child_sickness',
      'parental_leave',
      'maternity_leave',
      'paternity_mandatory',
      'paternity_alternative',
      'marriage_leave',
      'mandatory_leave',
      'leave',
      'recovery',
      'sunday_holiday_recovery',
      'holiday'
    )
  );

commit;
