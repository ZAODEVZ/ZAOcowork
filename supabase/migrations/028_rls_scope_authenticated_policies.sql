-- 028_rls_scope_authenticated_policies.sql
-- Closes the RLS finding first reported in ZAOOS doc 1060 (2026-07-13) and
-- re-verified live on 2026-08-13. Follows the pattern already established by
-- 024_security_hardening.sql: drop the over-broad policy, create no
-- replacement, because every server path uses the service role and the service
-- role bypasses RLS entirely.
--
-- WHAT IS AND IS NOT EXPOSED TODAY (verified against the live DB, not inferred)
--
--   Nothing in section A is reachable by an anonymous caller. Each of the 13
--   tables has RLS enabled with exactly ONE policy, scoped `TO authenticated`.
--   No policy admits `anon`, and RLS denies any role no policy matches - so the
--   anon key cannot read or write them, even though `anon` holds table-level
--   GRANTs (arwdDxtm). The GRANT is not the gate here; RLS is.
--
--   `auth.users` currently contains 0 rows and `auth.identities` 0 rows, so no
--   Supabase Auth principal exists that could assume the `authenticated` role
--   today. The exposure is therefore LATENT, not active.
--
--   It stops being latent the moment one account exists. Every policy below is
--   `FOR ALL USING (true) WITH CHECK (true)`, so ANY authenticated principal -
--   not an admin, not the bot, any of them - gets full read AND write on all 13
--   tables, including `team_members.password_hash`, member emails, telegram ids
--   and wallets, and every budget line. If Supabase Auth signup is enabled on
--   this project (that is GoTrue config, not visible from SQL - PLEASE CHECK),
--   then "any authenticated user" means "anyone who can sign up".
--
--   Sections B-D cover three policies that DO admit anon. Those are separate
--   from doc 1060's 13 and were found while verifying it.
--
-- BLAST RADIUS OF THIS MIGRATION: expected to be zero.
--   - agent/src/actions-store.ts and agent/src/supabase-roster.ts use
--     SUPABASE_SERVICE_KEY. Service role bypasses RLS, so server reads/writes
--     are unaffected by dropping any policy here.
--   - This repo's CLAUDE.md states NEXT_PUBLIC_SUPABASE_ANON_KEY is "reserved
--     for any future client-side Supabase use; the server path uses the service
--     key". Repo-wide grep finds no client-side Supabase client.
--   - Dropping an `authenticated`-scoped policy cannot break an anon caller,
--     and there are no authenticated principals to break.
--
-- REVERSIBILITY: every statement is a DROP POLICY. The exact CREATE POLICY
-- statements needed to restore the prior state are in the rollback block at the
-- bottom of this file, commented out.

begin;

-- ============================================================
-- A. The 13 tables from doc 1060
--    Each carries one policy `<table>_authenticated_all`:
--      FOR ALL TO authenticated USING (true) WITH CHECK (true)
--    Dropping it leaves RLS enabled with zero policies = deny-all for
--    anon + authenticated, service role unaffected. Same shape as 024's
--    treatment of brand_drops.
-- ============================================================

-- activity_log     (~50 rows)   project, task_id, actor_id, action, detail
drop policy if exists activity_log_authenticated_all   on public.activity_log;

-- artists          (0 rows)     name, status, set_length, contact, notes
drop policy if exists artists_authenticated_all        on public.artists;

-- budget_entries   (0 rows)     category, label, amount, kind, notes
drop policy if exists budget_entries_authenticated_all on public.budget_entries;

-- circle_members   (0 rows)     circle_id, member_id, joined_at
drop policy if exists circle_members_authenticated_all on public.circle_members;

-- circles          (6 rows)     slug, name, coordinator_member_id, description
drop policy if exists circles_authenticated_all        on public.circles;

-- contact_log      (0 rows)     contact, channel, summary, logged_by
drop policy if exists contact_log_authenticated_all    on public.contact_log;

-- goals            (0 rows)     title, target, status
drop policy if exists goals_authenticated_all          on public.goals;

-- meeting_notes    (~102 rows)  title, body, meeting_date, created_by
--                               body is free text and the likeliest place for
--                               names, figures and internal discussion to sit.
drop policy if exists meeting_notes_authenticated_all  on public.meeting_notes;

-- sponsors         (0 rows)     name, tier, amount, status, contact, notes
drop policy if exists sponsors_authenticated_all       on public.sponsors;

-- suggestions      (0 rows)     body, submitted_by, status
drop policy if exists suggestions_authenticated_all    on public.suggestions;

-- tasks            (~1560 rows) title, notes, owner_id, metadata, brands, ...
--                               the single largest body of operational data here
drop policy if exists tasks_authenticated_all          on public.tasks;

-- team_members     (14 rows)    THE SENSITIVE ONE: password_hash, email,
--                               telegram_id, telegram_username, wallet, fid,
--                               approval_status
drop policy if exists team_members_authenticated_all   on public.team_members;

-- volunteers       (0 rows)     name, role, status, contact, notes
drop policy if exists volunteers_authenticated_all     on public.volunteers;

-- ============================================================
-- B. fleet_status - GENUINELY ANON-READABLE TODAY
--    Policy `fleet read` is FOR SELECT TO public USING (true). `public`
--    includes anon, so anyone holding the anon key can read all 11 rows.
--    Columns: session, state, last_line, updated_at - live terminal telemetry.
--    `last_line` is a raw tail of a terminal and can contain anything that
--    scrolled past; `session` leaks branch names such as
--    "ZAO OS V1 (ws/research-oss-monetization-sparkz-1766)".
--
--    Writes are unaffected: `fleet write service` already requires
--    auth.role() = 'service_role', and a service-key writer bypasses RLS.
--
--    RESIDUAL RISK, STATED PLAINLY: something outside this repo writes these
--    rows (they updated 2026-08-13 13:42 UTC) and I could not identify it.
--    Writers are safe either way. The only thing this could break is an
--    anon-key READER of fleet_status - a status dashboard or cockpit view.
--    I found none in ZAOcowork or ZAODEVZ/zaostock, but I did not audit every
--    surface. If such a reader exists, it should move to a server route.
-- ============================================================
drop policy if exists "fleet read" on public.fleet_status;

-- ============================================================
-- C. photos - policy name lies about its scope
--    `photos_select_authenticated` is FOR SELECT TO public USING (true).
--    Despite the name it grants anon, not just authenticated. 0 rows today, so
--    nothing has leaked, but the name would hide this from the next reader.
--    0 call sites repo-wide.
-- ============================================================
drop policy if exists photos_select_authenticated on public.photos;

-- ============================================================
-- D. app_votes - anon can rewrite anyone's vote
--    `anon can update own vote` is FOR UPDATE TO anon USING (true). USING(true)
--    is every row, not the caller's own - the name claims a scoping the policy
--    does not implement. Any anon caller can edit any vote.
--
--    DELIBERATELY LEFT ALONE: `anon can read votes` (SELECT) and
--    `anon can insert votes` (INSERT). A public voting widget plausibly needs
--    both, the table has 0 rows, and silently removing a feature is worse than
--    leaving a reviewed decision to Zaal. If no such widget exists, drop them
--    too - the statements are in the rollback block.
-- ============================================================
drop policy if exists "anon can update own vote" on public.app_votes;

-- ============================================================
-- E. app_vote_stats - SECURITY DEFINER view (advisor level: ERROR)
--    Aggregates app_votes. As SECURITY DEFINER it runs with the creator's
--    rights and ignores the caller's RLS. It leaks nothing extra today because
--    app_votes is anon-readable anyway, but that stops being true the moment
--    app_votes is locked down - the view would keep serving the data.
--    security_invoker makes it respect the caller instead.
-- ============================================================
alter view public.app_vote_stats set (security_invoker = true);

commit;

-- ============================================================
-- NOT CHANGED ON PURPOSE
--
-- The advisor reports `rls_enabled_no_policy` (INFO) on 16 tables: audit_logs,
-- bot_commands, bot_events, bot_heartbeats, bot_tokens, brand_drops,
-- brands, comment_notifications, contacts, meetings, projects, repo_decisions,
-- task_dependencies, task_proposals, task_source_cache, token_claims.
--
-- That state is CORRECT and needs no fix. RLS enabled with zero policies is
-- deny-all for anon and authenticated while the service role still works. It is
-- the end state this migration moves the section A tables toward, and it is
-- what 024 deliberately left behind on brand_drops.
--
-- Do not "resolve" those INFO lints by adding permissive policies. That would
-- reintroduce exactly the finding this migration closes. `contacts` (1082 rows)
-- is the one to be most careful with.
-- ============================================================

-- ============================================================
-- ROLLBACK (commented - restores the exact prior state)
--
-- create policy activity_log_authenticated_all   on public.activity_log   for all to authenticated using (true) with check (true);
-- create policy artists_authenticated_all        on public.artists        for all to authenticated using (true) with check (true);
-- create policy budget_entries_authenticated_all on public.budget_entries for all to authenticated using (true) with check (true);
-- create policy circle_members_authenticated_all on public.circle_members for all to authenticated using (true) with check (true);
-- create policy circles_authenticated_all        on public.circles        for all to authenticated using (true) with check (true);
-- create policy contact_log_authenticated_all    on public.contact_log    for all to authenticated using (true) with check (true);
-- create policy goals_authenticated_all          on public.goals          for all to authenticated using (true) with check (true);
-- create policy meeting_notes_authenticated_all  on public.meeting_notes  for all to authenticated using (true) with check (true);
-- create policy sponsors_authenticated_all       on public.sponsors       for all to authenticated using (true) with check (true);
-- create policy suggestions_authenticated_all    on public.suggestions    for all to authenticated using (true) with check (true);
-- create policy tasks_authenticated_all          on public.tasks          for all to authenticated using (true) with check (true);
-- create policy team_members_authenticated_all   on public.team_members   for all to authenticated using (true) with check (true);
-- create policy volunteers_authenticated_all     on public.volunteers     for all to authenticated using (true) with check (true);
-- create policy "fleet read"                     on public.fleet_status   for select to public using (true);
-- create policy photos_select_authenticated      on public.photos         for select to public using (true);
-- create policy "anon can update own vote"       on public.app_votes      for update to anon using (true);
-- alter view public.app_vote_stats set (security_invoker = false);
--
-- OPTIONAL follow-ups referenced in section D, if no public voting widget exists:
-- drop policy if exists "anon can read votes"   on public.app_votes;
-- drop policy if exists "anon can insert votes" on public.app_votes;
-- ============================================================
