-- 018_token_claims.sql — one-time pairing codes for sharing Claude access.
--
-- Instead of putting a long-lived bot token in a file/message (which then lives
-- forever in chat history), an admin generates a short single-use code. The
-- recipient redeems it once via POST /api/v1/claim to receive the actual token.
-- Codes expire (default 30 min) and can only be claimed once — so a forwarded
-- or screenshotted share leaks nothing reusable.

CREATE TABLE IF NOT EXISTS token_claims (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,           -- the short pairing code (e.g. ZAO-7F3K9Q)
  bot         TEXT NOT NULL,                  -- the slug/bot the token belongs to
  token       TEXT NOT NULL,                  -- the bearer token handed out on claim
  created_by  TEXT,
  expires_at  TIMESTAMPTZ NOT NULL,
  claimed_at  TIMESTAMPTZ,                    -- NULL = not yet redeemed
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS token_claims_code_idx ON token_claims(code) WHERE claimed_at IS NULL;
