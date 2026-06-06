-- 008_task_dependencies.sql - task->task blocks/blocked-by. Idempotent.
CREATE TABLE IF NOT EXISTS task_dependencies (
  blocker_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX IF NOT EXISTS task_deps_blocked_idx ON task_dependencies(blocked_id);
CREATE INDEX IF NOT EXISTS task_deps_blocker_idx ON task_dependencies(blocker_id);
