-- 006_projects_and_source.sql
-- Doc 765 Phase I: add Project layer + source taxonomy + audit origin field.
--
-- All idempotent.

-- ============== Projects table ==============
-- Sits between Brand (cross-cutting tag) and Task (atomic unit).
-- Projects are time-bounded, have a status, and group 5-50 tasks toward
-- a specific outcome. Brands stay on tasks too; a project may inherit a
-- default brand but tasks within a project can carry additional brands.
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  brand_default TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  target_date DATE,
  closed_at TIMESTAMPTZ,
  closed_by TEXT,
  color TEXT NOT NULL DEFAULT 'bg-white/10 text-white/70 border-white/20',
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS projects_status_idx
  ON projects(status, sort_order);

-- ============== tasks.project_id (nullable FK) ==============
-- Nullable so existing 281 tasks stay unparented (project=NULL means
-- "general" - shows on board without a project tag). Admins assign
-- gradually via /admin/projects bulk-assign or per-task picker.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS tasks_project_id_idx ON tasks(project_id) WHERE project_id IS NOT NULL;

-- ============== tasks.source enum ==============
-- Provenance taxonomy. Doc 765 decision #2: every task carries who/what
-- wrote it so the activity feed + audit log can filter cleanly.
-- Existing rows backfilled to 'human-web' (the most-common pre-this-PR
-- writer). Bot/meeting/research/ai-proposal will tag themselves going
-- forward as the writers get updated.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'human-web'
  CHECK (source IN (
    'human-web',
    'human-bot',
    'meeting-capture',
    'research-dispatch',
    'pr-test-task',
    'ai-proposal',
    'system-cleanup',
    'external-api'
  ));

-- Backfill: tasks created by github webhook or bot get their source
-- tagged from the legacy_source pattern so the column reflects history.
UPDATE tasks SET source = 'human-bot'
  WHERE legacy_source = 'cowork-actions.json'
    AND (created_by IS NULL OR (created_by IS NOT NULL))
    AND source = 'human-web'
    AND title ILIKE 'bot:%'; -- bot-prefixed commits got "bot: " in metadata.commitMessage but title varies; safe fallback

UPDATE tasks SET source = 'meeting-capture'
  WHERE legacy_source LIKE 'meeting:%'
    AND source = 'human-web';

UPDATE tasks SET source = 'research-dispatch'
  WHERE legacy_source LIKE 'research-doc:%'
    AND source = 'human-web';

UPDATE tasks SET source = 'pr-test-task'
  WHERE legacy_source LIKE 'pr-%'
    AND source = 'human-web';

CREATE INDEX IF NOT EXISTS tasks_source_idx ON tasks(source);

-- ============== Verify ==============
SELECT 'projects' AS table_name, count(*) AS row_count FROM projects
UNION ALL
SELECT 'tasks by source', NULL FROM tasks LIMIT 0;
-- Show source distribution:
SELECT source, count(*) FROM tasks GROUP BY source ORDER BY count(*) DESC;
