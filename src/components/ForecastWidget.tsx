import type { ForecastResult } from "@/lib/forecast";

// ForecastWidget renders the Monte Carlo forecast result on the homepage
// header. Three confidence levels + a tiny sparkline of the past 12 weeks
// of throughput so the reader can sanity-check the input data.
//
// Server component - the parent computes the forecast once per page load.

function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });
}

function daysFromNow(iso: string): number {
  return Math.max(0, Math.round((new Date(iso + "T00:00:00Z").getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

export function ForecastWidget({
  forecast,
  brand,
}: {
  forecast: ForecastResult;
  brand: string | null;
}) {
  if (forecast.remainingBacklog === 0) {
    return (
      <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/30 p-4">
        <div className="text-sm font-semibold text-emerald-200">No open work{brand ? ` for ${brand}` : ""}</div>
        <div className="text-xs text-emerald-200/70 mt-1">Backlog is empty. Nothing to forecast.</div>
      </div>
    );
  }
  // UX cleanup: a widget that announces it is unreliable is noise. Until there
  // are 6+ weeks of throughput, hide the forecast entirely rather than showing a
  // low-confidence box that the reader has to mentally discard every visit.
  if (forecast.warning) {
    return null;
  }

  // Tiny inline sparkline. SVG width 96, height 24.
  const max = Math.max(1, ...forecast.weeklyThroughput);
  const sparkPoints = forecast.weeklyThroughput
    .map((v, i) => {
      const x = (i / Math.max(1, forecast.weeklyThroughput.length - 1)) * 96;
      const y = 24 - (v / max) * 22 - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className="rounded-2xl bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border border-blue-500/25 p-4">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-sm font-semibold text-white/90">
          Forecast {brand ? <span className="text-blue-200/85">- {brand}</span> : ""}
        </div>
        <div className="text-[10px] text-white/45">{forecast.remainingBacklog} open · median {forecast.medianPerWeek}/wk</div>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <PctTile label="50%" date={forecast.percentiles.p50} tone="ok" />
        <PctTile label="85%" date={forecast.percentiles.p85} tone="ok" />
        <PctTile label="95%" date={forecast.percentiles.p95} tone="warn" />
      </div>
      <div className="flex items-center gap-2">
        <svg width="96" height="24" viewBox="0 0 96 24" className="flex-shrink-0">
          <polyline
            fill="none"
            stroke="rgb(96 165 250)"
            strokeWidth="1.5"
            points={sparkPoints}
          />
        </svg>
        <span className="text-[10px] text-white/45">past 12 weeks (items shipped/wk)</span>
      </div>
    </div>
  );
}

function PctTile({ label, date, tone }: { label: string; date: string; tone: "ok" | "warn" }) {
  const days = daysFromNow(date);
  return (
    <div className={`rounded-lg border px-2 py-1.5 ${tone === "warn" ? "border-amber-500/30 bg-amber-500/5" : "border-blue-500/25 bg-blue-500/5"}`}>
      <div className="text-[9px] uppercase tracking-wider text-white/45">{label} confident</div>
      <div className="text-sm font-bold text-white">{fmtDate(date)}</div>
      <div className="text-[10px] text-white/45">{days === 0 ? "today" : `${days}d out`}</div>
    </div>
  );
}
