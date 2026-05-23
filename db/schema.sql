-- ZAO Unified Operational Database - greenfield schema
-- New Supabase project, owned under the thezao GitHub org.
--
-- Design source: research doc 692 (unification architecture + field mapping)
-- and doc 684 (the circle_id link). Greenfield rebuild per Zaal's 2026-05-20
-- decision (chose full greenfield over doc 692's merge-into-existing recommendation).
--
-- One database for ALL ZAO operational data. Brand rows share tables via the
-- `project` discriminator column (zaostock / zaodevz / wavewarz / ...).
-- RLS is enabled on every table from day one - greenfield is the one chance
-- to design it in, and it cannot be cleanly retrofitted later.
--
-- Run order: this file is idempotent-ish for a FRESH project. Do not run it
-- against a database that already has these tables.

-- ============================================================
-- EXTENSIONS
-- ============================================================
create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- ============================================================
-- VALUE SETS (text + CHECK, not pg enums - easier to evolve)
-- ============================================================
--   project        : lowercase brand slug - zaostock | zaodevz | wavewarz | ...
--   tasks.kind     : task | milestone
--   tasks.status   : todo | in_progress | blocked | done
--   tasks.priority : P1 | P2 | P3
--   tasks.phase    : Define | Measure | Analyze | Improve | Control  (Six Sigma DMAIC)

-- ============================================================
-- team_members - the people. tasks.owner_id / created_by point here.
-- Seeded from ZAOstock team_members (~14) + the 4 ZAOcoworking people.
-- ============================================================
create table team_members (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  telegram_id       bigint unique,
  telegram_username text,
  email             text,
  role              text,
  legacy_owner      text,        -- old ZAOcoworking enum: Zaal | Iman | ThyRev | Samantha
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);

-- ============================================================
-- circles - the 6 fixed cobuild circles (doc 609 / doc 684)
-- ============================================================
create table circles (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique,   -- finance|host|livestream|marketing|music|ops
  name                  text not null,
  coordinator_member_id uuid references team_members(id),
  description           text,
  project               text not null default 'zaostock',
  created_at            timestamptz not null default now()
);

create table circle_members (
  circle_id uuid not null references circles(id) on delete cascade,
  member_id uuid not null references team_members(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (circle_id, member_id)
);

-- ============================================================
-- tasks - THE unified task table.
-- Absorbs ZAOstock `todos` + ZAOstock `timeline` (as kind='milestone')
-- + ZAOcoworking `ActionItem`. Doc 692 Step B; circle_id from doc 684.
-- ============================================================
create table tasks (
  id             uuid primary key default gen_random_uuid(),
  project        text not null,                          -- brand discriminator
  kind           text not null default 'task'
                   check (kind in ('task','milestone')),
  title          text not null,
  status         text not null default 'todo'
                   check (status in ('todo','in_progress','blocked','done')),
  owner_id       uuid references team_members(id),       -- null = Open / Both
  created_by     uuid references team_members(id),
  circle_id      uuid references circles(id),            -- doc 684 link, nullable
  category       text,                                   -- functional tag (Site/Tech, Ops, ...)
  priority       text check (priority in ('P1','P2','P3')),
  phase          text check (phase in ('Define','Measure','Analyze','Improve','Control')),
  important      boolean not null default false,
  urgent         boolean not null default false,
  due            date,
  milestone_date date,                                   -- for kind='milestone'
  notes          text,
  completed_at   timestamptz,
  completed_by   uuid references team_members(id),
  legacy_id      text,                                   -- old actions.json / todos id
  legacy_source  text,                                   -- cowork-actions.json | zaostock-todos | zaostock-timeline
  brands         text[] not null default '{}',           -- ecosystem brand tags (ZAOstock, ZABAL Games, ...)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index tasks_project_idx on tasks(project);
create index tasks_status_idx  on tasks(status);
create index tasks_owner_idx   on tasks(owner_id);
create index tasks_circle_idx  on tasks(circle_id);
create index tasks_brands_gin_idx on tasks using gin (brands);

-- ============================================================
-- activity_log - absorbs ZAOcoworking comments[]/activity[]
-- + ZAOstock activity_log (gemba notes, ideas, status changes).
-- ============================================================
create table activity_log (
  id         uuid primary key default gen_random_uuid(),
  project    text not null,
  task_id    uuid references tasks(id) on delete cascade,
  actor_id   uuid references team_members(id),
  action     text not null,        -- comment | status_change | created | gemba | idea | ...
  detail     text,
  created_at timestamptz not null default now()
);

create index activity_task_idx on activity_log(task_id);

-- ============================================================
-- ZAOstock event tables - sponsors / artists / volunteers.
-- circle_id added per doc 684 so event work rolls up to a circle.
-- ============================================================
create table sponsors (
  id         uuid primary key default gen_random_uuid(),
  project    text not null default 'zaostock',
  name       text not null,
  tier       text,
  amount     numeric,
  status     text,
  contact    text,
  circle_id  uuid references circles(id),
  notes      text,
  created_at timestamptz not null default now()
);

create table artists (
  id         uuid primary key default gen_random_uuid(),
  project    text not null default 'zaostock',
  name       text not null,
  status     text,
  set_length text,
  contact    text,
  circle_id  uuid references circles(id),
  notes      text,
  created_at timestamptz not null default now()
);

create table volunteers (
  id         uuid primary key default gen_random_uuid(),
  project    text not null default 'zaostock',
  name       text not null,
  role       text,
  status     text,
  contact    text,
  notes      text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- meeting_notes / contact_log / suggestions / budget_entries / goals
-- ============================================================
create table meeting_notes (
  id           uuid primary key default gen_random_uuid(),
  project      text not null,
  title        text,
  body         text,
  meeting_date date,
  created_by   uuid references team_members(id),
  created_at   timestamptz not null default now()
);

create table contact_log (
  id        uuid primary key default gen_random_uuid(),
  project   text not null,
  contact   text not null,
  channel   text,
  summary   text,
  logged_by uuid references team_members(id),
  logged_at timestamptz not null default now()
);

create table suggestions (
  id           uuid primary key default gen_random_uuid(),
  project      text not null,
  body         text not null,
  submitted_by uuid references team_members(id),
  status       text not null default 'open',
  created_at   timestamptz not null default now()
);

create table budget_entries (
  id         uuid primary key default gen_random_uuid(),
  project    text not null,
  category   text,
  label      text,
  amount     numeric not null,
  kind       text check (kind in ('income','expense')),
  notes      text,
  created_at timestamptz not null default now()
);

create table goals (
  id         uuid primary key default gen_random_uuid(),
  project    text not null,
  title      text not null,
  target     text,
  status     text not null default 'open',
  created_at timestamptz not null default now()
);

-- ============================================================
-- updated_at trigger for tasks
-- ============================================================
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger tasks_updated_at
  before update on tasks
  for each row execute function set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY  (greenfield = design it in, day one)
-- ============================================================
-- Posture: RLS enabled on every table. The bots (@ZAOstockTeamBot,
-- @ZAOcoworkingBot) connect with the Supabase SERVICE ROLE, which BYPASSES
-- RLS - they keep full access. RLS governs the WEB apps (anon / authenticated
-- keys).
--
-- The baseline policy below grants the `authenticated` role full read/write.
-- It is intentionally a placeholder: tighten to per-`project` scoping once the
-- web-app auth model is decided (see the TODO after the policy block). RLS is
-- ENABLED now so no table is ever accidentally world-open; the policy is the
-- part still to refine.

alter table team_members   enable row level security;
alter table circles        enable row level security;
alter table circle_members enable row level security;
alter table tasks          enable row level security;
alter table activity_log   enable row level security;
alter table sponsors       enable row level security;
alter table artists        enable row level security;
alter table volunteers     enable row level security;
alter table meeting_notes  enable row level security;
alter table contact_log    enable row level security;
alter table suggestions    enable row level security;
alter table budget_entries enable row level security;
alter table goals          enable row level security;

do $$
declare t text;
begin
  for t in select unnest(array[
    'team_members','circles','circle_members','tasks','activity_log',
    'sponsors','artists','volunteers','meeting_notes','contact_log',
    'suggestions','budget_entries','goals'])
  loop
    execute format(
      'create policy %1$s_authenticated_all on %1$s for all to authenticated using (true) with check (true)',
      t);
  end loop;
end $$;

-- TODO (before the web-app cutover, Phase 4): replace the blanket
-- `authenticated` policy above with per-project policies - e.g. a task row is
-- visible/editable only when its `project` is in the caller's allowed set.
-- Needs the web-app auth decision first (how a user maps to allowed projects).

-- ============================================================
-- SEED - the 6 cobuild circles
-- ============================================================
insert into circles (slug, name) values
  ('finance',    'Finance'),
  ('host',       'Host'),
  ('livestream', 'Livestream'),
  ('marketing',  'Marketing'),
  ('music',      'Music'),
  ('ops',        'Ops');
