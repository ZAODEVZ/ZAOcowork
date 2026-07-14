"use client";

import { useEffect, useState } from "react";
import { Card, Badge } from "./ui";

interface AttentionItem {
  type: "blocked" | "deadline";
  title: string;
  daysRemaining?: number;
  owner?: string;
  urgency: "critical" | "high" | "medium";
}

interface TaskStatusData {
  blockedItems: Array<{ id: string; title: string; owner: string; blockedSinceDays?: number }>;
}

const STATIC_DEADLINES = [
  { date: "2026-07-15", label: "Token2049 vs ADE decision" },
  { date: "2026-07-16", label: "ZAOartizen Season 7 artifacts" },
  { date: "2026-08-31", label: "ZABAL Games finals" },
  { date: "2026-10-03", label: "ZAOstock Festival" },
  { date: "2026-11-02", label: "Devcon 8 Mumbai opens" },
];

function daysUntil(iso: string): number {
  const d = new Date(iso + "T00:00:00Z");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = d.getTime() - now.getTime();
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

function getUrgency(days: number): "critical" | "high" | "medium" {
  if (days < 0) return "critical";
  if (days <= 3) return "critical";
  if (days <= 7) return "high";
  return "medium";
}

export function AttentionStrip() {
  const [data, setData] = useState<TaskStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<AttentionItem[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch("/api/overview");
        if (response.ok) {
          const json = await response.json();
          setData(json.data);
        }
      } catch {
        // Silent fail, use deadline data only
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Build attention items whenever data changes
  useEffect(() => {
    const attentionItems: AttentionItem[] = [];

    // Add stuck (blocked 3+ days) items
    if (data?.blockedItems) {
      const stuckItems = data.blockedItems.filter((b) => (b.blockedSinceDays ?? 0) >= 3);
      if (stuckItems.length > 0) {
        attentionItems.push({
          type: "blocked",
          title: `${stuckItems.length} stuck (blocked 3+ days)`,
          owner: stuckItems[0].owner,
          urgency: "critical",
        });
      }
    }

    // Add all other blocked items
    if (data?.blockedItems) {
      const otherBlocked = data.blockedItems.filter((b) => (b.blockedSinceDays ?? 0) < 3);
      if (otherBlocked.length > 0) {
        attentionItems.push({
          type: "blocked",
          title: `${otherBlocked.length} blocked task${otherBlocked.length !== 1 ? "s" : ""}`,
          owner: otherBlocked[0].owner,
          urgency: "high",
        });
      }
    }

    // Add nearest 2 deadlines
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const upcomingDeadlines = STATIC_DEADLINES
      .filter((d) => daysUntil(d.date) >= 0)
      .sort((a, b) => daysUntil(a.date) - daysUntil(b.date))
      .slice(0, 2)
      .map((d) => ({
        type: "deadline" as const,
        title: d.label,
        daysRemaining: daysUntil(d.date),
        urgency: getUrgency(daysUntil(d.date)),
      }));

    attentionItems.push(...upcomingDeadlines);

    setItems(attentionItems);
  }, [data]);

  if (loading || items.length === 0) {
    return null;
  }

  return (
    <Card className="mb-6 border-red-500/40 bg-gradient-to-r from-red-900/30 to-orange-900/20 p-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-48">
          <p className="text-xs font-semibold uppercase tracking-wider text-red-200 mb-2">
            Attention Required
          </p>
          <div className="flex flex-wrap gap-2">
            {items.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 text-xs bg-slate-900/50 border border-slate-700/50 rounded px-3 py-1.5"
              >
                <div className="flex-1">
                  <span className="text-white/90 font-medium">{item.title}</span>
                  {item.daysRemaining !== undefined && item.daysRemaining >= 0 && (
                    <span className="ml-2 text-white/60">
                      ({item.daysRemaining}d)
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          {items.map((item, idx) => {
            const colors = {
              critical: "bg-red-500",
              high: "bg-orange-500",
              medium: "bg-yellow-500",
            };
            return (
              <div
                key={idx}
                className={`w-3 h-3 rounded-full ${colors[item.urgency]}`}
              />
            );
          })}
        </div>
      </div>
    </Card>
  );
}
