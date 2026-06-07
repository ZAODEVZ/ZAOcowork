-- Bot activity events — backs POST /api/v1/bots/events + GET /api/v1/bots/:bot/events.
-- Append-only feed of what each bot is doing (startup, caught errors, key actions).
-- Phase 1 (Observe) of the bot control plane (research/agents/800-cowork-bot-control-plane).

CREATE TABLE IF NOT EXISTS bot_events (
  id      BIGSERIAL PRIMARY KEY,
  bot     TEXT NOT NULL,
  kind    TEXT NOT NULL,
  message TEXT,
  meta    JSONB NOT NULL DEFAULT '{}',
  ts      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bot_events_bot_ts_idx ON bot_events(bot, ts DESC);
