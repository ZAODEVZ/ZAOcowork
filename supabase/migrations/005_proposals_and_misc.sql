-- 005_proposals_and_misc.sql
-- Phase G schema (doc 764):
--   - F4: extend tasks.status to allow 'triage' (no DDL needed if
--     status is TEXT; documenting here in case a CHECK constraint exists).
--   - F7: task_proposals table for AI / rule-based suggestion approval queue.
--
-- All operations idempotent.

-- ============== F7: task_proposals ==============
CREATE TABLE IF NOT EXISTS task_proposals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- task short id (legacy_id), not the UUID. Matches what app code uses.
  task_id TEXT NOT NULL,
  action_type TEXT NOT NULL
    CHECK (action_type IN ('set_brands','set_owner','set_service_class','set_priority','flag_duplicate','add_comment','move_status')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL,
  confidence NUMERIC,
  rationale TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  decided_by TEXT
);

CREATE INDEX IF NOT EXISTS task_proposals_status_idx
  ON task_proposals(status, created_at DESC);
CREATE INDEX IF NOT EXISTS task_proposals_task_id_idx
  ON task_proposals(task_id);
