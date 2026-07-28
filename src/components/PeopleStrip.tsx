import Link from "next/link";
import type { PersonRollup } from "@/lib/data";
import { UNOWNED } from "@/lib/data";

// Per-person queues with a WIP badge.
//
// WIP is the lever. Three active items per person is the target; past that,
// everything is "started" and nothing finishes. The badge exists to make an
// over-limit queue impossible to not notice.
//
// Thresholds per the build spec: green <3, amber 3-5, red >5.
export const WIP_TARGET = 3;
export const WIP_CEILING = 5;

function wipTone(n: number): { cls: string; label: string } {
  if (n > WIP_CEILING) {
    return { cls: "bg-red-500/20 text-red-200 border-red-500/40", label: "over limit" };
  }
  if (n >= WIP_TARGET) {
    return { cls: "bg-amber-500/20 text-amber-200 border-amber-500/40", label: "at limit" };
  }
  return { cls: "bg-emerald-500/15 text-emerald-200 border-emerald-500/30", label: "healthy" };
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function PeopleStrip({ people }: { people: PersonRollup[] }) {
  if (people.length === 0) return null;

  return (
    <section className="mb-4" aria-label="Work by person">
      <div className="flex items-baseline justify-between mb-2 px-0.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
          By person
        </h2>
        <p className="text-[11px] text-white/40">
          WIP target {WIP_TARGET} active each
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
        {people.map((p) => {
          const unowned = p.slug === UNOWNED;
          const tone = wipTone(p.inProgress);
          return (
            <Link
              key={p.slug}
              // Unowned has no owner to filter by - the board's owner filter
              // uses "Open" for unassigned work.
              href={unowned ? "/board?owner=Open" : `/board?owner=${encodeURIComponent(p.slug)}`}
              className={`rounded-xl border px-3 py-2.5 transition ${
                unowned
                  ? "border-dashed border-white/20 bg-white/[0.02] hover:bg-white/[0.05]"
                  : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-white/60 truncate">
                  {unowned ? UNOWNED : titleCase(p.name)}
                </span>
                {!unowned && (
                  <span
                    title={`${p.inProgress} in progress - ${tone.label} (target ${WIP_TARGET})`}
                    className={`shrink-0 rounded-full border px-1.5 text-[10px] tabular-nums ${tone.cls}`}
                  >
                    {p.inProgress}
                  </span>
                )}
              </div>

              <div className="mt-1 text-xl font-semibold text-white/90 tabular-nums">
                {p.total}
              </div>

              <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] tabular-nums">
                {p.overdue > 0 && (
                  <span className="text-red-300/80">{p.overdue} overdue</span>
                )}
                {p.atRisk > 0 && (
                  <span className="text-amber-300/80">{p.atRisk} at risk</span>
                )}
                {p.blocked > 0 && (
                  <span className="text-white/40">{p.blocked} blocked</span>
                )}
                {p.overdue === 0 && p.atRisk === 0 && p.blocked === 0 && (
                  <span className="text-white/25">
                    {unowned ? "needs triage" : "on track"}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
