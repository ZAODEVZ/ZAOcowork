// audit.ts - write + read for the cross-cutting audit_logs table (Phase E).
//
// Writers (logAudit) are called from admin server actions and the bulk task
// actions in src/app/actions.ts. They never throw - logging is best-effort so
// a transient audit-write failure doesn't take down the underlying action.
//
// Readers (listAuditLogs) feed the /admin AuditPanel.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type AuditEntityType = "task" | "user" | "brand" | "system";

export interface AuditLogRow {
  id: string;
  actor: string;
  entity_type: AuditEntityType;
  entity_id: string | null;
  entity_label: string | null;
  action: string;
  detail: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

let cachedClient: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (cachedClient) return cachedClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY missing - cannot reach audit_logs");
  }
  cachedClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

const SELECT_COLUMNS =
  "id, actor, entity_type, entity_id, entity_label, action, detail, metadata, created_at";

export interface LogInput {
  actor: string;
  entity_type: AuditEntityType;
  entity_id?: string | null;
  entity_label?: string | null;
  action: string;
  detail?: string | null;
  metadata?: Record<string, unknown> | null;
}

// Fire-and-forget write. Swallows all errors so the calling server action
// can finish its primary work even if audit_logs is unavailable. The
// migration-pending case (table doesn't exist) silently drops events - the
// AuditPanel will show an empty feed + a banner offering the migration.
export async function logAudit(input: LogInput): Promise<void> {
  try {
    await db()
      .from("audit_logs")
      .insert({
        actor: input.actor,
        entity_type: input.entity_type,
        entity_id: input.entity_id ?? null,
        entity_label: input.entity_label ?? null,
        action: input.action,
        detail: input.detail ?? null,
        metadata: input.metadata ?? null,
      });
  } catch {
    // ignore - best-effort logging
  }
}

export interface ListOptions {
  limit?: number;
  offset?: number;
  entity_type?: AuditEntityType | "all";
  actor?: string;
}

export async function listAuditLogs(opts: ListOptions = {}): Promise<{
  rows: AuditLogRow[];
  total: number | null;
  available: boolean;
}> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  try {
    let q = db()
      .from("audit_logs")
      .select(SELECT_COLUMNS, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (opts.entity_type && opts.entity_type !== "all") {
      q = q.eq("entity_type", opts.entity_type);
    }
    if (opts.actor) {
      q = q.ilike("actor", opts.actor);
    }
    const { data, error, count } = await q;
    if (error) {
      return { rows: [], total: null, available: false };
    }
    return {
      rows: (data ?? []) as AuditLogRow[],
      total: count ?? null,
      available: true,
    };
  } catch {
    return { rows: [], total: null, available: false };
  }
}

export async function listAuditActors(): Promise<string[]> {
  try {
    const { data, error } = await db()
      .from("audit_logs")
      .select("actor")
      .order("actor", { ascending: true });
    if (error || !data) return [];
    const seen = new Set<string>();
    for (const row of data as Array<{ actor: string }>) {
      if (row.actor) seen.add(row.actor);
    }
    return Array.from(seen);
  } catch {
    return [];
  }
}
