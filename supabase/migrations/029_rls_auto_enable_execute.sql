-- 029_rls_auto_enable_execute.sql
-- Closes the SECOND finding of ZAOOS doc 1060 (2026-07-13), which 028 does not
-- touch: public.rls_auto_enable() is SECURITY DEFINER and executable by anon
-- and authenticated, so it is reachable at /rest/v1/rpc/rls_auto_enable by
-- anyone holding the anon key. It was still listed there on 2026-09-23 (the
-- PostgREST OpenAPI root, read with the service key).
--
-- WHAT THIS DOES: revokes EXECUTE from PUBLIC, anon and authenticated, and
-- makes sure service_role keeps it. It does not change the function's body.
--
-- WHAT IT DOES NOT KNOW: the live function's body. Its name matches the helper
-- Supabase installs to switch RLS on for new tables, which runs from an event
-- trigger - but that is inferred from the name, not read. Run
-- supabase/checks/rls-state.sql first: its `rls_auto_enable_returns` row says
-- whether it is an event_trigger function, and `rls_auto_enable_acl` is the
-- exact grant list the rollback below should restore.
--
-- WHY IT IS SAFE EITHER WAY (tested, supabase/checks/rls-test.sh):
--   - Every ZAOcowork server path uses the service key (see 028's header), and
--     service_role keeps EXECUTE.
--   - If it is an event-trigger function, the trigger keeps firing after this
--     revoke: the test runs CREATE TABLE as a plain non-owner role afterwards
--     and checks the new table came out with RLS on.
--
-- Each overload of the name is handled, so the statement cannot miss one.

begin;

do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p
    where p.proname = 'rls_auto_enable' and p.pronamespace = 'public'::regnamespace
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

commit;

-- ============================================================
-- ROLLBACK (commented). Restores EXECUTE for the roles that had it on
-- 2026-07-13 per doc 1060. If rls-state.sql's `rls_auto_enable_acl` showed
-- anything different before you ran this, restore THAT instead.
--
-- do $$
-- declare f regprocedure;
-- begin
--   for f in
--     select p.oid::regprocedure from pg_proc p
--     where p.proname = 'rls_auto_enable' and p.pronamespace = 'public'::regnamespace
--   loop
--     execute format('grant execute on function %s to public, anon, authenticated', f);
--   end loop;
-- end $$;
-- ============================================================
