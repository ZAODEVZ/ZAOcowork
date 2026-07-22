-- 023_add_events_to_tasks.sql
-- Extend the tasks table to support events as a task type.
-- Events are tasks flagged with is_event=true and have a scheduled date/time.
-- They appear on the board (status column) and can be listed/filtered via /calendar.

-- 1. Add 'event' to the task_type enum constraint
alter table tasks
  drop constraint tasks_task_type_check,
  add constraint tasks_task_type_check
    check (task_type in ('task','work_order','incident','approval_request','goal','maintenance','event'));

-- 2. Add event-specific columns (all nullable - events can be minimal)
alter table tasks
  add column if not exists is_event boolean not null default false,
  add column if not exists event_at timestamptz,
  add column if not exists event_location text,
  add column if not exists event_url text;

-- 3. Index on is_event + event_at for the /calendar query (events ordered by date)
create index if not exists tasks_is_event_event_at_idx on tasks(is_event, event_at)
  where is_event = true;

-- 4. RLS: inherit from tasks table (same policies apply)
-- No new RLS policies needed - events follow the same visibility rules as tasks.

comment on column tasks.is_event is 'Flag: this task is an event with a scheduled date/time';
comment on column tasks.event_at is 'Event start date and time (only used if is_event=true)';
comment on column tasks.event_location is 'Physical or virtual location (optional)';
comment on column tasks.event_url is 'External URL (link to event page, video call, etc)';
