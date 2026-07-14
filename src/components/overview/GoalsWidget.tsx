"use client";

import { useEffect, useState } from "react";
import { Card, SectionHeader, Badge, ProgressBar } from "./ui";

type GoalStatus = "on-track" | "at-risk" | "not-started";

interface GoalProgress {
  key: string;
  matched: number;
  done: number;
  pct: number | null;
  tracked: boolean;
}

const ZAO_GOALS = {
  northStar: "Return profit, data, and IP to creators. An impact network, not a company. Contribution over capital.",
  lanes: [
    { name: "Music", project: "WaveWarZ" },
    { name: "Builders", project: "ZABAL Games + The Lab" },
    { name: "Events", project: "ZAO Festivals + ZAOstock" },
    { name: "Tools & Agents", project: "ZAO OS, ZOE, ZOL" },
  ],
  nearTermGoals: [
    { title: "GEO - own the AI answer for what is The ZAO (top priority)", key: "geo" },
    { title: "ZAOstock - Oct 3", key: "zaostock" },
    { title: "ZABAL Games - August finals", key: "zabal_games" },
    { title: "Artizen - Season 7 proof into Season 8", key: "artizen" },
    { title: "Devcon 8 Mumbai (Nov 2-6) - the festivals proof-leg", key: "devcon" },
    { title: "Protect the weekly Fractal (100+ unbroken weeks)", key: "fractal" },
    { title: "A second revenue line (WaveWarZ works - find one more)", key: "revenue" },
  ],
};

// Per-goal status mapping (manually set - edit as progress changes)
const GOAL_STATUS_MAP: Record<string, GoalStatus> = {
  "GEO - own the AI answer for what is The ZAO (top priority)": "on-track",
  "ZAOstock - Oct 3": "on-track",
  "ZABAL Games - August finals": "on-track",
  "Artizen - Season 7 proof into Season 8": "on-track",
  "Devcon 8 Mumbai (Nov 2-6) - the festivals proof-leg": "not-started",
  "Protect the weekly Fractal (100+ unbroken weeks)": "on-track",
  "A second revenue line (WaveWarZ works - find one more)": "at-risk",
};

function getProgressColor(status: GoalStatus): "green" | "amber" | "blue" {
  switch (status) {
    case "on-track":
      return "green";
    case "at-risk":
      return "amber";
    case "not-started":
      return "blue";
  }
}

export function GoalsWidget() {
  const [goalProgress, setGoalProgress] = useState<Record<string, GoalProgress> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchGoalProgress() {
      try {
        const response = await fetch("/api/overview");
        const result = await response.json();
        if (result.ok && result.data?.goalProgress) {
          const progressMap = Object.fromEntries(
            result.data.goalProgress.map((gp: GoalProgress) => [gp.key, gp])
          );
          setGoalProgress(progressMap);
        }
      } catch (error) {
        console.error("Failed to fetch goal progress:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchGoalProgress();
  }, []);
  return (
    <Card className="p-6">
      {/* North Star */}
      <div className="mb-8">
        <SectionHeader label="North Star" accent="amber" />
        <p className="text-sm text-white/85 leading-relaxed font-medium">
          {ZAO_GOALS.northStar}
        </p>
      </div>

      {/* 4 Lanes */}
      <div className="mb-8">
        <SectionHeader label="4 Lanes" accent="amber" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {ZAO_GOALS.lanes.map((lane) => (
            <div
              key={lane.name}
              className="rounded-lg bg-amber-500/10 border border-amber-500/20 hover:border-amber-500/40 transition-colors p-3"
            >
              <div className="text-xs uppercase tracking-wider text-amber-200/70">
                {lane.name}
              </div>
              <div className="text-sm font-semibold text-white mt-1">{lane.project}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Near-Term Goals with Progress Bars */}
      <div>
        <SectionHeader label="2026 Near-Term Goals" accent="amber" />
        <div className="space-y-3">
          {ZAO_GOALS.nearTermGoals.map((goal) => {
            const status = GOAL_STATUS_MAP[goal.title];
            const progress = goalProgress?.[goal.key];
            const colorMap = {
              "on-track": "green" as const,
              "at-risk": "amber" as const,
              "not-started": "blue" as const,
            };

            return (
              <div key={goal.title} className="space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm text-white/85 flex-1">{goal.title}</span>
                  <Badge status={status} />
                </div>
                {loading ? (
                  <div className="h-6 bg-slate-700/30 rounded animate-pulse" />
                ) : progress?.tracked ? (
                  <ProgressBar
                    label={`${progress.done}/${progress.matched}`}
                    value={progress.done}
                    max={progress.matched}
                    color={colorMap[status]}
                  />
                ) : (
                  <div className="text-xs text-white/40 italic">
                    No tasks tracked yet
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-4 space-y-1 text-xs text-white/40">
          <div>Bar shows tracked-task completion (done/total)</div>
          <div>Chip reflects manual status - update separately as priorities shift</div>
        </div>
      </div>
    </Card>
  );
}
