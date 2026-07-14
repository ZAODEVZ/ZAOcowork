import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";

export const runtime = "nodejs";

interface Commit {
  message: string;
  author: string;
  date: string;
  html_url: string;
}

interface RepoTerminal {
  label: string;
  org: string;
  name: string;
  html_url: string;
  description: string | null;
  status: "active" | "recent" | "stale";
  pushed_at: string | null;
  daysSincePush: number | null;
  open_issues_count: number;
  commits: Array<{
    message: string;
    author: string;
    date: string;
    html_url: string;
    relativeTime: string;
  }>;
}

// 7 repos per the task
const TERMINAL_REPOS = [
  { org: "bettercallzaal", name: "finance-hq", label: "finance" },
  { org: "bettercallzaal", name: "zaotravelz", label: "devcon" },
  { org: "ZAODEVZ", name: "Zuke", label: "zuke" },
  { org: "bettercallzaal", name: "ZAOpaperzBOT", label: "zaopapersbot" },
  { org: "bettercallzaal", name: "zol", label: "zolbot" },
  { org: "bettercallzaal", name: "zaoonparagraph", label: "paragraph" },
  { org: "ZAODEVZ", name: "ZAOartizen", label: "ZAOartizen" },
];

let cachedData: {
  terminals: RepoTerminal[];
  timestamp: number;
} | null = null;

const CACHE_TTL = 600000; // 10 minutes in milliseconds

function computeStatus(
  pushed_at: string | null
): "active" | "recent" | "stale" {
  if (!pushed_at) return "stale";
  const daysSincePush =
    (Date.now() - new Date(pushed_at).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSincePush <= 14) return "active";
  if (daysSincePush <= 60) return "recent";
  return "stale";
}

function getDaysSincePush(pushed_at: string | null): number | null {
  if (!pushed_at) return null;
  return Math.floor(
    (Date.now() - new Date(pushed_at).getTime()) / (1000 * 60 * 60 * 24)
  );
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

async function fetchRepo(
  org: string,
  name: string,
  token?: string
): Promise<{
  html_url: string;
  description: string | null;
  pushed_at: string | null;
  open_issues_count: number;
} | null> {
  const url = `https://api.github.com/repos/${org}/${name}`;
  const headers: HeadersInit = {
    Accept: "application/vnd.github+json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.error(`Failed to fetch repo ${org}/${name}:`, res.status);
      return null;
    }
    const data = await res.json();
    return {
      html_url: data.html_url,
      description: data.description,
      pushed_at: data.pushed_at,
      open_issues_count: data.open_issues_count,
    };
  } catch (err) {
    console.error(`Error fetching repo ${org}/${name}:`, err);
    return null;
  }
}

async function fetchCommits(
  org: string,
  name: string,
  token?: string
): Promise<Commit[]> {
  const url = `https://api.github.com/repos/${org}/${name}/commits?per_page=8`;
  const headers: HeadersInit = {
    Accept: "application/vnd.github+json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.error(`Failed to fetch commits for ${org}/${name}:`, res.status);
      return [];
    }
    const data = await res.json();
    return data.map((c: { commit: any; html_url: string }) => ({
      message: c.commit.message.split("\n")[0], // First line only
      author: c.commit.author?.name || "Unknown",
      date: c.commit.author?.date || new Date().toISOString(),
      html_url: c.html_url,
    }));
  } catch (err) {
    console.error(`Error fetching commits for ${org}/${name}:`, err);
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
      terminals: cachedData.terminals,
      cached: true,
    });
  }

  const token = process.env.GITHUB_TOKEN;

  try {
    // Fetch all repos in parallel
    const terminals = await Promise.all(
      TERMINAL_REPOS.map(async (repo) => {
        const repoData = await fetchRepo(repo.org, repo.name, token);
        const commits = await fetchCommits(repo.org, repo.name, token);

        const pushed_at = repoData?.pushed_at ?? null;
        const status = computeStatus(pushed_at);
        const daysSincePush = getDaysSincePush(pushed_at);

        return {
          label: repo.label,
          org: repo.org,
          name: repo.name,
          html_url: repoData?.html_url ?? `https://github.com/${repo.org}/${repo.name}`,
          description: repoData?.description ?? null,
          status,
          pushed_at,
          daysSincePush,
          open_issues_count: repoData?.open_issues_count ?? 0,
          commits: commits.map((c) => ({
            message: c.message,
            author: c.author,
            date: c.date,
            html_url: c.html_url,
            relativeTime: formatRelativeTime(c.date),
          })),
        };
      })
    );

    // Cache the result
    cachedData = {
      terminals,
      timestamp: Date.now(),
    };

    return NextResponse.json({
      ok: true,
      terminals,
      cached: false,
      total: terminals.length,
      note: token
        ? "Using authenticated GitHub API (higher rate limit)"
        : "Using unauthenticated GitHub API (set GITHUB_TOKEN for higher limit)",
    });
  } catch (err) {
    console.error("Error fetching terminals:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch terminal data" },
      { status: 500 }
    );
  }
}
