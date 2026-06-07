-- Bot command queue — backs the control plane (Phase 2-4 of doc 800).
-- The board enqueues (session + isAdmin); bots / the fleet-agent pull, execute,
-- and post results. Pull-based: the board never connects to the VPS.
--
-- command vocabulary:
--   bot-self (claimed via GET ?bot=<self>):  restart | pause | resume | run_task | ask
--   host/fleet (claimed via GET ?scope=host): start | stop
-- status: pending -> claimed (on pull) -> done | error (on result).

CREATE TABLE IF NOT EXISTS bot_commands (
  id           BIGSERIAL PRIMARY KEY,
  bot          TEXT NOT NULL,
  command      TEXT NOT NULL,
  args         JSONB NOT NULL DEFAULT '{}',
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'claimed', 'done', 'error')),
  result       JSONB,
  created_by   TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Bots poll their own pending queue ordered oldest-first.
CREATE INDEX IF NOT EXISTS bot_commands_bot_status_idx
  ON bot_commands(bot, status, created_at);
-- The fleet-agent polls pending host commands (start|stop) across all bots.
CREATE INDEX IF NOT EXISTS bot_commands_status_command_idx
  ON bot_commands(status, command, created_at);
