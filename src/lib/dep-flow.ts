import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

function db(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_KEY missing - cannot reach dep-flow"
    );
  }

  cachedClient = createClient(url, key, {
    auth: { persistSession: false },
  });

  return cachedClient;
}

export async function recomputeBlockedState(
  taskIds: string[]
): Promise<string[]> {
  // Dedupe
  const unique = Array.from(new Set(taskIds));
  const changed: string[] = [];
  const client = db();

  for (const id of unique) {
    try {
      // Read current task
      const { data: task } = await client
        .from("tasks")
        .select("id, status")
        .eq("id", id)
        .single();

      if (!task) continue;

      const currentStatus = task.status as string;

      // Skip if not in a state we manage
      if (!["todo", "blocked"].includes(currentStatus)) continue;

      // Count open blockers (blocker status !== 'done')
      const { data: deps } = await client
        .from("task_dependencies")
        .select("blocker:blocker_id(status)")
        .eq("blocked_id", id);

      let openBlockers = 0;
      if (deps) {
        for (const dep of deps) {
          const blocker = dep.blocker as unknown as { status: string } | null;
          if (blocker?.status !== "done") {
            openBlockers += 1;
          }
        }
      }

      // Compute target status
      const targetStatus = openBlockers > 0 ? "blocked" : "todo";

      // Update if different
      if (currentStatus !== targetStatus) {
        const { error } = await client
          .from("tasks")
          .update({ status: targetStatus })
          .eq("id", id);

        if (!error) {
          changed.push(id);
        }
      }
    } catch (err) {
    // Was a bare `catch {}`. Behaviour is unchanged - this still degrades
    // gracefully - but the failure is no longer invisible. Two outages this
    // week (the auto-close cron, the Cloudinary key) survived for weeks
    // precisely because the failure path was silent.
    console.warn(`[dep-flow] swallowed:`, err instanceof Error ? err.message : err);
      // Silently continue on per-task error
    }
  }

  return changed;
}

export async function onTaskClosed(closedTaskId: string): Promise<string[]> {
  const client = db();

  // Find all tasks blocked by this one
  const { data } = await client
    .from("task_dependencies")
    .select("blocked_id")
    .eq("blocker_id", closedTaskId);

  const blockedIds = data?.map((row) => row.blocked_id) ?? [];

  if (blockedIds.length === 0) {
    return [];
  }

  return recomputeBlockedState(blockedIds);
}
