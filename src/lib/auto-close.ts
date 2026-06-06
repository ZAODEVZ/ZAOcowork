// auto-close.ts - Auto-close tasks when their source PR merges.
// Called from a protected route. Never throws on individual row failures,
// but lets top-level DB errors propagate.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resolveSource } from "@/lib/source-resolver";
import { getPrStatuses } from "@/lib/source-status";
import { logAudit } from "@/lib/audit";
import { onTaskClosed } from "@/lib/dep-flow";

export interface AutoCloseResult {
  closed: string[];
  checked: number;
}

interface TaskRowForClose {
  id: string;
  legacy_id: string | null;
  legacy_source: string | null;
  status: string;
}

let cachedClient: SupabaseClient | null = null;

function db(): SupabaseClient {
  if (cachedClient) return cachedClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY missing - cannot reach tasks");
  }
  cachedClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

export async function closeMergedSources(): Promise<AutoCloseResult> {
  // Read all non-done tasks
  const { data: tasks, error: readError } = await db()
    .from("tasks")
    .select("id, legacy_id, legacy_source, status")
    .neq("status", "done");

  if (readError) {
    throw new Error(`Failed to read tasks: ${readError.message}`);
  }

  const taskRows = (tasks || []) as TaskRowForClose[];

  // Resolve sources and collect PR tasks
  const prTasks: Array<{
    row: TaskRowForClose;
    prNumber: string;
  }> = [];

  for (const row of taskRows) {
    const resolved = resolveSource({
      legacyId: row.legacy_id ?? undefined,
      legacySource: row.legacy_source ?? undefined,
    });

    if (resolved.kind === "pr" && resolved.refId) {
      prTasks.push({ row, prNumber: resolved.refId });
    }
  }

  if (prTasks.length === 0) {
    return { closed: [], checked: 0 };
  }

  // Fetch PR statuses
  const prNumbers = prTasks.map((t) => t.prNumber);
  const statuses = await getPrStatuses(prNumbers);

  // Close merged tasks
  const closed: string[] = [];

  for (const { row, prNumber } of prTasks) {
    const status = statuses[prNumber];
    if (!status || status.state !== "merged") {
      continue;
    }

    // Update task to done (idempotent: only if not already done)
    const { error: updateError } = await db()
      .from("tasks")
      .update({ status: "done" })
      .eq("id", row.id)
      .neq("status", "done");

    if (updateError) {
      // Log but don't throw; continue with next row
      console.error(
        `Failed to close task ${row.id} (PR #${prNumber}): ${updateError.message}`,
      );
      continue;
    }

    // Log the audit event
    closed.push(row.legacy_id || row.id);
    await onTaskClosed(row.id);
    await logAudit({
      actor: "system-autoclose",
      entity_type: "task",
      entity_id: row.id,
      entity_label: row.legacy_id || row.id,
      action: "status_change",
      detail: `auto-closed: PR #${prNumber} merged`,
    });
  }

  return { closed, checked: prTasks.length };
}
