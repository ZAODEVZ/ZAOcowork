-- 007_metadata_and_missing_columns.sql
-- Idempotent safety net: adds every column the app code references that was
-- never formally added by a numbered migration.
--
-- The critical one is `metadata` (JSONB): the app writes it on every
-- INSERT/UPDATE via itemToRow(). If it's absent, every save — including
-- changing task owner — throws "column metadata does not exist" → 500.
--
-- All other ADD COLUMN IF NOT EXISTS are harmless no-ops if the column is
-- already present (e.g. from migration 004 or a dashboard edit).

-- ============== Core: metadata JSONB ==============
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';

-- ============== From migration 004 (service_class, archived_at) ==============
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS service_class TEXT NOT NULL DEFAULT 'Standard'
  CHECK (service_class IN ('Standard', 'FixedDate', 'Expedite', 'Intangible'));
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS tasks_archived_at_idx ON tasks(archived_at) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS tasks_service_class_idx ON tasks(service_class);

-- ============== From migration 006 (project_id, source) ==============
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS tasks_project_id_idx ON tasks(project_id) WHERE project_id IS NOT NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'human-web'
  CHECK (source IN (
    'human-web', 'human-bot', 'meeting-capture', 'research-dispatch',
    'pr-test-task', 'ai-proposal', 'system-cleanup', 'external-api'
  ));
CREATE INDEX IF NOT EXISTS tasks_source_idx ON tasks(source);

-- ============== team_members extras ==============
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS telegram_id BIGINT;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS email TEXT;

-- ============== Verify ==============
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'tasks' AND table_schema = 'public'
ORDER BY ordinal_position;
