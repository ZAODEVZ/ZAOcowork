import Link from "next/link";
import type { BrandRollup } from "@/lib/data";
import { AT_RISK_DAYS, NO_BRAND } from "@/lib/data";

// Per-brand overview strip that sits above the board.
//
// The point is a three-second read of "where do I unblock first". A 309-row
// flat list cannot answer that; twelve cards can.
//
// Each card links to that brand's filtered board view, so the strip is a
// navigation surface, not just a readout.

function cardTone(r: BrandRollup): string {
  if (r.overdue > 0) return "border-red-500/30 bg-red-500/[0.06] hover:bg-red-500/[0.1]";
  if (r.atRisk > 0) return "border-amber-500/30 bg-amber-500/[0.06] hover:bg-amber-500/[0.1]";
  return "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]";
}

export function BrandRollupStrip({ rollup }: { rollup: BrandRollup[] }) {
  if (rollup.length === 0) return null;

  const totals = rollup.reduce(
    (a, r) => ({
      total: a.total + r.total,
      overdue: a.overdue + r.overdue,
      atRisk: a.atRisk + r.atRisk,
    }),
    { total: 0, overdue: 0, atRisk: 0 },
  );

  return (
    <section className="mb-4" aria-label="Brand overview">
      <div className="flex items-baseline justify-between mb-2 px-0.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
          By brand
        </h2>
        <p className="text-[11px] text-white/40">
          {totals.total} open
          {totals.atRisk > 0 && (
            <span className="text-amber-300/80"> · {totals.atRisk} at risk</span>
          )}
          {totals.overdue > 0 && (
            <span className="text-red-300/80"> · {totals.overdue} overdue</span>
          )}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
        {rollup.map((r) => {
          const needsBrand = r.brand === NO_BRAND;
          return (
            <Link
              key={r.brand}
              // NO_BRAND has no brand to filter on - send it to the board's
              // grouped view where it renders as its own section to triage.
              href={needsBrand ? "/board" : `/board?brand=${encodeURIComponent(r.brand)}`}
              className={`rounded-xl border px-3 py-2.5 transition ${
                needsBrand
                  ? "border-dashed border-white/20 bg-white/[0.02] hover:bg-white/[0.05]"
                  : cardTone(r)
              }`}
            >
              <div className="text-[11px] text-white/60 truncate" title={r.brand}>
                {r.brand}
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-xl font-semibold text-white/90 tabular-nums">
                  {r.total}
                </span>
                {r.inProgress > 0 && (
                  <span className="text-[11px] text-blue-300/70 tabular-nums">
                    {r.inProgress} wip
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] tabular-nums">
                {r.overdue > 0 && (
                  <span className="text-red-300/80">{r.overdue} overdue</span>
                )}
                {r.atRisk > 0 && (
                  <span
                    className="text-amber-300/80"
                    title={`Due within ${AT_RISK_DAYS} days and not started`}
                  >
                    {r.atRisk} at risk
                  </span>
                )}
                {r.overdue === 0 && r.atRisk === 0 && (
                  <span className="text-white/25">on track</span>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      <p className="mt-2 px-0.5 text-[11px] text-white/30">
        At risk = due within {AT_RISK_DAYS} days and not yet in progress. Tracked
        separately from overdue because {totals.overdue} of {totals.total} open
        tasks are already past due, so &quot;overdue&quot; alone no longer tells
        you where to act.
      </p>
    </section>
  );
}
