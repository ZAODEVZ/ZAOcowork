// AI proposals + approval queue (doc 764 F7).
//
// Pattern from moodler/liz-tracker + Plane AI Sidecar's safe-mode: LLMs
// can PROPOSE mutations but only humans can APPLY them. Every proposal
// lives in task_proposals with status=pending until an admin approves
// or rejects. Approve runs the underlying mutation and stamps the row.
//
// Server-only. Service-role key required.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type ProposalStatus = "pending" | "approved" | "rejected";

export type ProposalAction =
  | "set_brands"
  | "set_owner"
  | "set_service_class"
  | "set_priority"
  | "flag_duplicate"
  | "add_comment"
  | "move_status";

export interface ProposalRow {
  id: string;
  task_id: string; // task legacy id (short)
  action_type: ProposalAction;
  payload: Record<string, unknown>;
  source: string; // 'llm' | 'rule:dedup' | 'cron:weekly' | ...
  confidence: number | null;
  rationale: string | null;
  status: ProposalStatus;
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
}

let cached: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY missing - cannot reach task_proposals");
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

const SELECT_COLS = "id, task_id, action_type, payload, source, confidence, rationale, status, created_at, decided_at, decided_by";

export async function createProposal(
  input: Omit<ProposalRow, "id" | "created_at" | "decided_at" | "decided_by" | "status">,
): Promise<{ id: string } | null> {
  try {
    const { data, error } = await db()
      .from("task_proposals")
      .insert({
        task_id: input.task_id,
        action_type: input.action_type,
        payload: input.payload,
        source: input.source,
        confidence: input.confidence,
        rationale: input.rationale,
        status: "pending",
      })
      .select("id")
      .single();
    if (error) {
      console.warn(`[proposals] createProposal failed: ${error.message}`);
      return null;
    }
    return { id: (data as { id: string }).id };
  } catch (err) {
    console.warn(`[proposals] createProposal threw: ${err}`);
    return null;
  }
}

export async function listProposals(status: ProposalStatus = "pending"): Promise<{
  rows: ProposalRow[];
  available: boolean;
}> {
  try {
    const { data, error } = await db()
      .from("task_proposals")
      .select(SELECT_COLS)
      .eq("status", status)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) {
        return { rows: [], available: false };
      }
      throw new Error(error.message);
    }
    return { rows: (data ?? []) as ProposalRow[], available: true };
  } catch (err) {
    if (err instanceof Error && /does not exist/i.test(err.message)) {
      return { rows: [], available: false };
    }
    throw err;
  }
}

export async function getProposal(id: string): Promise<ProposalRow | null> {
  const { data, error } = await db()
    .from("task_proposals")
    .select(SELECT_COLS)
    .eq("id", id)
    .single();
  if (error) return null;
  return data as ProposalRow;
}

export async function decideProposal(
  id: string,
  decision: "approved" | "rejected",
  decidedBy: string,
): Promise<void> {
  const { error } = await db()
    .from("task_proposals")
    .update({
      status: decision,
      decided_at: new Date().toISOString(),
      decided_by: decidedBy,
    })
    .eq("id", id)
    .eq("status", "pending");
  if (error) throw new Error(`decideProposal failed: ${error.message}`);
}
