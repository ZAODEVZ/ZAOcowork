"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type RepoDecision = "keep" | "archive" | "pending";

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
  decision: RepoDecision;
  decisionNote: string | null;
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
  byDecision?: { keep: number; archive: number; pending: number };
  note?: string;
}

type StatusFilter = "all" | "active" | "recent" | "stale" | "archived";
type DecisionFilter = "all" | "keep" | "archive" | "pending";

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
  const diff = Date.now() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return "just now";
}

// GitHub settings page where a repo is archived (manual, gated action).
function archiveSettingsUrl(htmlUrl: string): string {
  return `${htmlUrl}/settings#danger-zone`;
}

export function ReposView() {
  const [repos, setRepos] = useState<RepoData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [decisionFilter, setDecisionFilter] = useState<DecisionFilter>("all");
  const [stats, setStats] = useState<Record<string, number>>({});
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

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

  const updateDecision = useCallback(
    async (name: string, decision: RepoDecision) => {
      // optimistic update
      setRepos((prev) =>
        prev.map((r) => (r.name === name ? { ...r, decision } : r)),
      );
      setSaving(name);
      try {
        const res = await fetch("/api/zao-repos/decision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repo_name: name, decision }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "save failed");
      } catch (err) {
        console.error("decision save failed", err);
        // revert on failure
        setRepos((prev) =>
          prev.map((r) =>
            r.name === name ? { ...r, decision: "pending" } : r,
          ),
        );
      } finally {
        setSaving(null);
      }
    },
    [],
  );

  const decisionCounts = useMemo(() => {
    return {
      keep: repos.filter((r) => r.decision === "keep").length,
      archive: repos.filter((r) => r.decision === "archive").length,
      pending: repos.filter((r) => r.decision === "pending").length,
    };
  }, [repos]);

  const filtered = useMemo(() => {
    return repos.filter((repo) => {
      const matchesSearch =
        repo.name.toLowerCase().includes(search.toLowerCase()) ||
        (repo.description?.toLowerCase() || "").includes(search.toLowerCase());
      const matchesStatus =
        statusFilter === "all" || repo.status === statusFilter;
      const matchesDecision =
        decisionFilter === "all" || repo.decision === decisionFilter;
      return matchesSearch && matchesStatus && matchesDecision;
    });
  }, [repos, search, statusFilter, decisionFilter]);

  const grouped = useMemo(() => {
    const groups: Record<string, RepoData[]> = {
      active: [],
      recent: [],
      stale: [],
      archived: [],
    };
    filtered.forEach((repo) => groups[repo.status].push(repo));
    return groups;
  }, [filtered]);

  const archiveQueue = useMemo(
    () => repos.filter((r) => r.decision === "archive" && !r.archived),
    [repos],
  );

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
      {note && (
        <div className="rounded-lg bg-blue-500/10 border border-blue-500/30 p-3 text-xs text-blue-200">
          {note}
        </div>
      )}

      {/* Status stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Total" value={repos.length} onClick={() => setStatusFilter("all")} active={statusFilter === "all"} />
        <Stat label="Active" value={stats.active || 0} onClick={() => setStatusFilter("active")} active={statusFilter === "active"} tone="emerald" />
        <Stat label="Recent" value={stats.recent || 0} onClick={() => setStatusFilter("recent")} active={statusFilter === "recent"} tone="blue" />
        <Stat label="Stale" value={stats.stale || 0} onClick={() => setStatusFilter("stale")} active={statusFilter === "stale"} tone="amber" />
      </div>

      {/* Decision triage bar */}
      <div className="rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/10 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Keep / archive triage</h3>
          <span className="text-[11px] text-white/40">decisions persist here</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <DecisionChip label="All" value={repos.length} active={decisionFilter === "all"} onClick={() => setDecisionFilter("all")} tone="slate" />
          <DecisionChip label="Keep" value={decisionCounts.keep} active={decisionFilter === "keep"} onClick={() => setDecisionFilter("keep")} tone="emerald" />
          <DecisionChip label="Archive" value={decisionCounts.archive} active={decisionFilter === "archive"} onClick={() => setDecisionFilter("archive")} tone="rose" />
          <DecisionChip label="Undecided" value={decisionCounts.pending} active={decisionFilter === "pending"} onClick={() => setDecisionFilter("pending")} tone="amber" />
        </div>
        {archiveQueue.length > 0 && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3">
            <p className="text-xs text-rose-100 mb-2">
              {archiveQueue.length} repo{archiveQueue.length === 1 ? "" : "s"} marked archive but still live on GitHub.
              Archiving is manual - open each repo&apos;s Danger Zone to confirm.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {archiveQueue.slice(0, 50).map((r) => (
                <a
                  key={r.name}
                  href={archiveSettingsUrl(r.html_url)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] px-2 py-1 rounded border border-rose-400/40 text-rose-100 hover:bg-rose-500/20 transition"
                >
                  {r.name} ↗
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Search */}
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
            <div key={status} className="rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/10 p-4 md:p-5">
              <div className="mb-4 flex items-center gap-2">
                <span className={`inline-block px-2 py-0.5 rounded-lg text-[10px] font-semibold border ${STATUS_COLORS[status]}`}>
                  {STATUS_LABELS[status]}
                </span>
                <span className="text-xs text-white/50">{statusRepos.length}</span>
              </div>
              <div className="space-y-2">
                {statusRepos.map((repo) => (
                  <RepoCard
                    key={repo.name}
                    repo={repo}
                    saving={saving === repo.name}
                    onDecision={updateDecision}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/10 p-8 text-center">
          <p className="text-white/50">No repositories match your filters.</p>
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
        active ? `${toneClass} bg-white/10 border-white/20` : "border-white/10 hover:bg-white/[0.06] " + toneClass
      }`}
    >
      <div className="text-xs text-white/50">{label}</div>
      <div className="mt-0.5 text-xl font-bold text-white">{value}</div>
    </button>
  );
}

function DecisionChip({
  label,
  value,
  active,
  onClick,
  tone,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
  tone: "slate" | "emerald" | "rose" | "amber";
}) {
  const tones: Record<string, string> = {
    slate: "border-slate-400/40 text-slate-100",
    emerald: "border-emerald-400/40 text-emerald-100",
    rose: "border-rose-400/40 text-rose-100",
    amber: "border-amber-400/40 text-amber-100",
  };
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-center transition ${tones[tone]} ${
        active ? "bg-white/10" : "bg-black/20 hover:bg-white/[0.06]"
      }`}
    >
      <div className="text-[11px] opacity-70">{label}</div>
      <div className="mt-0.5 text-lg font-bold">{value}</div>
    </button>
  );
}

function RepoCard({
  repo,
  saving,
  onDecision,
}: {
  repo: RepoData;
  saving: boolean;
  onDecision: (name: string, decision: RepoDecision) => void;
}) {
  const lastPush = relativeTime(repo.pushed_at);
  const note = repo.decisionNote || repo.suggestion;

  const decisionBadge =
    repo.decision === "keep"
      ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-100"
      : repo.decision === "archive"
        ? "bg-rose-500/20 border-rose-500/40 text-rose-100"
        : "bg-white/5 border-white/15 text-white/50";

  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <a
              href={repo.html_url}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-semibold text-white hover:text-blue-300 transition truncate"
            >
              {repo.name} ↗
            </a>
            <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-semibold border flex-shrink-0 ${STATUS_COLORS[repo.status]}`}>
              {STATUS_LABELS[repo.status]}
            </span>
            <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-semibold border flex-shrink-0 ${decisionBadge}`}>
              {repo.decision === "pending" ? "UNDECIDED" : repo.decision.toUpperCase()}
            </span>
          </div>

          {repo.description && (
            <p className="text-xs text-white/60 mb-2 line-clamp-2">{repo.description}</p>
          )}

          <div className="flex flex-wrap items-center gap-3 text-[11px] text-white/40">
            <span>pushed {lastPush}</span>
            {repo.language && (<><span>·</span><span>{repo.language}</span></>)}
            {repo.open_issues_count > 0 && (
              <><span>·</span><span className="text-amber-300">{repo.open_issues_count} open issue{repo.open_issues_count === 1 ? "" : "s"}</span></>
            )}
            {repo.visibility === "private" && (<><span>·</span><span className="text-white/50">private</span></>)}
          </div>

          {note && (
            <div className="mt-3 pt-2.5 border-t border-white/5">
              <p className="text-xs text-white/65">{note}</p>
            </div>
          )}
        </div>
      </div>

      {/* Decision controls */}
      <div className="mt-3 flex items-center gap-1.5">
        <DecisionBtn label="Keep" active={repo.decision === "keep"} disabled={saving} tone="emerald" onClick={() => onDecision(repo.name, "keep")} />
        <DecisionBtn label="Archive" active={repo.decision === "archive"} disabled={saving} tone="rose" onClick={() => onDecision(repo.name, "archive")} />
        {repo.decision !== "pending" && (
          <DecisionBtn label="Clear" active={false} disabled={saving} tone="slate" onClick={() => onDecision(repo.name, "pending")} />
        )}
        {repo.decision === "archive" && !repo.archived && (
          <a
            href={archiveSettingsUrl(repo.html_url)}
            target="_blank"
            rel="noreferrer"
            className="ml-auto text-[11px] px-2 py-1 rounded border border-rose-400/40 text-rose-100 hover:bg-rose-500/20 transition"
          >
            Archive on GitHub ↗
          </a>
        )}
        {saving && <span className="ml-auto text-[11px] text-white/40">saving...</span>}
      </div>
    </div>
  );
}

function DecisionBtn({
  label,
  active,
  disabled,
  tone,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  tone: "emerald" | "rose" | "slate";
  onClick: () => void;
}) {
  const tones: Record<string, string> = {
    emerald: active ? "bg-emerald-500/30 border-emerald-400/60 text-emerald-50" : "border-emerald-400/30 text-emerald-200 hover:bg-emerald-500/15",
    rose: active ? "bg-rose-500/30 border-rose-400/60 text-rose-50" : "border-rose-400/30 text-rose-200 hover:bg-rose-500/15",
    slate: "border-white/20 text-white/50 hover:bg-white/10",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`text-[11px] px-2.5 py-1 rounded border transition disabled:opacity-40 ${tones[tone]}`}
    >
      {label}
    </button>
  );
}
