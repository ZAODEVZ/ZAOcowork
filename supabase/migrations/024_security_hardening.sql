-- 024_security_hardening.sql
-- Closes the findings from the 2026-07-26 audit.
--
-- F1 (the live one): `brand_drops` carried policy `brand_drops_open` granting
--     ALL (USING true / WITH CHECK true) to the `anon` role. The anon key ships
--     in browser JS, so anyone could read, insert and delete brand_drops rows.
--     The table and the `brand-drop` bucket are referenced by ZERO lines of
--     application code (verified repo-wide), so there is no client to break:
--     lock both down to service-role only. Server code uses SUPABASE_SERVICE_KEY,
--     which bypasses RLS, so the app is unaffected.
--
-- F2  `public.rls_auto_enable()` is SECURITY DEFINER and was executable by both
--     `anon` and `authenticated` via /rest/v1/rpc/. It is a maintenance helper;
--     nothing outside the DB should be able to invoke it.
--
-- F3  `set_updated_at()` and `tasks_slug_guard()` had a role-mutable search_path.

-- ============================================================
-- F1a: brand_drops - drop the wide-open policy
-- ============================================================
drop policy if exists brand_drops_open on public.brand_drops;

-- No replacement policy is created on purpose. RLS stays enabled with zero
-- policies, which denies anon + authenticated entirely. The service role
-- bypasses RLS, so server-side access still works. If a browser-side client for
-- brand drops is ever built, add a scoped policy here at that time.

-- ============================================================
-- F1b: brand-drop storage bucket - stop anonymous listing
-- ============================================================
-- The bucket stays public so existing object URLs keep resolving in <img> tags
-- (public buckets serve objects without a policy). Dropping the broad SELECT
-- policy only removes the ability to *enumerate* the bucket's contents.
drop policy if exists brand_drop_read on storage.objects;

-- ============================================================
-- F2: revoke public execute on the SECURITY DEFINER maintenance function
-- ============================================================
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    revoke all on function public.rls_auto_enable() from public;
    revoke all on function public.rls_auto_enable() from anon;
    revoke all on function public.rls_auto_enable() from authenticated;
  end if;
end $$;

-- ============================================================
-- F3: pin search_path on the two flagged functions
-- ============================================================
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'set_updated_at'
  ) then
    alter function public.set_updated_at() set search_path = public, pg_temp;
  end if;

  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'tasks_slug_guard'
  ) then
    alter function public.tasks_slug_guard() set search_path = public, pg_temp;
  end if;
end $$;
