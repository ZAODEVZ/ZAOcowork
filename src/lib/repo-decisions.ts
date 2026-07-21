// Persistent keep/archive decisions for the /repos estate view.
// Backed by the repo_decisions table (migration 022). Uses the same
// SUPABASE_URL / SUPABASE_SERVICE_KEY env the tasks store uses.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type RepoDecision = "keep" | "archive" | "pending";

export interface RepoDecisionRow {
  repo_name: string;
  decision: RepoDecision;
  note: string | null;
  decided_by: string | null;
  decided_at: string;
}

let cachedClient: SupabaseClient | null = null;

function db(): SupabaseClient {
  if (cachedClient) return cachedClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_KEY missing - cannot reach repo_decisions",
    );
  }
  cachedClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

// Best-effort: if the table does not exist yet (migration not applied),
// return an empty map so the /repos page still renders with no decisions.
export async function getDecisions(): Promise<Map<string, RepoDecisionRow>> {
  try {
    const { data, error } = await db()
      .from("repo_decisions")
      .select("repo_name, decision, note, decided_by, decided_at");
    if (error) {
      console.error("getDecisions error", error.message);
      return new Map();
    }
    const map = new Map<string, RepoDecisionRow>();
    (data ?? []).forEach((row) => map.set(row.repo_name, row as RepoDecisionRow));
    return map;
  } catch (err) {
    console.error("getDecisions threw", err);
    return new Map();
  }
}

export async function setDecision(
  repoName: string,
  decision: RepoDecision,
  note: string | null,
  decidedBy: string | null,
): Promise<RepoDecisionRow> {
  const now = new Date().toISOString();
  const { data, error } = await db()
    .from("repo_decisions")
    .upsert(
      {
        repo_name: repoName,
        decision,
        note,
        decided_by: decidedBy,
        updated_at: now,
      },
      { onConflict: "repo_name" },
    )
    .select("repo_name, decision, note, decided_by, decided_at")
    .single();
  if (error) throw new Error(`setDecision failed: ${error.message}`);
  return data as RepoDecisionRow;
}
