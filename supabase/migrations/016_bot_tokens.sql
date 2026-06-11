-- 016_bot_tokens.sql — DB-backed bot fleet tokens (doc 800 coordination).
--
-- WHY: bot auth lived entirely in the COWORK_BOT_TOKENS env string, so adding or
-- rotating an agent meant editing Vercel env + a redeploy. As the fleet grows
-- (and more agents write to the board), tokens need to be issued/revoked at
-- runtime. authBot() now reads this table (cached ~60s) AND still falls back to
-- COWORK_BOT_TOKENS, so the env tokens keep working as a bootstrap until rows
-- are seeded here — zero-downtime transition.
--
-- Add an agent:   INSERT a row.   Revoke:  SET revoked_at = now().
-- Tokens are bearer secrets; treat this table as sensitive (service-role only).

CREATE TABLE IF NOT EXISTS bot_tokens (
  id          BIGSERIAL PRIMARY KEY,
  bot         TEXT NOT NULL,                 -- lowercased fleet name (zoe, zaodevz, fleet, …)
  token       TEXT NOT NULL UNIQUE,          -- the bearer secret
  note        TEXT,                          -- optional: who/why issued
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  TEXT,
  revoked_at  TIMESTAMPTZ                    -- NULL = active
);

-- Fast active-token lookup (authBot filters revoked_at IS NULL).
CREATE INDEX IF NOT EXISTS bot_tokens_active_idx ON bot_tokens(bot) WHERE revoked_at IS NULL;

-- SEEDING (do this once, by hand, with the real tokens — never commit them):
--   insert into bot_tokens (bot, token, note) values
--     ('zoe',      'tok_…', 'migrated from COWORK_BOT_TOKENS'),
--     ('zaodevz',  'tok_…', 'migrated'),
--     ('zaostock', 'tok_…', 'migrated'),
--     ('fleet',    'tok_…', 'migrated'),
--     ('hermes',   'tok_…', 'migrated');
-- After seeding + verifying, the COWORK_BOT_TOKENS env entries can be removed
-- (the table becomes the source of truth; env stays only as an emergency fallback).
