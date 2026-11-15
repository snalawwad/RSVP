-- READ-ONLY. Copies the live database's structure (no guest data) so we can keep it
-- as a file in the repo. Paste into Supabase > SQL Editor > New query > Run, then
-- download the result as CSV (or copy the "ddl" column) and send it back.
-- It changes nothing: it only reads Postgres' own catalog.

with
tbls as (
  select c.oid, n.nspname, c.relname, c.relrowsecurity
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
),
cols as (
  select 1 as ord, t.relname as obj,
    format(E'create table if not exists public.%I (\n%s\n);', t.relname,
      string_agg(format('  %I %s%s%s', a.attname, format_type(a.atttypid, a.atttypmod),
        case when a.attnotnull then ' not null' else '' end,
        coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), '')), E',\n' order by a.attnum)) as ddl
  from tbls t
  join pg_attribute a on a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
  left join pg_attrdef d on d.adrelid = t.oid and d.adnum = a.attnum
  group by t.relname
),
cons as (
  select 2, t.relname, format('alter table public.%I add constraint %I %s;', t.relname, co.conname, pg_get_constraintdef(co.oid))
  from tbls t join pg_constraint co on co.conrelid = t.oid
),
idx as (
  select 3, tablename, indexdef || ';' from pg_indexes
  where schemaname = 'public' and indexname not in (select conname from pg_constraint)
),
rls as (
  select 4, relname, format('alter table public.%I enable row level security;', relname) from tbls where relrowsecurity
),
pol as (
  select 5, schemaname || '.' || tablename,
    format('create policy %I on %I.%I as %s for %s to %s%s%s;', policyname, schemaname, tablename, permissive, cmd,
      array_to_string(roles, ', '),
      coalesce(' using (' || qual || ')', ''), coalesce(' with check (' || with_check || ')', ''))
  from pg_policies where schemaname in ('public', 'storage')
),
fn as (
  select 6, p.proname, pg_get_functiondef(p.oid) || ';'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
),
trg as (
  select 7, c.relname, pg_get_triggerdef(tg.oid) || ';'
  from pg_trigger tg join pg_class c on c.oid = tg.tgrelid join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not tg.tgisinternal
),
grants as (
  select 8, routine_name, format('grant execute on function public.%I to %s;', routine_name, string_agg(distinct grantee, ', '))
  from information_schema.routine_privileges
  where routine_schema = 'public' and grantee in ('anon', 'authenticated')
  group by routine_name
),
buckets as (
  select 9, id, format('insert into storage.buckets (id, name, public) values (%L, %L, %s) on conflict do nothing;', id, name, public)
  from storage.buckets
)
select * from (
  select * from cols union all select * from cons union all select * from idx union all
  select * from rls union all select * from pol union all select * from fn union all
  select * from trg union all select * from grants union all select * from buckets
) x(ord, obj, ddl)
order by ord, obj;
