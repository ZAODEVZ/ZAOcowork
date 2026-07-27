-- 026_backfill_due_dates.sql
--
-- DATA CHANGE. Writes a due date onto the open tasks that have none.
-- Read this before running. Rollback is at the bottom.
--
-- Audit finding: 155 of 303 open tasks had no due date. PR #256 made every NEW
-- task get one from its service-class SLA, but said nothing about rows already
-- in the table - so "overdue" stayed meaningless for half the board.
--
-- WHY NOT THE FLAT SLA LADDER:
-- The first version of this migration reused task-defaults.ts's service_class
-- ladder directly. A dry run showed why that was wrong: all 155 rows carry
-- service_class = 'Standard' (nothing has ever set it to anything else), so
-- every single one would have landed on the SAME DAY - a 155-task wall one week
-- out. A cliff like that is worse than no due date: it is unmeetable on sight,
-- so it trains you to ignore the field entirely, which is the exact problem
-- this is supposed to fix.
--
-- Instead we stagger on the two signals that actually carry information here:
--
--   priority - P1 lands first, P3 last. service_class is uniform and therefore
--              useless for ordering; priority is populated and meaningful.
--   age      - oldest first within each priority, so the rows that have been
--              waiting longest surface first.
--
-- Load is capped at 8 tasks per due date. Resulting shape:
--
--   P1   31 tasks   Jul 30 - Aug 02
--   P2  100 tasks   Aug 10 - Aug 22   (includes the 18 with no priority)
--   P3   24 tasks   Aug 26 - Aug 28
--
-- Dates count from CURRENT_DATE, never from created_at. Counting from creation
-- would land every row in the past and manufacture 155 instantly-overdue tasks.
--
-- Scope: open, unarchived, no existing due date. DONE rows are excluded so no
-- fake overdue history is invented on finished work.

with target as (
  select id,
         coalesce(priority, 'P2') as p,
         row_number() over (
           partition by coalesce(priority, 'P2')
           order by created_at asc
         ) as rn
    from public.tasks
   where archived_at is null
     and status in ('todo', 'in_progress', 'blocked')
     and due is null
),
planned as (
  select id,
         (current_date + (
            (case p when 'P1' then 3 when 'P2' then 14 when 'P3' then 30 else 14 end)
            + floor((rn - 1) / 8.0)::int
          ) * interval '1 day')::date as new_due
    from target
)
update public.tasks t
   set due = planned.new_due,
       metadata = coalesce(t.metadata, '{}'::jsonb)
                  || jsonb_build_object('due_backfilled_at', now()),
       updated_at = now()
  from planned
 where t.id = planned.id;

-- Report the resulting spread.
select coalesce(priority, '(none)') as priority,
       count(*)                     as backfilled,
       min(due)                     as first_due,
       max(due)                     as last_due
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
-- Note this also clears a due date edited by hand afterwards, so roll back
-- promptly or not at all.
