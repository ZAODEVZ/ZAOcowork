import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";

export const runtime = "nodejs";

interface RepoData {
  name: string;
  html_url: string;
  description: string | null;
  pushed_at: string | null;
  open_issues_count: number;
  language: string | null;
  archived: boolean;
  visibility: string;
}

interface RepoWithStatus extends RepoData {
  status: "active" | "recent" | "stale" | "archived";
  suggestion: string;
}

const CURATED_SUGGESTIONS: Record<string, string> = {
  ZAOOS: "The lab / monorepo. Graduate mature pieces to their own repos.",
  zaoonparagraph:
    "Publish the 5 ready drafts (Days 190-194); 78 paid supporters waiting.",
  ZAOpaperzBOT:
    "Wire RAG into /zao (GEO surface). Issue #2.",
  zaotravelz:
    "Festivals campaign HQ. Unblock: AttaBotty photos + 7 outreach msgs.",
  zol: "Merge PRs #1+#2, deploy to Pi.",
  ZAOartizen: "Refresh Season 7 artifacts before Jul 16 (Daybreak Drive #7).",
  Zuke: "Finish audio backend (HMS stubs / X-Space import).",
  "finance-hq": "Populate the tracker (private).",
  zlank: "No-code Snap builder. 16 open issues - triage.",
  zpoidh: "POIDH bounty ops. 10 open issues - triage.",
  zabalnewsletterbuilder: "Live daily-3 builder. Maintain.",
  "hermes-orchestrator": "Agent supervisor framework. Reference for ZOE.",
  zaalcaster: "Zaal's Farcaster CLI. Active.",
  wwbase: "WaveWarZ public brief - the revenue product. Protect.",
  fractalbotapril2026: "Current live Fractal python bot.",
  fractalbotjuly2026: "TS rebuild of the Fractal bot (incomplete).",
};

let cachedData: {
  repos: RepoWithStatus[];
  timestamp: number;
} | null = null;

const CACHE_TTL = 3600000; // 1 hour in milliseconds

function computeStatus(
  repo: RepoData
): "active" | "recent" | "stale" | "archived" {
  if (repo.archived) return "archived";
  if (!repo.pushed_at) return "stale";

  const daysSincePush =
    (Date.now() - new Date(repo.pushed_at).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSincePush <= 14) return "active";
  if (daysSincePush <= 60) return "recent";
  return "stale";
}

function computeSuggestion(repo: RepoWithStatus): string {
  // Check curated overrides first
  if (CURATED_SUGGESTIONS[repo.name]) {
    return CURATED_SUGGESTIONS[repo.name];
  }

  // Heuristic suggestions
  if (repo.archived) return "archived - ignore or delete";
  if (repo.status === "stale" && repo.open_issues_count === 0)
    return "revisit or archive";
  if (repo.open_issues_count > 0)
    return `triage ${repo.open_issues_count} open issue${repo.open_issues_count === 1 ? "" : "s"}`;
  if (!repo.description) return "add description + README";
  return "in progress";
}

async function fetchOrgRepos(org: string, token?: string): Promise<RepoData[]> {
  const url = `https://api.github.com/users/${org}/repos?per_page=100&sort=pushed`;
  const headers: HeadersInit = {
    Accept: "application/vnd.github+json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.error(`Failed to fetch repos for ${org}:`, res.status);
      return [];
    }
    return await res.json();
  } catch (err) {
    console.error(`Error fetching repos for ${org}:`, err);
    return [];
  }
}

export async function GET() {
  try {
    await requireSession();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  // Check cache
  if (cachedData && Date.now() - cachedData.timestamp < CACHE_TTL) {
    return NextResponse.json({
      ok: true,
      repos: cachedData.repos,
      cached: true,
    });
  }

  const token = process.env.GITHUB_TOKEN;

  try {
    // Fetch repos from both orgs in parallel
    const [bczRepos, zaodevzRepos] = await Promise.all([
      fetchOrgRepos("bettercallzaal", token),
      fetchOrgRepos("ZAODEVZ", token),
    ]);

    // Combine and deduplicate (prefer ZAODEVZ if same repo name exists in both)
    const repoMap = new Map<string, RepoData>();
    bczRepos.forEach((r) => repoMap.set(r.name, r));
    zaodevzRepos.forEach((r) => repoMap.set(r.name, r));

    // Compute status and suggestions
    const repos: RepoWithStatus[] = Array.from(repoMap.values())
      .map((repo) => {
        const status = computeStatus(repo);
        return {
          ...repo,
          status,
          suggestion: "",
        };
      })
      .map((repo) => ({
        ...repo,
        suggestion: computeSuggestion(repo),
      }))
      .sort((a, b) => {
        // Sort by: status (active first), then by pushed_at (newest first)
        const statusOrder: Record<string, number> = {
          active: 0,
          recent: 1,
          stale: 2,
          archived: 3,
        };
        const aDiff = statusOrder[a.status] - statusOrder[b.status];
        if (aDiff !== 0) return aDiff;

        const aPushed = new Date(a.pushed_at || 0).getTime();
        const bPushed = new Date(b.pushed_at || 0).getTime();
        return bPushed - aPushed;
      });

    // Cache the result
    cachedData = {
      repos,
      timestamp: Date.now(),
    };

    return NextResponse.json({
      ok: true,
      repos,
      cached: false,
      total: repos.length,
      byStatus: {
        active: repos.filter((r) => r.status === "active").length,
        recent: repos.filter((r) => r.status === "recent").length,
        stale: repos.filter((r) => r.status === "stale").length,
        archived: repos.filter((r) => r.status === "archived").length,
      },
      note: token
        ? "Using authenticated GitHub API (higher rate limit)"
        : "Using unauthenticated GitHub API (60 req/hr limit - set GITHUB_TOKEN env var for higher limit)",
    });
  } catch (err) {
    console.error("Error fetching repos:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch repositories" },
      { status: 500 }
    );
  }
}
