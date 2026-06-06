// source-status.ts - Cached GitHub PR live-state resolver.
// Fetches PR state (open/closed/merged) from GitHub REST API and caches
// in task_source_cache with a 30-minute TTL. Gracefully handles all errors
// (missing env vars, network failures, DB errors) by returning "unknown" state
// and never throwing to the caller.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface SourceStatus {
  state: "open" | "closed" | "merged" | "unknown";
  title: string | null;
  url: string | null;
}

interface GithubPrResponse {
  state: string;
  merged_at: string | null;
  title: string;
  html_url: string;
}

interface CacheRow {
  ref_kind: string;
  ref_id: string;
  state: string;
  title: string | null;
  url: string | null;
  fetched_at: string;
}

let cachedClient: SupabaseClient | null = null;

function db(): SupabaseClient {
  if (cachedClient) return cachedClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY not configured");
  }
  cachedClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

function parseGithubState(
  prJson: unknown,
): "open" | "closed" | "merged" | null {
  if (!prJson || typeof prJson !== "object") return null;

  const pr = prJson as Record<string, unknown>;

  if (pr.merged_at && typeof pr.merged_at === "string") {
    return "merged";
  }

  if (pr.state === "closed") {
    return "closed";
  }

  if (pr.state === "open") {
    return "open";
  }

  return null;
}

async function readCachedStatus(prId: string): Promise<SourceStatus | null> {
  try {
    const client = db();
    const { data, error } = await client
      .from("task_source_cache")
      .select("state, title, url, fetched_at")
      .eq("ref_kind", "pr")
      .eq("ref_id", prId)
      .single();

    if (error || !data) return null;

    const row = data as unknown as CacheRow;
    const fetchedTime = new Date(row.fetched_at).getTime();
    const now = Date.now();
    const age = now - fetchedTime;

    if (age < TTL_MS) {
      return {
        state: (row.state as "open" | "closed" | "merged" | "unknown") || "unknown",
        title: row.title || null,
        url: row.url || null,
      };
    }
  } catch {
    // Gracefully ignore cache read errors
  }

  return null;
}

async function fetchGithubStatus(
  prNumber: string,
): Promise<SourceStatus | null> {
  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    return null; // Token not configured, cannot fetch
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/bettercallzaal/ZAOOS/pulls/${prNumber}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
        },
      },
    );

    if (!response.ok) {
      return null; // GitHub API error
    }

    const prJson = (await response.json()) as unknown;
    const state = parseGithubState(prJson);

    if (!state) return null;

    const pr = prJson as Record<string, unknown>;
    const title = typeof pr.title === "string" ? pr.title : null;
    const url = typeof pr.html_url === "string" ? pr.html_url : null;

    return { state, title, url };
  } catch {
    // Network or parsing error
    return null;
  }
}

async function upsertCache(
  prId: string,
  status: SourceStatus,
): Promise<void> {
  try {
    const client = db();
    await client.from("task_source_cache").upsert(
      {
        ref_kind: "pr",
        ref_id: prId,
        state: status.state,
        title: status.title,
        url: status.url,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "ref_kind,ref_id" },
    );
  } catch {
    // Gracefully ignore cache write errors
  }
}

export async function getPrStatuses(
  prNumbers: string[],
): Promise<Record<string, SourceStatus>> {
  // Dedupe input
  const unique = Array.from(new Set(prNumbers.filter((n) => n.trim())));

  if (unique.length === 0) {
    return {};
  }

  const result: Record<string, SourceStatus> = {};

  for (const prId of unique) {
    let status = await readCachedStatus(prId);

    if (!status) {
      // Not in cache or stale; try to fetch from GitHub
      const freshStatus = await fetchGithubStatus(prId);
      status = freshStatus || { state: "unknown", title: null, url: null };

      // Attempt to cache the result (best-effort)
      if (freshStatus) {
        await upsertCache(prId, freshStatus);
      }
    }

    result[prId] = status;
  }

  return result;
}
