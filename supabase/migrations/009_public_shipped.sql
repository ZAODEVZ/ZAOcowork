-- 009_public_shipped.sql - Module 6 public shipped layer. Idempotent. Default-deny.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS public_override BOOLEAN; -- null=inherit, true=show, false=hide
CREATE INDEX IF NOT EXISTS tasks_public_done_idx ON tasks(status, completed_at) WHERE status = 'done';
