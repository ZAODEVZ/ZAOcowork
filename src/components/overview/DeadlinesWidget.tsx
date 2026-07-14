import { Card, SectionHeader, Badge } from "./ui";

const STATIC_DEADLINES = [
  { date: "2026-07-15", label: "Token2049 vs ADE decision", project: "zaotravelz" },
  { date: "2026-07-16", label: "ZAOartizen Season 7 artifacts", project: "Daybreak Drive #7" },
  { date: "2026-08-31", label: "ZABAL Games finals", project: "ZABAL Games" },
  { date: "2026-10-03", label: "ZAOstock Festival", project: "ZAOstock" },
  { date: "2026-11-02", label: "Devcon 8 Mumbai opens (Nov 2-6)", project: "festivals proof-leg" },
];

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function daysUntil(iso: string): number {
  const d = new Date(iso + "T00:00:00Z");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = d.getTime() - now.getTime();
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

function isOverdue(iso: string): boolean {
  return daysUntil(iso) < 0;
}

function isUrgent(iso: string): boolean {
  const days = daysUntil(iso);
  return days >= 0 && days <= 7;
}

export function DeadlinesWidget() {
  const sorted = [...STATIC_DEADLINES].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  return (
    <Card className="p-6 flex flex-col">
      <SectionHeader label="Deadlines" accent="red" />

      <div className="space-y-2 flex-1 mb-4">
        {sorted.slice(0, 5).map((deadline) => {
          const days = daysUntil(deadline.date);
          const overdue = isOverdue(deadline.date);
          const urgent = isUrgent(deadline.date);

          let badgeStatus: "blocked" | "at-risk" | "done" = "done";
          if (overdue) badgeStatus = "blocked";
          else if (urgent) badgeStatus = "at-risk";

          return (
            <div
              key={deadline.date}
              className={`rounded-lg border p-3 ${
                overdue
                  ? "bg-red-500/10 border-red-500/30"
                  : urgent
                    ? "bg-amber-500/10 border-amber-500/30"
                    : "bg-slate-700/20 border-slate-600/30"
              }`}
            >
              <div className="flex items-start justify-between mb-1">
                <div className="flex-1">
                  <div className="font-semibold text-sm text-white/90">{deadline.label}</div>
                  <div className="text-xs text-white/50 mt-0.5">{deadline.project}</div>
                </div>
                <div className="ml-2 flex-shrink-0 text-xs font-semibold whitespace-nowrap">
                  {overdue ? (
                    <Badge status="blocked" label="OVERDUE" />
                  ) : urgent ? (
                    <Badge status="at-risk" label={`${days}d`} />
                  ) : (
                    <span className="text-white/60">{days}d</span>
                  )}
                </div>
              </div>
              <div className="text-xs text-white/40">{formatDate(deadline.date)}</div>
            </div>
          );
        })}
      </div>

      <div className="text-xs text-white/40">Edit constant to update</div>
    </Card>
  );
}
