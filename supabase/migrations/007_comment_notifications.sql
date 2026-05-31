-- 007_comment_notifications.sql
--
-- SCAFFOLD for the comment-notification escalation loop (follow-up, bot-side).
--
-- The web app posts a "new comment" ping to the ZAO DEVZ Telegram group and
-- tags the relevant people (handled in src/lib/notify.ts). The 1-hour
-- "no reaction -> DM the person" escalation can't run in the serverless web
-- app, so it belongs to the VPS bot (agent/). This table is where the web app
-- records each sent group ping + its intended recipients so the bot can:
--   1. watch the group message for reactions/replies (marks recipients seen)
--   2. sweep rows older than 1h with unseen recipients and DM them
--
-- Not yet written to by the app — applying this migration is safe and inert
-- until the escalation pass lands. Run via the Supabase SQL editor / CLI.

create table if not exists public.comment_notifications (
  id              uuid primary key default gen_random_uuid(),
  task_id         text not null,                 -- ActionItem.id (legacy_id space)
  comment_id      text not null,                 -- Comment.id
  chat_id         text not null,                 -- Telegram group chat id
  message_id      bigint,                        -- Telegram message_id of the ping
  actor           text not null,                 -- login id of the commenter
  recipients      jsonb not null default '[]',   -- [{ telegram_id, name, seen:false }]
  silent          boolean not null default false,
  escalated_at    timestamptz,                   -- when the DM sweep fired
  created_at      timestamptz not null default now()
);

-- Sweep query support: find un-escalated rows past the 1h window.
create index if not exists comment_notifications_pending_idx
  on public.comment_notifications (created_at)
  where escalated_at is null;
