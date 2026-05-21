-- ============================================================
-- ZAO Co-Works — Supabase Schema
-- Phase 2 migration target (currently using JSON/GitHub backend)
-- Run this in the Supabase SQL Editor to set up the database.
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── USERS & ROLES ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username     TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  email        TEXT UNIQUE,
  role         TEXT NOT NULL DEFAULT 'worker'
                 CHECK (role IN ('admin', 'lead', 'worker')),
  department   TEXT,
  avatar_url   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Seed the two current users
INSERT INTO users (username, display_name, role) VALUES
  ('zaal', 'Zaal', 'lead'),
  ('iman', 'Iman', 'worker')
ON CONFLICT (username) DO NOTHING;

-- ─── TEAMS ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS teams (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL,
  department TEXT,
  lead_id    UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── WORKSPACES (Dev / Music / Marketing) ─────────────────────

CREATE TABLE IF NOT EXISTS workspaces (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  description TEXT,
  team_id     UUID REFERENCES teams(id),
  categories  TEXT[] DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO workspaces (name, categories) VALUES
  ('Dev',       ARRAY['ZAO Devz','Site / Tech','Ops','Bounty','Other']),
  ('Music',     ARRAY['WaveWarZ Zambia','Recording','Distribution','Release','Artist Onboarding']),
  ('Marketing', ARRAY['Social','Brand','Content','Campaigns'])
ON CONFLICT DO NOTHING;

-- ─── TASKS ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tasks (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  legacy_id          TEXT,                        -- migration: original numeric ID from JSON
  title              TEXT NOT NULL,
  task_type          TEXT NOT NULL DEFAULT 'task'
                       CHECK (task_type IN ('task','work_order','incident','approval_request','goal','maintenance')),
  status             TEXT NOT NULL DEFAULT 'TODO'
                       CHECK (status IN ('TODO','WIP','BLOCKED','DONE')),
  priority           TEXT NOT NULL DEFAULT 'P2'
                       CHECK (priority IN ('P1','P2','P3')),
  phase              TEXT NOT NULL DEFAULT 'Define'
                       CHECK (phase IN ('Define','Measure','Analyze','Improve','Control')),
  category           TEXT NOT NULL DEFAULT 'Other',
  workspace_id       UUID REFERENCES workspaces(id),
  owner              TEXT NOT NULL DEFAULT 'Both',
  assigned_to        UUID REFERENCES users(id),
  created_by         UUID REFERENCES users(id),
  due_date           DATE,
  important          BOOLEAN NOT NULL DEFAULT FALSE,
  urgent             BOOLEAN NOT NULL DEFAULT FALSE,
  notes              TEXT DEFAULT '',
  requires_approval  BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at       TIMESTAMPTZ,
  completed_by       UUID REFERENCES users(id),
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tasks_status_idx     ON tasks(status);
CREATE INDEX IF NOT EXISTS tasks_workspace_idx  ON tasks(workspace_id);
CREATE INDEX IF NOT EXISTS tasks_created_by_idx ON tasks(created_by);
CREATE INDEX IF NOT EXISTS tasks_assigned_to_idx ON tasks(assigned_to);

-- ─── TASK COMMENTS ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS task_comments (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id),
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS task_comments_task_idx ON task_comments(task_id);

-- ─── TASK PROGRESS UPDATES ────────────────────────────────────

CREATE TABLE IF NOT EXISTS task_updates (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id        UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  submitted_by   UUID NOT NULL REFERENCES users(id),
  content        TEXT NOT NULL,
  from_status    TEXT,
  to_status      TEXT,
  review_status  TEXT NOT NULL DEFAULT 'pending'
                   CHECK (review_status IN ('pending','approved','rejected','changes_requested')),
  reviewed_by    UUID REFERENCES users(id),
  reviewed_at    TIMESTAMPTZ,
  review_notes   TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS task_updates_task_idx    ON task_updates(task_id);
CREATE INDEX IF NOT EXISTS task_updates_review_idx  ON task_updates(review_status);

-- ─── ACTIVITY LOG ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS activity_logs (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id),
  action     TEXT NOT NULL,  -- created, status_changed, commented, update_submitted, review_approved, etc.
  old_value  TEXT,
  new_value  TEXT,
  detail     TEXT,
  metadata   JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS activity_logs_task_idx ON activity_logs(task_id);
CREATE INDEX IF NOT EXISTS activity_logs_user_idx ON activity_logs(user_id);

-- ─── FILES ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS task_files (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id      UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  uploaded_by  UUID NOT NULL REFERENCES users(id),
  file_name    TEXT NOT NULL,
  storage_path TEXT NOT NULL,  -- Supabase Storage path
  file_size    INTEGER,
  mime_type    TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS task_files_task_idx ON task_files(task_id);

-- ─── AUTOMATION RULES ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS automation_rules (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id),
  name         TEXT NOT NULL,
  trigger      TEXT NOT NULL,   -- e.g. 'all_subtasks_done', 'file_uploaded'
  action       TEXT NOT NULL,   -- e.g. 'auto_approve', 'notify_lead', 'change_status'
  config       JSONB DEFAULT '{}',
  enabled      BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── NOTIFICATIONS ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id),
  task_id    UUID REFERENCES tasks(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,  -- 'pending_review', 'update_approved', 'comment_added', etc.
  title      TEXT NOT NULL,
  body       TEXT,
  read       BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_idx  ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS notifications_task_idx  ON notifications(task_id);

-- ─── WORK ORDERS (maintenance extension) ──────────────────────

CREATE TABLE IF NOT EXISTS work_orders (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id        UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  asset_name     TEXT,
  location       TEXT,
  severity       TEXT CHECK (severity IN ('low','medium','high','critical')),
  downtime_start TIMESTAMPTZ,
  downtime_end   TIMESTAMPTZ,
  technician_id  UUID REFERENCES users(id),
  repair_log     TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────

ALTER TABLE tasks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_updates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_files     ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications  ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all tasks in their workspace
CREATE POLICY "tasks_read" ON tasks
  FOR SELECT USING (auth.role() = 'authenticated');

-- Authenticated users can insert tasks
CREATE POLICY "tasks_insert" ON tasks
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Users can update tasks they created or are assigned to
CREATE POLICY "tasks_update" ON tasks
  FOR UPDATE USING (
    auth.role() = 'authenticated'
    AND (
      created_by = auth.uid()
      OR assigned_to = auth.uid()
      -- leads can update any task (extend with role check if needed)
    )
  );

-- Comments: authenticated users read all, insert own
CREATE POLICY "comments_read"   ON task_comments FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "comments_insert" ON task_comments FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Updates: authenticated users read all, insert own
CREATE POLICY "updates_read"   ON task_updates FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "updates_insert" ON task_updates FOR INSERT WITH CHECK (auth.uid() = submitted_by);

-- Activity: read-only for authenticated
CREATE POLICY "activity_read" ON activity_logs FOR SELECT USING (auth.role() = 'authenticated');

-- Files: authenticated read all, insert own
CREATE POLICY "files_read"   ON task_files FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "files_insert" ON task_files FOR INSERT WITH CHECK (auth.uid() = uploaded_by);

-- Notifications: users see only their own
CREATE POLICY "notifications_read"   ON notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "notifications_update" ON notifications FOR UPDATE USING (auth.uid() = user_id);

-- ─── REALTIME ─────────────────────────────────────────────────

-- Enable realtime for collaborative features
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE task_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE task_updates;
ALTER PUBLICATION supabase_realtime ADD TABLE activity_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- ─── UPDATED_AT TRIGGER ───────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER work_orders_updated_at
  BEFORE UPDATE ON work_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
