-- 022_braindump_surfaces.sql
--
-- Adds support for media and ideas braindump capture surfaces with AI pipelines.
--
-- media_dumps: fast capture of media links with AI-generated summaries and tags.
--   - content: raw text/description from the user
--   - url: the link (if provided)
--   - tags: array of topic tags (Music, Video, Article, Idea, Reference, etc.)
--   - type: inferred type (article, video, podcast, etc.) via AI
--   - ai_summary: short AI-generated summary from the link's content
--   - processed: bool to track if the AI pipeline has run
--
-- task_comments: a minimal comment system for tasks, enabling AI back-and-forth.
--   - task_id: references tasks(id)
--   - author: 'ai' or 'zaal' (string enum)
--   - body: the comment text
--   - created_at: when it was written
--
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS media_dumps (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  url text,
  tags text[] default '{}',
  type text,
  ai_summary text,
  processed boolean default false,
  created_at timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  author text not null check (author in ('ai', 'zaal')),
  body text not null,
  created_at timestamptz not null default now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS media_dumps_created_at_idx ON media_dumps(created_at desc);
CREATE INDEX IF NOT EXISTS media_dumps_tags_gin_idx ON media_dumps using gin (tags);
CREATE INDEX IF NOT EXISTS task_comments_task_id_idx ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS task_comments_created_at_idx ON task_comments(created_at);

-- Enable RLS on new tables
ALTER TABLE media_dumps ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full read/write (same baseline as existing tables)
CREATE POLICY media_dumps_authenticated_all ON media_dumps
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY task_comments_authenticated_all ON task_comments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
