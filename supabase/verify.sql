-- Verifica rapida da eseguire nel SQL Editor dopo schema.sql.
-- Le query devono mostrare RLS = true e le policy elencate.

select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename in ('profiles', 'work_days')
order by tablename;

select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'public' and tablename in ('profiles', 'work_days')
order by tablename, policyname;
