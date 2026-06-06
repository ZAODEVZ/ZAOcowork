import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface DepRef {
  id: string;
  title: string;
  status: string;
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
    .select("blocker:blocker_id(id,title,status)")
    .eq("blocked_id", taskId);

  // blocks: tasks that this task blocks (blocked_id -> task)
  const { data: blocksRows } = await client
    .from("task_dependencies")
    .select("blocked:blocked_id(id,title,status)")
    .eq("blocker_id", taskId);

  const blockedBy = (blockedByRows ?? [])
    .map((row) => row.blocker as unknown as DepRef)
    .filter(Boolean);

  const blocks = (blocksRows ?? [])
    .map((row) => row.blocked as unknown as DepRef)
    .filter(Boolean);

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

export async function wouldCreateCycle(
  blockerId: string,
  blockedId: string
): Promise<boolean> {
  const client = db();
  const visited = new Set<string>();
  const queue: string[] = [blockerId];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);

    if (cur === blockedId) return true;

    // Find all tasks that block cur
    const { data } = await client
      .from("task_dependencies")
      .select("blocker_id")
      .eq("blocked_id", cur);

    if (data) {
      for (const row of data) {
        if (!visited.has(row.blocker_id)) {
          queue.push(row.blocker_id);
        }
      }
    }
  }

  return false;
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
