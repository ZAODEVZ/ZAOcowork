// Static seed deadlines (edit as needed)
// TODO: Make DB-editable

const STATIC_DEADLINES = [
  { date: "2026-07-15", label: "Token2049 vs ADE decision", project: "zaotravelz" },
  { date: "2026-07-16", label: "ZAOartizen Season 7 artifacts", project: "Daybreak Drive #7" },
  { date: "2026-10-03", label: "ZAOstock Festival", project: "ZAOstock" },
  { date: "2026-08-31", label: "ZABAL Games finals", project: "ZABAL Games" },
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
  const sorted = [...STATIC_DEADLINES].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <div className="rounded-2xl bg-gradient-to-br from-red-900/20 to-amber-900/20 border border-red-500/30 p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-red-200 mb-4">
        Deadlines
      </h2>

      <div className="space-y-3">
        {sorted.slice(0, 5).map((deadline) => {
          const days = daysUntil(deadline.date);
          const overdue = isOverdue(deadline.date);
          const urgent = isUrgent(deadline.date);

          return (
            <div
              key={deadline.date}
              className={`rounded-lg border p-2 text-xs ${
                overdue
                  ? "bg-red-500/10 border-red-500/30"
                  : urgent
                    ? "bg-amber-500/10 border-amber-500/30"
                    : "bg-red-500/5 border-red-500/20"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="font-semibold text-white/90">{deadline.label}</div>
                  <div className="text-white/60 mt-0.5">{deadline.project}</div>
                </div>
                <div
                  className={`ml-2 flex-shrink-0 rounded px-2 py-1 font-semibold whitespace-nowrap ${
                    overdue
                      ? "bg-red-500/20 text-red-200"
                      : urgent
                        ? "bg-amber-500/20 text-amber-200"
                        : "bg-red-500/10 text-red-200/80"
                  }`}
                >
                  {overdue ? "OVERDUE" : `${days}d`}
                </div>
              </div>
              <div className="text-white/40 mt-1">{formatDate(deadline.date)}</div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 text-xs text-white/40">
        Edit STATIC_DEADLINES constant to update
      </div>
    </div>
  );
}
