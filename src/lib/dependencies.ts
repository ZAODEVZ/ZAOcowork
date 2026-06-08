import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface DepRef {
  id: string;
  // App-facing id (legacy #N when present, else the UUID). Used to open the
  // task's room — the board keys TaskRoom on this, not the DB primary key.
  appId: string;
  title: string;
  status: string;
}

// Raw shape from the joined select before we derive appId.
interface DepRow {
  id: string;
  legacy_id: string | null;
  title: string;
  status: string;
}

function toDepRef(row: DepRow): DepRef {
  return {
    id: row.id,
    appId: row.legacy_id ?? row.id,
    title: row.title,
    status: row.status,
  };
}

export interface AddDepResult {
  ok: boolean;
  error?: string;
}

let cachedClient: SupabaseClient | null = null;

function db(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_KEY missing - cannot reach dependencies"
    );
  }

  cachedClient = createClient(url, key, {
    auth: { persistSession: false },
  });

  return cachedClient;
}

export async function getDependencies(
  taskId: string
): Promise<{ blockedBy: DepRef[]; blocks: DepRef[] }> {
  const client = db();

  // blockedBy: tasks that block this task (blocker_id -> task)
  const { data: blockedByRows } = await client
    .from("task_dependencies")
    .select("blocker:blocker_id(id,legacy_id,title,status)")
    .eq("blocked_id", taskId);

  // blocks: tasks that this task blocks (blocked_id -> task)
  const { data: blocksRows } = await client
    .from("task_dependencies")
    .select("blocked:blocked_id(id,legacy_id,title,status)")
    .eq("blocker_id", taskId);

  const blockedBy = (blockedByRows ?? [])
    .map((row) => row.blocker as unknown as DepRow)
    .filter(Boolean)
    .map(toDepRef);

  const blocks = (blocksRows ?? [])
    .map((row) => row.blocked as unknown as DepRow)
    .filter(Boolean)
    .map(toDepRef);

  return { blockedBy, blocks };
}

export async function getDependencyCounts(): Promise<
  Record<string, { blockedByOpen: number; blocks: number }>
> {
  const client = db();

  const { data } = await client
    .from("task_dependencies")
    .select("blocker_id, blocked_id, blocker:blocker_id(status)");

  const out: Record<string, { blockedByOpen: number; blocks: number }> = {};

  if (data) {
    for (const row of data) {
      const blocker = row.blocker as unknown as { status: string } | null;
      const blockerStatus = blocker?.status ?? "unknown";

      if (!out[row.blocked_id]) {
        out[row.blocked_id] = { blockedByOpen: 0, blocks: 0 };
      }
      if (!out[row.blocker_id]) {
        out[row.blocker_id] = { blockedByOpen: 0, blocks: 0 };
      }

      if (blockerStatus !== "done") {
        out[row.blocked_id].blockedByOpen += 1;
      }
      out[row.blocker_id].blocks += 1;
    }
  }

  return out;
}

/**
 * Pure cycle check: would adding blocker->blocked create a loop? BFS over the
 * full edge list (blocked_id -> its blockers). Extracted from the DB layer so
 * it's unit-testable and so the query is a single round-trip (was one query per
 * visited node — O(N) round-trips, timeout risk on deep chains).
 */
export function dependencyCycleExists(
  edges: Array<{ blocker_id: string; blocked_id: string }>,
  blockerId: string,
  blockedId: string,
): boolean {
  const blockersOf = new Map<string, string[]>();
  for (const e of edges) {
    const arr = blockersOf.get(e.blocked_id) ?? [];
    arr.push(e.blocker_id);
    blockersOf.set(e.blocked_id, arr);
  }
  const visited = new Set<string>();
  const queue: string[] = [blockerId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    if (cur === blockedId) return true;
    for (const b of blockersOf.get(cur) ?? []) {
      if (!visited.has(b)) queue.push(b);
    }
  }
  return false;
}

export async function wouldCreateCycle(
  blockerId: string,
  blockedId: string,
): Promise<boolean> {
  // One round-trip: load the whole (small) edge set, then BFS in memory.
  const { data, error } = await db()
    .from("task_dependencies")
    .select("blocker_id, blocked_id");
  if (error || !data) return false;
  return dependencyCycleExists(
    data as Array<{ blocker_id: string; blocked_id: string }>,
    blockerId,
    blockedId,
  );
}

export async function addDependency(
  blockerId: string,
  blockedId: string,
  createdBy: string
): Promise<AddDepResult> {
  if (blockerId === blockedId) {
    return { ok: false, error: "A task can't block itself" };
  }

  const hasCycle = await wouldCreateCycle(blockerId, blockedId);
  if (hasCycle) {
    return { ok: false, error: "Would create a dependency loop" };
  }

  try {
    const client = db();
    await client
      .from("task_dependencies")
      .upsert(
        { blocker_id: blockerId, blocked_id: blockedId, created_by: createdBy },
        {
          onConflict: "blocker_id,blocked_id",
          ignoreDuplicates: true,
        }
      );
    return { ok: true };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown error adding dependency";
    return { ok: false, error: message };
  }
}

export async function removeDependency(
  blockerId: string,
  blockedId: string
): Promise<void> {
  const client = db();
  await client
    .from("task_dependencies")
    .delete()
    .eq("blocker_id", blockerId)
    .eq("blocked_id", blockedId);
}
