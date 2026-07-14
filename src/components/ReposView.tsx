"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

interface RepoData {
  name: string;
  html_url: string;
  description: string | null;
  pushed_at: string | null;
  open_issues_count: number;
  language: string | null;
  archived: boolean;
  visibility: string;
  status: "active" | "recent" | "stale" | "archived";
  suggestion: string;
}

interface ApiResponse {
  ok: boolean;
  repos?: RepoData[];
  byStatus?: {
    active: number;
    recent: number;
    stale: number;
    archived: number;
  };
  note?: string;
}

type StatusFilter = "all" | "active" | "recent" | "stale" | "archived";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500/20 border-emerald-500/40 text-emerald-100",
  recent: "bg-blue-500/20 border-blue-500/40 text-blue-100",
  stale: "bg-amber-500/20 border-amber-500/40 text-amber-100",
  archived: "bg-slate-500/20 border-slate-500/40 text-slate-100",
};

const STATUS_LABELS: Record<string, string> = {
  active: "ACTIVE",
  recent: "RECENT",
  stale: "STALE",
  archived: "ARCHIVED",
};

function relativeTime(isoDate: string | null): string {
  if (!isoDate) return "never";
  const date = new Date(isoDate);
  const now = Date.now();
  const diff = now - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return "just now";
}

export function ReposView() {
  const [repos, setRepos] = useState<RepoData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [stats, setStats] = useState<Record<string, number>>({});
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRepos() {
      try {
        const res = await fetch("/api/zao-repos");
        const data: ApiResponse = await res.json();

        if (data.ok && data.repos) {
          setRepos(data.repos);
          setStats(data.byStatus || {});
          setNote(data.note || null);
        } else {
          setError("Failed to fetch repositories");
        }
      } catch (err) {
        setError("Error fetching repositories");
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    fetchRepos();
  }, []);

  const filtered = useMemo(() => {
    return repos.filter((repo) => {
      const matchesSearch =
        repo.name.toLowerCase().includes(search.toLowerCase()) ||
        (repo.description?.toLowerCase() || "").includes(
          search.toLowerCase()
        );
      const matchesStatus =
        statusFilter === "all" || repo.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [repos, search, statusFilter]);

  const grouped = useMemo(() => {
    const groups: Record<string, RepoData[]> = {
      active: [],
      recent: [],
      stale: [],
      archived: [],
    };
    filtered.forEach((repo) => {
      groups[repo.status].push(repo);
    });
    return groups;
  }, [filtered]);

  if (loading) {
    return (
      <div className="rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/10 p-8 text-center">
        <p className="text-white/50">Loading repositories...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-red-500/10 border border-red-500/30 p-8 text-center">
        <p className="text-red-200">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Stats and note */}
      {note && (
        <div className="rounded-lg bg-blue-500/10 border border-blue-500/30 p-3 text-xs text-blue-200">
          {note}
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat
          label="Total"
          value={repos.length}
          onClick={() => setStatusFilter("all")}
          active={statusFilter === "all"}
        />
        <Stat
          label="Active"
          value={stats.active || 0}
          onClick={() => setStatusFilter("active")}
          active={statusFilter === "active"}
          tone="emerald"
        />
        <Stat
          label="Recent"
          value={stats.recent || 0}
          onClick={() => setStatusFilter("recent")}
          active={statusFilter === "recent"}
          tone="blue"
        />
        <Stat
          label="Stale"
          value={stats.stale || 0}
          onClick={() => setStatusFilter("stale")}
          active={statusFilter === "stale"}
          tone="amber"
        />
      </div>

      {/* Search and filter */}
      <div className="rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/10 p-4">
        <input
          type="text"
          placeholder="Search repos by name or description..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/40 outline-none focus:border-blue-400/50 focus:ring-1 focus:ring-blue-400/30"
        />
      </div>

      {/* Repos grouped by status */}
      <div className="space-y-5">
        {(["active", "recent", "stale", "archived"] as const).map((status) => {
          const statusRepos = grouped[status];
          if (statusRepos.length === 0) return null;

          return (
            <div
              key={status}
              className="rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/10 p-4 md:p-5"
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-lg text-[10px] font-semibold border ${STATUS_COLORS[status]}`}
                  >
                    {STATUS_LABELS[status]}
                  </span>
                  <span className="text-xs text-white/50">
                    {statusRepos.length}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                {statusRepos.map((repo) => (
                  <RepoCard key={repo.name} repo={repo} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/10 p-8 text-center">
          <p className="text-white/50">
            No repositories match your search.
          </p>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  onClick,
  active,
  tone = "blue",
}: {
  label: string;
  value: number;
  onClick: () => void;
  active: boolean;
  tone?: "blue" | "emerald" | "amber";
}) {
  const toneClass =
    tone === "emerald"
      ? "hover:border-emerald-400/40 hover:bg-emerald-500/10"
      : tone === "amber"
        ? "hover:border-amber-400/40 hover:bg-amber-500/10"
        : "hover:border-blue-400/40 hover:bg-blue-500/10";

  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-center transition ${
        active
          ? `${toneClass} bg-white/10 border-white/20`
          : "border-white/10 hover:bg-white/[0.06] " + toneClass
      }`}
    >
      <div className="text-xs text-white/50">{label}</div>
      <div className="mt-0.5 text-xl font-bold text-white">{value}</div>
    </button>
  );
}

function RepoCard({ repo }: { repo: RepoData }) {
  const lastPush = relativeTime(repo.pushed_at);

  return (
    <a
      href={repo.html_url}
      target="_blank"
      rel="noreferrer"
      className="block rounded-lg border border-white/10 bg-black/20 p-3.5 hover:border-blue-400/40 hover:bg-blue-500/5 transition group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <h3 className="text-sm font-semibold text-white group-hover:text-blue-300 transition truncate">
              {repo.name}
            </h3>
            <span
              className={`inline-block px-2 py-0.5 rounded text-[9px] font-semibold border flex-shrink-0 ${STATUS_COLORS[repo.status]}`}
            >
              {STATUS_LABELS[repo.status]}
            </span>
          </div>

          {repo.description && (
            <p className="text-xs text-white/60 mb-2 line-clamp-2">
              {repo.description}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 text-[11px] text-white/40">
            <span>pushed {lastPush}</span>
            {repo.language && (
              <>
                <span>·</span>
                <span>{repo.language}</span>
              </>
            )}
            {repo.open_issues_count > 0 && (
              <>
                <span>·</span>
                <span className="text-amber-300">
                  {repo.open_issues_count} open issue{repo.open_issues_count === 1 ? "" : "s"}
                </span>
              </>
            )}
            {repo.visibility === "private" && (
              <>
                <span>·</span>
                <span className="text-white/50">private</span>
              </>
            )}
          </div>

          <div className="mt-3 pt-2.5 border-t border-white/5">
            <p className="text-xs text-white/65">{repo.suggestion}</p>
          </div>
        </div>

        <span className="text-white/30 group-hover:text-blue-300 flex-shrink-0 transition">
          →
        </span>
      </div>
    </a>
  );
}
