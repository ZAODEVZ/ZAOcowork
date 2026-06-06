# Task Dependencies + Auto-Flow Design

> **Date:** 2026-06-06
> **Status:** Approved design, pre-implementation
> **Repo:** ZAODEVZ/ZAOcowork
> **Branch:** ws/task-dependencies (to be created)

## Goal

Add the missing connective tissue between todos: task->task dependencies (`blocks` / `blocked-by`), so the board shows *this is waiting on that*, and flows automatically - a task goes BLOCKED while it has an open blocker and returns to TODO when its last blocker closes. This ties into the auto-close shipped in PR #48: close a PR -> its task closes -> the tasks it was blocking unblock.

Projects (task->project) already exist and are wired - this cycle is ONLY task->task dependencies. Public "shipped" layer is a later cycle.

## Status case mapping (critical - get this right)

- DB `tasks.status` is lowercase: `triage|todo|wip|blocked|done`.
- App layer (`ActionItem.status`) is UPPERCASE: `TRIAGE|TODO|WIP|BLOCKED|DONE`; `src/lib/data.ts` normalizes between them.
- Auto-flow writes at the DB level (like `auto-close.ts`), so it uses **lowercase** `'blocked'` / `'todo'`. UI reads the normalized uppercase value.

## Data model

New table `task_dependencies` (migration 008):
```sql
CREATE TABLE IF NOT EXISTS task_dependencies (
  blocker_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,  -- must finish first
  blocked_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,  -- waits on blocker
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX IF NOT EXISTS task_deps_blocked_idx ON task_dependencies(blocked_id);
CREATE INDEX IF NOT EXISTS task_deps_blocker_idx ON task_dependencies(blocker_id);
```

## Units

### `src/lib/dependencies.ts` (data access)
- `getDependencies(taskId): Promise<{ blockedBy: DepRef[]; blocks: DepRef[] }>` where `DepRef = { id, title, status }` (joins tasks for display).
- `addDependency(blockerId, blockedId, createdBy): Promise<{ ok: boolean; error?: string }>` - rejects self-dep and cycles (see cycle check) and duplicates.
- `removeDependency(blockerId, blockedId): Promise<void>`.
- `wouldCreateCycle(blockerId, blockedId): Promise<boolean>` - walks the existing blocked->blocker graph from `blockerId`; if `blockedId` is reachable as an ancestor, adding the edge makes a cycle. Bounded walk (visited set).

### `src/lib/dep-flow.ts` (auto-flow, DB-level lowercase)
- `recomputeBlockedState(taskIds: string[]): Promise<string[]>` - for each task, count its OPEN blockers (blocker status != 'done'). If open blockers > 0 and status is 'todo' -> set 'blocked'. If open blockers == 0 and status is 'blocked' -> set 'todo'. Never touches 'wip'/'done'/'triage' (only auto-toggles the todo<->blocked pair). Returns the ids it changed. Idempotent.
- `onTaskClosed(closedTaskId): Promise<string[]>` - find tasks blocked_by closedTaskId, call recomputeBlockedState on them. Returns unblocked ids.

### Integration hooks
- **Manual status change** (`src/app/actions.ts` saveItem path): after a task is set to DONE, call `onTaskClosed(id)`. After a dependency is added, call `recomputeBlockedState([blockedId])`.
- **Auto-close** (`src/lib/auto-close.ts` closeMergedSources + `src/app/api/github/webhook/route.ts`): after closing a task, call `onTaskClosed(id)` so the merge->close->unblock chain completes.

### UI
- **TaskRoom** (`src/components/TaskRoom.tsx`): a `<DependenciesBlock item={item} allTasks={...} />` near OriginBlock. Two lists: "Blocked by" + "Blocks", each row = linked task title + status + a remove (x). An "+ add" control with a task picker (search the existing tasks list already loaded on the page; pass it as a prop). Adding posts a server action; on cycle/dup rejection, show the inline error.
- **Board card** (`src/components/Board.tsx`): chip `⛔ {n}` when the task has >0 open blockers (title "blocked by n"), and `→ {n}` when it blocks others. Counts come from the dependency data loaded with the board (extend the page-level fetch to include a per-task dep summary, or a single `getAllDependencyCounts()` map).

### Server actions (`src/app/actions.ts` additions)
- `addTaskDependency(form)` / `removeTaskDependency(form)` - auth-checked, call the lib, revalidate.

## Data flow

```
add dep (TaskRoom) --server action--> dependencies.addDependency (cycle/dup guard)
                                          -> recomputeBlockedState([blocked]) -> maybe set 'blocked'
close task (manual OR auto-close/webhook) -> onTaskClosed(id)
                                          -> recomputeBlockedState(tasks blocked_by id) -> maybe set 'todo'
board render --getAllDependencyCounts()--> ⛔/→ chips ; TaskRoom --getDependencies(id)--> lists
```

## Error handling
- Self-dependency: DB CHECK + lib guard -> rejected with message.
- Cycle: `wouldCreateCycle` -> reject before insert, inline error "would create a dependency loop".
- Duplicate edge: PK conflict -> treated as no-op success.
- Deleting a task cascades its dependency rows (ON DELETE CASCADE).
- Auto-flow only toggles todo<->blocked; it never closes/reopens DONE or moves WIP, so a human's explicit status is respected.

## TEST PLAN (manual, step by step)

Run locally: `cd ~/Desktop/repos/ZAOcowork && npm run dev`, open http://localhost:3000, log in. (Migration 008 must be applied to the DB first.)

1. **Create the link.** Make two tasks: A "do first", B "needs A". Open B -> Dependencies -> "Blocked by" -> add A. Expect: B's card immediately shows `⛔ 1`, B moves to the BLOCKED column. A's card shows `→ 1`.
2. **Auto-unblock on close.** Mark A done. Expect: B's `⛔` disappears and B auto-returns to the TODO column (no manual move).
3. **Cycle guard.** Re-add A blocked-by B; now try to add B blocked-by A. Expect: rejected with "would create a dependency loop". No row created.
4. **Self guard.** Try to add A blocked-by A. Expect: rejected, no row.
5. **Merge synergy (full flow).** Make task A carry legacy_id `pr-test-<N>` for a real open PR, and make B blocked-by A. Merge PR #N on GitHub. Within the 15-min poll (or instantly via webhook): A auto-closes (DONE) AND B unblocks (TODO). This proves Module 2 + dependencies chain together.
6. **Remove.** Open B -> remove the A dependency. Expect: chips update, B's blocked state recomputes (back to TODO if A was its only open blocker).
7. **Respect manual status.** Set B to WIP, then add an open blocker. Expect: auto-flow does NOT yank B out of WIP (only toggles todo<->blocked).

## Out of scope
Public "shipped" layer (Module 6), project rollup progress view, dependency visualization graph. Separate cycles.

## Decisions locked
- 2026-06-06: Dependencies + auto-flow (auto-BLOCKED + auto-unblock-on-close), per Zaal.
- Auto-flow toggles only the todo<->blocked pair; never overrides WIP/DONE/TRIAGE.
- Dependencies are task->task only; project grouping already exists separately.
