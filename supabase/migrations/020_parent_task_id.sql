-- Add parent_task_id column to support subtasks
-- This is an additive, non-breaking migration
-- Nullable column allows existing tasks to continue working
-- Foreign key references the same table (self-referential)

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE;

-- Index for efficient subtask queries
CREATE INDEX IF NOT EXISTS tasks_parent_task_id_idx ON tasks(parent_task_id);
