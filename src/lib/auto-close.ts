// auto-close.ts - Auto-close tasks when their source PR merges.
// Called from a protected route. Never throws on individual row failures,
// but lets top-level DB errors propagate.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resolveSource } from "@/lib/source-resolver";
import { getPrStatuses } from "@/lib/source-status";
import { logAudit } from "@/lib/audit";
import { onTaskClosed } from "@/lib/dep-flow";
import { FALLBACK_OWNER } from "@/lib/task-defaults";

/** team_members.legacy_owner is stored lowercase; FALLBACK_OWNER is display-cased. */
const FALLBACK_OWNER_SLUG = FALLBACK_OWNER.toLowerCase();

export interface AutoCloseResult {
  closed: string[];
  checked: number;
}

export interface AdoptResult {
  adopted: number;
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

    // Dep-flow + audit are best-effort per task; a failure on one shouldn't
    // abort the batch or mark a task closed that didn't fully process.
    try {
      await onTaskClosed(row.id);
      await logAudit({
        actor: "system-autoclose",
        entity_type: "task",
        entity_id: row.id,
        entity_label: row.legacy_id || row.id,
        action: "status_change",
        detail: `auto-closed: PR #${prNumber} merged`,
      });
      closed.push(row.legacy_id || row.id);
    } catch (err) {
      console.error(`auto-close post-step failed for ${row.id}:`, err);
    }
  }

  return { closed, checked: prTasks.length };
}

/**
 * Adopt orphaned in-flight work.
 *
 * Audit finding (2026-07-26): 17 tasks sat in `in_progress` with `owner_id`
 * NULL. That state is a lie - the board claimed work was underway while it was
 * in nobody's my-work view, nobody's digest, and nobody's mentions. Those rows
 * are invisible to every per-person surface, so they can sit "in progress"
 * indefinitely without anyone noticing.
 *
 * Per Zaal's call: unowned in-flight work falls to Zaal. He is the operational
 * backstop and can route it out again in one click. A wrong-but-present owner
 * beats an honest-but-invisible NULL.
 *
 * Only touches `in_progress`. An unowned `todo` is a legitimate backlog item
 * waiting to be picked up - claiming those for Zaal would just re-create the
 * 220-task pile the audit flagged.
 */
export async function adoptUnownedInProgress(): Promise<AdoptResult> {
  const { data: fallback, error: memberError } = await db()
    .from("team_members")
    .select("id")
    .ilike("legacy_owner", FALLBACK_OWNER_SLUG)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (memberError) {
    console.error(`adopt-unowned: team lookup failed: ${memberError.message}`);
    return { adopted: 0 };
  }
  if (!fallback) {
    console.error(`adopt-unowned: no active team member "${FALLBACK_OWNER_SLUG}"; skipping`);
    return { adopted: 0 };
  }

  const fallbackId = (fallback as { id: string }).id;
  const { data, error } = await db()
    .from("tasks")
    .update({ owner_id: fallbackId, updated_at: new Date().toISOString() })
    .eq("status", "in_progress")
    .is("owner_id", null)
    .is("archived_at", null)
    .select("id, legacy_id");

  if (error) {
    console.error(`adopt-unowned: update failed: ${error.message}`);
    return { adopted: 0 };
  }

  const rows = (data ?? []) as Array<{ id: string; legacy_id: string | null }>;
  for (const row of rows) {
    try {
      await logAudit({
        actor: "system-adopt-unowned",
        entity_type: "task",
        entity_id: row.id,
        entity_label: row.legacy_id || row.id,
        action: "owner_change",
        detail: `unowned in_progress adopted by ${FALLBACK_OWNER_SLUG}`,
      });
    } catch (err) {
      console.error(`adopt-unowned: audit failed for ${row.id}:`, err);
    }
  }

  return { adopted: rows.length };
}
