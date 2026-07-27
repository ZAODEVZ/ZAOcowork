-- 026_backfill_due_dates.sql
--
-- DATA CHANGE. This writes a due date onto existing open tasks. Read the
-- rollback note at the bottom before running.
--
-- Audit finding: 155 of 303 open tasks had no due date. PR #256 made every
-- NEW task get one from its service-class SLA, but said nothing about rows
-- already in the table - so "overdue" stayed meaningless for half the board.
-- This backfills those rows using the same SLA ladder as
-- src/lib/task-defaults.ts:
--
--   Expedite    2 days
--   Standard    7 days
--   FixedDate  14 days
--   Intangible 30 days
--
-- Dates are counted from NOW, not from created_at. Counting from created_at
-- would land every backfilled row in the past and manufacture ~155 instantly
-- overdue tasks - the opposite of making the number meaningful.
--
-- Scope: open, unarchived, no existing due date. DONE rows are excluded so no
-- fake overdue history is invented on finished work.

-- Stamp the backfilled rows so they are identifiable afterwards (and so the
-- rollback below can find exactly this set).
update public.tasks
   set due = (current_date + (
         case coalesce(service_class, 'Standard')
           when 'Expedite'   then 2
           when 'Standard'   then 7
           when 'FixedDate'  then 14
           when 'Intangible' then 30
           else 7
         end
       ) * interval '1 day')::date,
       metadata = coalesce(metadata, '{}'::jsonb)
                  || jsonb_build_object('due_backfilled_at', now()),
       updated_at = now()
 where archived_at is null
   and status in ('todo', 'in_progress', 'blocked')
   and due is null;

-- Report what was touched.
select coalesce(service_class, 'Standard') as service_class,
       count(*)                            as backfilled,
       min(due)                            as earliest_due,
       max(due)                            as latest_due
  from public.tasks
 where metadata ? 'due_backfilled_at'
 group by 1
 order by 1;

-- ============================================================
-- Rollback
-- ============================================================
-- Every row this touched carries metadata->>'due_backfilled_at'. To undo:
--
--   update public.tasks
--      set due = null,
--          metadata = metadata - 'due_backfilled_at'
--    where metadata ? 'due_backfilled_at';
--
-- Note this also clears a due date if someone edited it by hand afterwards, so
-- roll back promptly or not at all.
