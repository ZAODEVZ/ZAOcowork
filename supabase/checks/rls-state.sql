-- rls-state.sql - READ-ONLY. What the RLS on this project actually admits, as
-- one result set, so it can be pasted into the Supabase SQL editor (which shows
-- only the LAST statement's rows) and read in full.
--
-- Run it BEFORE and AFTER migrations 028 and 029, and keep both outputs.
-- It changes nothing: every line below is a SELECT over the catalog.
--
-- Why it lists EVERY policy and not only the 13 it is counting: a filtered read
-- that returns zero rows looks identical to a filter that is wrong. The summary
-- rows are the claim; the full list under them is the evidence.
--
-- Rows, in order:
--   summary | policies_in_public          | N   (0 here means the query saw nothing - suspect it)
--   summary | authenticated_all_true      | N   (028 section A: FOR ALL TO authenticated USING true WITH CHECK true)
--   summary | anon_reachable_policies     | N   (TO public or TO anon, any command)
--   summary | app_vote_stats_security_invoker | true/false/absent
--   summary | rls_auto_enable_exec_<role> | true/false/absent, for public, anon, authenticated, service_role
--   summary | rls_auto_enable_returns     | its return type (event_trigger = only ever run by the DDL trigger)
--   summary | rls_auto_enable_acl         | the raw grant list, so a rollback can restore it exactly
--   policy  | <table>.<policy>            | <cmd> to <roles> using(<qual>) check(<with_check>)
-- Doc: ZAOOS research doc 1060; board card 1117.

with fn as (
  select p.oid, p.proacl, format_type(p.prorettype, null) as rettype
  from pg_proc p
  where p.proname = 'rls_auto_enable' and p.pronamespace = 'public'::regnamespace
),
pol as (
  select tablename, policyname, cmd, roles, coalesce(qual, '-') as qual, coalesce(with_check, '-') as with_check
  from pg_policies
  where schemaname = 'public'
),
role_exec as (
  select r.rolname,
         (select case when count(*) = 0 then 'absent'
                      else bool_and(has_function_privilege(r.rolname, fn.oid, 'EXECUTE'))::text end
            from fn) as can
  from (values ('anon'), ('authenticated'), ('service_role')) as r(rolname)
  where exists (select 1 from pg_roles pr where pr.rolname = r.rolname)
)
select kind, key, value from (
  select 1 as o, 'summary' as kind, 'policies_in_public' as key, count(*)::text as value from pol
  union all
  select 2, 'summary', 'authenticated_all_true', count(*)::text from pol
   where cmd = 'ALL' and roles = '{authenticated}' and qual = 'true' and with_check = 'true'
  union all
  select 3, 'summary', 'anon_reachable_policies', count(*)::text from pol
   where roles && array['public', 'anon']::name[]
  union all
  select 4, 'summary', 'app_vote_stats_security_invoker',
         coalesce((select coalesce(
                     (select split_part(o, '=', 2) from unnest(c.reloptions) o where o like 'security_invoker=%'),
                     'false')
                   from pg_class c
                   where c.relname = 'app_vote_stats' and c.relnamespace = 'public'::regnamespace), 'absent')
  union all
  -- PUBLIC is checked from the ACL: has_function_privilege() has no PUBLIC form.
  -- A null proacl means the default, which grants EXECUTE to PUBLIC.
  select 5, 'summary', 'rls_auto_enable_exec_public',
         coalesce((select (fn.proacl is null or exists (
                     select 1 from aclexplode(fn.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'))::text
                   from fn limit 1), 'absent')
  union all
  select 6, 'summary', 'rls_auto_enable_exec_' || rolname, can from role_exec
  union all
  select 7, 'summary', 'rls_auto_enable_returns', coalesce((select rettype from fn limit 1), 'absent')
  union all
  select 8, 'summary', 'rls_auto_enable_acl', coalesce((select coalesce(proacl::text, '(default: PUBLIC)') from fn limit 1), 'absent')
  union all
  select 9, 'policy', tablename || '.' || policyname,
         cmd || ' to ' || array_to_string(roles, ',') || ' using(' || qual || ') check(' || with_check || ')'
  from pol
) s
order by o, key;
