-- 001_team_member_roles_and_passwords.sql
-- Adds role + password storage to team_members so admins can add new users
-- and grant admin from the /admin UI without a code deploy.
--
-- Role values: 'admin' | 'lead' | 'worker'.
--   admin  = can add/remove users, reset passwords, promote others
--   lead   = can mark DONE without review (Zaal + Iman defaults)
--   worker = read/edit-board only
--
-- Phase A relied on a hardcoded `isAdmin = zaal | iman` check in auth.ts.
-- Phase B reads this column with a hardcoded-leads fallback so the admin gate
-- never locks out the two founders even if the column is unpopulated.
--
-- Passwords: existing 5 users (Zaal, Iman, ThyRev, Samantha, Tyler) keep
-- their env-var passwords (ZAAL_PASSWORD etc) for backward compat. New users
-- created via /admin write `password_hash` here (scrypt). On login,
-- verifyPassword checks env first, then DB. Resetting a user's password
-- writes here; future migration moves all 5 off env vars cleanly.
--
-- `active=false` users cannot log in. Used by /admin deactivate.

ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'worker'
    CHECK (role IN ('admin', 'lead', 'worker'));

ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS password_set_at TIMESTAMPTZ;

ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS password_set_by TEXT;

CREATE INDEX IF NOT EXISTS team_members_role_idx ON team_members(role);
CREATE INDEX IF NOT EXISTS team_members_active_idx ON team_members(active);

-- Seed: Zaal + Iman are admins, ThyRev + Samantha + Tyler are workers.
-- Leadership in code (isLead) still calls Zaal + Iman leads; that's a
-- separate concept (mark-DONE-without-review).
UPDATE team_members
   SET role = 'admin'
 WHERE legacy_owner IN ('Zaal', 'Iman') AND role <> 'admin';
