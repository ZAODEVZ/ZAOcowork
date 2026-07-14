"use client";

import { useEffect, useState } from "react";
import { Card, SectionHeader, Badge, CardSkeleton } from "./ui";

interface Commit {
  message: string;
  author: string;
  date: string;
  html_url: string;
  relativeTime: string;
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
  commits: Commit[];
}

interface TerminalsData {
  ok: boolean;
  terminals: RepoTerminal[];
  cached?: boolean;
}

interface AskState {
  [repo: string]: {
    question: string;
    loading: boolean;
    answer: string | null;
    error: string | null;
    needsKey?: boolean;
  };
}

interface ExpandState {
  [repo: string]: boolean;
}

export function TerminalsWidget() {
  const [data, setData] = useState<TerminalsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandState, setExpandState] = useState<ExpandState>({});
  const [askState, setAskState] = useState<AskState>({});

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch("/api/terminals");
        if (!response.ok) throw new Error("Failed to fetch");
        const json = await response.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleToggleHistory = (repo: string) => {
    setExpandState((prev) => ({
      ...prev,
      [repo]: !prev[repo],
    }));
  };

  const handleAskChange = (repo: string, value: string) => {
    setAskState((prev) => ({
      ...prev,
      [repo]: {
        ...prev[repo],
        question: value,
        error: null,
      },
    }));
  };

  const handleAsk = async (repo: string, terminal: RepoTerminal) => {
    const state = askState[repo];
    if (!state?.question?.trim()) return;

    setAskState((prev) => ({
      ...prev,
      [repo]: {
        ...prev[repo],
        loading: true,
        error: null,
        answer: null,
      },
    }));

    try {
      const response = await fetch("/api/repo-ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: `${terminal.org}/${terminal.name}`,
          question: state.question,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        setAskState((prev) => ({
          ...prev,
          [repo]: {
            ...prev[repo],
            loading: false,
            error: result.note || result.error || "Failed to get answer",
            answer: null,
            needsKey: result.needsKey || false,
          },
        }));
      } else {
        setAskState((prev) => ({
          ...prev,
          [repo]: {
            ...prev[repo],
            loading: false,
            answer: result.answer,
            question: "",
          },
        }));
      }
    } catch (err) {
      setAskState((prev) => ({
        ...prev,
        [repo]: {
          ...prev[repo],
          loading: false,
          error: err instanceof Error ? err.message : "Unknown error",
        },
      }));
    }
  };

  if (loading) {
    return <CardSkeleton />;
  }

  if (error || !data?.ok) {
    return (
      <Card className="p-6 border-red-500/40 bg-red-900/20">
        <div className="text-sm text-red-200">{error || "Failed to load terminals"}</div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <SectionHeader label="Terminals" accent="amber">
        {data.cached && <span className="text-white/40">Cached (10-min TTL)</span>}
      </SectionHeader>

      <div className="space-y-3">
        {data.terminals.map((terminal) => {
          const repoKey = `${terminal.org}/${terminal.name}`;
          const isExpanded = expandState[repoKey];
          const state = askState[repoKey] || {
            question: "",
            loading: false,
            answer: null,
            error: null,
          };

          return (
            <div
              key={repoKey}
              className="rounded-lg border border-slate-700/50 bg-slate-900/30 p-4 hover:border-slate-600 transition-colors"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <a
                    href={terminal.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-white hover:text-amber-300 transition-colors truncate"
                  >
                    {terminal.label}
                  </a>
                  <span
                    className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                      terminal.status === "active"
                        ? "bg-green-500"
                        : terminal.status === "recent"
                          ? "bg-yellow-500"
                          : "bg-red-500"
                    }`}
                  />
                </div>
              </div>

              {/* Meta line */}
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-white/60">
                    {terminal.daysSincePush !== null
                      ? `push ${terminal.daysSincePush}d ago`
                      : "no pushes"}
                  </span>
                  {terminal.open_issues_count > 0 && (
                    <Badge status="at-risk" label={`${terminal.open_issues_count} issue${terminal.open_issues_count !== 1 ? "s" : ""}`} />
                  )}
                </div>
                <button
                  onClick={() => handleToggleHistory(repoKey)}
                  className="text-xs text-amber-400 hover:text-amber-300 transition-colors px-2 py-1 rounded hover:bg-amber-500/10"
                >
                  {isExpanded ? "Hide" : "Show"} history
                </button>
              </div>

              {/* Description */}
              {terminal.description && (
                <p className="text-xs text-white/60 mb-3 line-clamp-1">
                  {terminal.description}
                </p>
              )}

              {/* History - Collapsible */}
              {isExpanded && terminal.commits.length > 0 && (
                <div className="mb-3 p-3 bg-slate-800/50 rounded border border-slate-700/30">
                  <h4 className="text-xs font-semibold text-white/70 mb-2 uppercase">
                    Recent commits
                  </h4>
                  <ul className="space-y-1">
                    {terminal.commits.map((commit, idx) => (
                      <li key={idx} className="text-xs">
                        <a
                          href={commit.html_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-amber-300 hover:text-amber-200 transition-colors"
                        >
                          {commit.message}
                        </a>
                        <span className="text-white/40 ml-2">{commit.relativeTime}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Ask Box */}
              <div className="flex flex-col gap-2">
                {state.needsKey ? (
                  <div className="text-xs text-white/50 bg-slate-700/20 rounded px-2 py-2 border border-slate-600/30 italic">
                    Ask (set ANTHROPIC_API_KEY to enable)
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Ask about this repo..."
                      value={state.question}
                      onChange={(e) => handleAskChange(repoKey, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !state.loading) {
                          handleAsk(repoKey, terminal);
                        }
                      }}
                      className="flex-1 rounded bg-slate-800 border border-slate-600 px-2 py-1.5 text-xs text-white placeholder-white/40 focus:outline-none focus:border-amber-500/50 transition-colors"
                    />
                    <button
                      onClick={() => handleAsk(repoKey, terminal)}
                      disabled={state.loading || !state.question.trim()}
                      className="px-3 py-1.5 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-xs font-semibold text-amber-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {state.loading ? "..." : "Ask"}
                    </button>
                  </div>
                )}

                {state.error && !state.needsKey && (
                  <div className="text-xs text-red-300 bg-red-500/10 rounded px-2 py-1.5 border border-red-500/20">
                    {state.error}
                  </div>
                )}

                {state.answer && (
                  <div className="text-xs text-white/80 bg-green-500/10 rounded px-2 py-2 border border-green-500/20 leading-relaxed">
                    {state.answer}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
