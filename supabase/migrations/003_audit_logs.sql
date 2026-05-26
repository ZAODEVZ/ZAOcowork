-- 003_audit_logs.sql
-- Cross-cutting audit log for /admin Phase E.
--
-- The original supabase/schema.sql defined an `activity_logs` table scoped to
-- tasks only (task_id NOT NULL). Phase E needs to log non-task events too:
-- admin adding/removing users, changing roles, adding/retiring brands, etc.
-- This migration creates a separate `audit_logs` table with a polymorphic
-- entity reference (entity_type + entity_id) so a single feed covers tasks,
-- users, brands, and system events.
--
-- Granularity: one row per logical action. Bulk operations write ONE row
-- (action='bulk_set_owner', metadata.ids=[...]) instead of N rows. Keeps
-- the audit feed scannable + the table size manageable.
--
-- Read path: /admin AuditPanel orders by created_at DESC, paginates 50 at
-- a time. Filter sidebar on entity_type / actor.

CREATE TABLE IF NOT EXISTS audit_logs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor        TEXT NOT NULL,
  entity_type  TEXT NOT NULL
                 CHECK (entity_type IN ('task','user','brand','system')),
  entity_id    TEXT,
  entity_label TEXT,
  action       TEXT NOT NULL,
  detail       TEXT,
  metadata     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx     ON audit_logs(entity_type, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx      ON audit_logs(actor, created_at DESC);
