# Task Dependencies + Auto-Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add task->task dependencies (blocks/blocked-by) with auto-flow: a task goes BLOCKED while it has an open blocker and returns to TODO when its last blocker closes (chaining into the PR auto-close from PR #48).

**Architecture:** A `task_dependencies` join table. `dependencies.ts` does CRUD + cycle prevention. `dep-flow.ts` recomputes the todo<->blocked toggle at the DB level (lowercase status) and is called from the manual status-change path (actions.ts) and the auto-close path (auto-close.ts + webhook). UI: a DependenciesBlock in TaskRoom + count chips on the board card.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind v3, `@supabase/supabase-js` service-role client (pattern from src/lib/audit.ts). No test framework - verify via `npm run build` + the manual TEST PLAN in the spec.

**Status case:** DB status is lowercase (`todo|wip|blocked|done`); app `ActionItem.status` is UPPERCASE; data.ts normalizes. Auto-flow writes lowercase.

---

## File Structure
- Create `supabase/migrations/008_task_dependencies.sql`
- Create `src/lib/dependencies.ts` - CRUD + cycle check (service-role)
- Create `src/lib/dep-flow.ts` - recomputeBlockedState + onTaskClosed
- Modify `src/lib/auto-close.ts` - call onTaskClosed after each close
- Modify `src/app/api/github/webhook/route.ts` - call onTaskClosed after webhook close
- Modify `src/app/actions.ts` - addTaskDependency/removeTaskDependency server actions + call onTaskClosed on manual DONE
- Modify `src/components/TaskRoom.tsx` - DependenciesBlock UI
- Modify `src/components/Board.tsx` + `src/app/page.tsx` - dep-count chips + page-level counts fetch

---

## Task 1: Migration 008

**Files:** Create `supabase/migrations/008_task_dependencies.sql`

- [ ] **Step 1: Write the migration**
```sql
-- 008_task_dependencies.sql - task->task blocks/blocked-by. Idempotent.
CREATE TABLE IF NOT EXISTS task_dependencies (
  blocker_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX IF NOT EXISTS task_deps_blocked_idx ON task_dependencies(blocked_id);
CREATE INDEX IF NOT EXISTS task_deps_blocker_idx ON task_dependencies(blocker_id);
```
- [ ] **Step 2: Commit** (apply to DB is a manual step, documented in final task)
```bash
git add supabase/migrations/008_task_dependencies.sql
git commit -m "feat(deps): task_dependencies migration 008"
```

---

## Task 2: dependencies.ts (CRUD + cycle prevention)

**Files:** Create `src/lib/dependencies.ts`

- [ ] **Step 1: Confirm service-client env names**
Run: `grep -nE "SUPABASE_SERVICE_KEY|NEXT_PUBLIC_SUPABASE_URL|SUPABASE_URL" src/lib/audit.ts | head`
Use the exact names found (expected `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`).

- [ ] **Step 2: Write the module**
```typescript
// src/lib/dependencies.ts - task->task dependency CRUD + cycle guard. Service-role.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface DepRef { id: string; title: string; status: string }
export interface AddDepResult { ok: boolean; error?: string }

let cached: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, { auth: { persistSession: false } });
  return cached;
}

export async function getDependencies(taskId: string): Promise<{ blockedBy: DepRef[]; blocks: DepRef[] }> {
  const [bb, bl] = await Promise.all([
    db().from("task_dependencies").select("blocker:blocker_id(id,title,status)").eq("blocked_id", taskId),
    db().from("task_dependencies").select("blocked:blocked_id(id,title,status)").eq("blocker_id", taskId),
  ]);
  const blockedBy = (bb.data ?? []).map((r) => r.blocker as unknown as DepRef).filter(Boolean);
  const blocks = (bl.data ?? []).map((r) => r.blocked as unknown as DepRef).filter(Boolean);
  return { blockedBy, blocks };
}

// counts for the whole board in one query: returns { [taskId]: { blockedByOpen, blocks } }
export async function getDependencyCounts(): Promise<Record<string, { blockedByOpen: number; blocks: number }>> {
  const { data } = await db()
    .from("task_dependencies")
    .select("blocker_id, blocked_id, blocker:blocker_id(status)");
  const out: Record<string, { blockedByOpen: number; blocks: number }> = {};
  for (const row of data ?? []) {
    const blockerStatus = (row.blocker as unknown as { status?: string } | null)?.status;
    const blocked = row.blocked_id as string;
    const blocker = row.blocker_id as string;
    out[blocked] ??= { blockedByOpen: 0, blocks: 0 };
    out[blocker] ??= { blockedByOpen: 0, blocks: 0 };
    if (blockerStatus !== "done") out[blocked].blockedByOpen += 1;
    out[blocker].blocks += 1;
  }
  return out;
}

export async function wouldCreateCycle(blockerId: string, blockedId: string): Promise<boolean> {
  // Adding blocker->blocked creates a cycle if blocker is already (transitively) blocked by blocked.
  // Walk upstream from blockerId via its own blockers; if we reach blockedId, it's a cycle.
  const visited = new Set<string>();
  const stack = [blockerId];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === blockedId) return true;
    if (visited.has(cur)) continue;
    visited.add(cur);
    const { data } = await db().from("task_dependencies").select("blocker_id").eq("blocked_id", cur);
    for (const r of data ?? []) stack.push(r.blocker_id as string);
  }
  return false;
}

export async function addDependency(blockerId: string, blockedId: string, createdBy: string): Promise<AddDepResult> {
  if (blockerId === blockedId) return { ok: false, error: "A task can't block itself" };
  if (await wouldCreateCycle(blockerId, blockedId)) return { ok: false, error: "Would create a dependency loop" };
  const { error } = await db().from("task_dependencies").upsert(
    { blocker_id: blockerId, blocked_id: blockedId, created_by: createdBy },
    { onConflict: "blocker_id,blocked_id", ignoreDuplicates: true },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function removeDependency(blockerId: string, blockedId: string): Promise<void> {
  await db().from("task_dependencies").delete().eq("blocker_id", blockerId).eq("blocked_id", blockedId);
}
```
- [ ] **Step 3: Verify + commit**
Run: `npm run build` (clean).
```bash
git add src/lib/dependencies.ts
git commit -m "feat(deps): dependency CRUD + cycle prevention"
```

---

## Task 3: dep-flow.ts (auto-flow)

**Files:** Create `src/lib/dep-flow.ts`

- [ ] **Step 1: Write the module**
```typescript
// src/lib/dep-flow.ts - auto-toggle todo<->blocked based on open blockers. DB lowercase status.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, { auth: { persistSession: false } });
  return cached;
}

// For each task: if it has >0 open blockers and is 'todo' -> 'blocked'.
// If it has 0 open blockers and is 'blocked' -> 'todo'. Never touch wip/done/triage.
export async function recomputeBlockedState(taskIds: string[]): Promise<string[]> {
  const ids = Array.from(new Set(taskIds));
  if (ids.length === 0) return [];
  const changed: string[] = [];
  for (const id of ids) {
    const { data: task } = await db().from("tasks").select("id,status").eq("id", id).single();
    if (!task || (task.status !== "todo" && task.status !== "blocked")) continue;
    const { data: deps } = await db()
      .from("task_dependencies")
      .select("blocker:blocker_id(status)")
      .eq("blocked_id", id);
    const openBlockers = (deps ?? []).filter((d) => (d.blocker as unknown as { status?: string } | null)?.status !== "done").length;
    const target = openBlockers > 0 ? "blocked" : "todo";
    if (task.status !== target) {
      const { error } = await db().from("tasks").update({ status: target }).eq("id", id);
      if (!error) changed.push(id);
    }
  }
  return changed;
}

// When a task closes, recompute the tasks it was blocking.
export async function onTaskClosed(closedTaskId: string): Promise<string[]> {
  const { data } = await db().from("task_dependencies").select("blocked_id").eq("blocker_id", closedTaskId);
  const blockedIds = (data ?? []).map((r) => r.blocked_id as string);
  return recomputeBlockedState(blockedIds);
}
```
- [ ] **Step 2: Verify + commit**
Run: `npm run build` (clean).
```bash
git add src/lib/dep-flow.ts
git commit -m "feat(deps): auto-flow recomputeBlockedState + onTaskClosed"
```

---

## Task 4: Wire auto-flow into the close paths

**Files:** Modify `src/lib/auto-close.ts`, `src/app/api/github/webhook/route.ts`

- [ ] **Step 1: auto-close.ts** - after a task is set to done in `closeMergedSources`, call onTaskClosed.
Run `grep -n "status.*done\|closed.push\|logAudit" src/lib/auto-close.ts` to find the close site. Add at top: `import { onTaskClosed } from "@/lib/dep-flow";`. After the successful `closed.push(...)` for a row, add:
```typescript
await onTaskClosed(row.id);
```
- [ ] **Step 2: webhook** - in `src/app/api/github/webhook/route.ts`, after the reverse-close update (the block that sets pr-test tasks to done), fetch the affected task ids and call onTaskClosed for each. Since the update is by `.or(legacy_id...)`, change it to `.select("id")` on the update (PostgREST returns updated rows with `Prefer: return=representation` or `.select()`), then:
```typescript
import { onTaskClosed } from "@/lib/dep-flow";
// ...after the update that closes pr-test tasks (capture returned rows as `closedRows`):
for (const r of closedRows ?? []) { await onTaskClosed(r.id as string); }
```
Run `grep -n "pr-test\|update({ status" src/app/api/github/webhook/route.ts` to find the exact update; add `.select("id")` to it to capture ids, then loop.
- [ ] **Step 3: Verify + commit**
Run: `npm run build`.
```bash
git add src/lib/auto-close.ts src/app/api/github/webhook/route.ts
git commit -m "feat(deps): unblock dependents when a task auto-closes"
```

---

## Task 5: Manual status-change hook + server actions

**Files:** Modify `src/app/actions.ts`

- [ ] **Step 1: Read the saveItem DONE branch**
Run: `sed -n '120,175p' src/app/actions.ts` - find where `next.status === "DONE"` is handled (around line 146). Confirm the saved row's id variable name.

- [ ] **Step 2: Call onTaskClosed on manual close**
Add `import { onTaskClosed } from "@/lib/dep-flow";`. In the `prev.status !== "DONE" && next.status === "DONE"` branch, after the save completes, add (use the real task id var):
```typescript
await onTaskClosed(savedId);
```

- [ ] **Step 3: Add dependency server actions**
Append to actions.ts (match the file's existing auth/getUser pattern - grep `getUser\|getCurrentUser\|requireUser` first and use the real one):
```typescript
import { addDependency, removeDependency } from "@/lib/dependencies";
import { recomputeBlockedState } from "@/lib/dep-flow";

export async function addTaskDependency(form: FormData): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser(); // use the real auth accessor from this file
  if (!user) return { ok: false, error: "unauthorized" };
  const blockerId = String(form.get("blockerId") ?? "");
  const blockedId = String(form.get("blockedId") ?? "");
  if (!blockerId || !blockedId) return { ok: false, error: "missing ids" };
  const res = await addDependency(blockerId, blockedId, user.name ?? "web");
  if (res.ok) await recomputeBlockedState([blockedId]);
  revalidatePath("/");
  return res;
}

export async function removeTaskDependency(form: FormData): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const blockerId = String(form.get("blockerId") ?? "");
  const blockedId = String(form.get("blockedId") ?? "");
  await removeDependency(blockerId, blockedId);
  await recomputeBlockedState([blockedId]);
  revalidatePath("/");
  return { ok: true };
}
```
- [ ] **Step 4: Verify + commit**
Run: `npm run build`.
```bash
git add src/app/actions.ts
git commit -m "feat(deps): manual-close unblock hook + add/remove dependency actions"
```

---

## Task 6: TaskRoom DependenciesBlock UI

**Files:** Modify `src/components/TaskRoom.tsx`

- [ ] **Step 1: Read the DetailsPanel + how it gets the task list**
Run: `sed -n '307,340p' src/components/TaskRoom.tsx` and `grep -n "items\|allTasks\|tasks\b\|projects=" src/components/TaskRoom.tsx | head`. Determine how to get the list of all tasks for the picker (a prop, or pass from Board). If TaskRoom already receives the items list, use it; else add an `allTasks: { id: string; title: string }[]` prop threaded from Board.tsx where TaskRoom is rendered.

- [ ] **Step 2: Add the DependenciesBlock component** (client) near OriginBlock. It:
  - on mount, fetches current deps via a new route `GET /api/dependencies?taskId=<id>` (create it: returns getDependencies(id)); shows "Blocked by" + "Blocks" lists with each item's title + status + a remove (x) calling `removeTaskDependency`.
  - has an "+ add blocker" control: a small searchable select over allTasks (exclude self + already-linked); on pick, calls `addTaskDependency({ blockerId: picked, blockedId: item.id })`; on `{ ok:false }` show the inline error (cycle/self).
  - Create `src/app/api/dependencies/route.ts`:
```typescript
import { NextResponse, type NextRequest } from "next/server";
import { getDependencies } from "@/lib/dependencies";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  const taskId = req.nextUrl.searchParams.get("taskId");
  if (!taskId) return NextResponse.json({ ok: false }, { status: 400 });
  return NextResponse.json({ ok: true, ...(await getDependencies(taskId)) });
}
```
  - Mount `<DependenciesBlock item={item} allTasks={allTasks} />` in DetailsPanel after `<OriginBlock item={item} />`. Match TaskRoom Tailwind styling. Use the `addTaskDependency`/`removeTaskDependency` server actions (import from "@/app/actions") inside transitions; refetch deps after a mutation.
- [ ] **Step 3: Verify + commit**
Run: `npm run build`; manual: open a task room, see "Blocked by"/"Blocks" sections.
```bash
git add src/components/TaskRoom.tsx src/app/api/dependencies/route.ts
git commit -m "feat(deps): TaskRoom blocked-by/blocks UI"
```

---

## Task 7: Board card dependency chips

**Files:** Modify `src/components/Board.tsx`, `src/app/page.tsx`

- [ ] **Step 1: Load counts at page level**
In `src/app/page.tsx`, import `getDependencyCounts` from "@/lib/dependencies", call it alongside the existing tasks fetch, and pass the resulting map to the Board as a `depCounts` prop. Run `grep -n "getActions\|<Board\|export default" src/app/page.tsx` to find the fetch + Board mount.

- [ ] **Step 2: Render chips on the card**
In Board.tsx, accept the `depCounts` prop and, in the card render (near the origin row added last cycle), add:
```tsx
{depCounts?.[item.dbId ?? ""]?.blockedByOpen ? (
  <span className="text-[10px] text-amber-300/80" title="blocked by open tasks">⛔ {depCounts[item.dbId!].blockedByOpen}</span>
) : null}
{depCounts?.[item.dbId ?? ""]?.blocks ? (
  <span className="text-[10px] text-white/50" title="blocks other tasks">→ {depCounts[item.dbId!].blocks}</span>
) : null}
```
Run `grep -n "dbId\|item.id\|resolveSource" src/components/Board.tsx | head` to confirm the card's stable task id field (likely `item.dbId` = the UUID; the counts map is keyed by UUID).
- [ ] **Step 3: Verify + commit**
Run: `npm run build`; manual: a task with a blocker shows ⛔.
```bash
git add src/components/Board.tsx src/app/page.tsx
git commit -m "feat(deps): board card dependency chips"
```

---

## Task 8: Integration verify + PR

- [ ] **Step 1: Full build** - `npm run build` (clean).
- [ ] **Step 2: Run the spec's TEST PLAN** (docs/superpowers/specs/2026-06-06-task-dependencies-design.md) steps 1-7 in `npm run dev` after applying migration 008 locally if a local DB is available; otherwise note that the manual test runs post-deploy.
- [ ] **Step 3: Push + PR**
```bash
git push -u origin ws/task-dependencies
gh pr create --base main --title "feat: task dependencies + auto-flow (blocks/blocked-by)" --body "Implements docs/superpowers/specs/2026-06-06-task-dependencies-design.md. task->task deps, cycle-guarded, with auto-BLOCKED + auto-unblock-on-close (chains into PR #48 auto-close). New migration 008 (task_dependencies) - apply to etwvzrmlxeobinrlytza. Test plan in the spec."
```
- [ ] **Step 4: Manual post-merge (Zaal):** apply `008_task_dependencies.sql` to the Supabase project.

---

## Self-Review

**Spec coverage:** task_dependencies table (T1) ✓; CRUD+cycle (T2) ✓; auto-flow recompute/onTaskClosed (T3) ✓; close-path hooks - auto-close + webhook (T4) + manual (T5) ✓; server actions (T5) ✓; TaskRoom UI + /api/dependencies (T6) ✓; board chips + page counts (T7) ✓; status case lowercase used in dep-flow + dependencies ✓; cycle/self/dup error handling (T2) ✓; "respect WIP/DONE" - recompute only toggles todo<->blocked (T3) ✓; test plan (T8) ✓.

**Placeholder scan:** No TBD/TODO. Integration steps (T4/T5/T6/T7) instruct a grep-then-insert because exact line numbers depend on current files - each gives the exact import + code to add and what to search for. Acceptable (mirrors last cycle's approved approach).

**Type consistency:** `getDependencies -> {blockedBy, blocks: DepRef[]}` (T2, used T6). `getDependencyCounts -> Record<id,{blockedByOpen,blocks}>` (T2, used T7). `recomputeBlockedState(string[]) -> string[]` + `onTaskClosed(string) -> string[]` (T3, used T4/T5). `addDependency(blockerId,blockedId,createdBy) -> {ok,error?}` consistent (T2,T5). Status strings lowercase throughout dep-flow. Board counts keyed by `item.dbId` (UUID) - T7 step 2 verifies the field name.
