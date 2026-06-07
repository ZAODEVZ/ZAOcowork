-- Bot fleet heartbeats — backs GET /api/v1/bots + POST /api/v1/bots/heartbeat.
-- One row per bot; the bot reports its own status on a timer. Apply in the
-- Supabase SQL editor (the read-only MCP can't run DDL).

CREATE TABLE IF NOT EXISTS bot_heartbeats (
  bot        TEXT PRIMARY KEY,
  status     TEXT NOT NULL DEFAULT 'up' CHECK (status IN ('up', 'degraded', 'down')),
  ts         TIMESTAMPTZ NOT NULL DEFAULT now(),
  meta       JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bot_heartbeats_ts_idx ON bot_heartbeats(ts);
