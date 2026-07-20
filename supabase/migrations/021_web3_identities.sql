-- 021_web3_identities.sql
--
-- Adds Farcaster + wallet identity to team_members so people can sign in with
-- "Login with Farcaster" or "Login with Wallet" instead of a shared password,
-- and so ADDING a user is an approval click in /admin rather than an env-var
-- edit (the TG_MINI_USERS pattern in /api/tg/auth does not scale).
--
-- Sign-in flow this enables:
--   1. Stranger signs in with Farcaster -> row auto-created with
--      approval_status='pending' (name + pfp already populated from their FC
--      profile, so there is nothing to type).
--   2. Admin approves in /admin -> approval_status='active'.
--   3. They can now log in. Until approved they get a "pending" screen.
--
-- Safe to re-run.

ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS fid BIGINT,
  ADD COLUMN IF NOT EXISTS wallet TEXT,
  ADD COLUMN IF NOT EXISTS pfp_url TEXT,
  ADD COLUMN IF NOT EXISTS farcaster_username TEXT,
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS approved_by TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ DEFAULT now();

-- Existing members keep working exactly as before: default 'active' means this
-- migration changes nothing for anyone who already has a password.
COMMENT ON COLUMN team_members.approval_status IS
  'active = can log in; pending = signed in via farcaster/wallet, awaiting admin approval; rejected = denied';

-- One identity maps to at most one member. Partial indexes so the many existing
-- rows with NULL fid/wallet do not collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS team_members_fid_key
  ON team_members (fid) WHERE fid IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS team_members_wallet_key
  ON team_members (lower(wallet)) WHERE wallet IS NOT NULL;

-- Admin "pending approvals" queue reads this.
CREATE INDEX IF NOT EXISTS team_members_approval_status_idx
  ON team_members (approval_status) WHERE approval_status <> 'active';
