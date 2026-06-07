-- 011_enable_rls.sql — lock the public anon key out of every table.
--
-- WHY: Supabase grants `anon`/`authenticated` full DML on public tables by
-- default and relies on RLS to actually gate access. RLS was never enabled on
-- this project's tables, so the public anon key (NEXT_PUBLIC_SUPABASE_ANON_KEY)
-- could read/write everything — including team_members.password_hash. (Audit
-- doc-766 / the role_table_grants check.)
--
-- SAFE FOR THE APP: every server module connects with SUPABASE_SERVICE_KEY,
-- whose `service_role` BYPASSES RLS. The app uses its own HMAC-cookie auth, not
-- Supabase Auth, so there are no `authenticated` users to lock out and nothing
-- uses the anon client. Enabling RLS with NO policies = deny-by-default for
-- anon/authenticated, full access for the service role. Idempotent.
--
-- Apply in the Supabase SQL editor (the read-only MCP can't run DDL).

ALTER TABLE IF EXISTS activity_log          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS artists               ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS audit_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS bot_events            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS bot_heartbeats        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS brands                ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS budget_entries        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS circle_members        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS circles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS comment_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS contact_log           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS goals                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS meeting_notes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS projects              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS sponsors              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS suggestions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS task_dependencies     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS task_proposals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS task_source_cache     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS tasks                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS team_members          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS volunteers            ENABLE ROW LEVEL SECURITY;

-- Optional hardening (defense-in-depth): also revoke the default anon grants so
-- the table is doubly protected. Uncomment if you want belt-and-suspenders —
-- RLS alone already denies anon since there are no policies.
-- REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
-- REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
