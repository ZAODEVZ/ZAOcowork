// Throughput-based Monte Carlo forecast (doc 764 F1).
//
// Replaces story-point estimation. The math:
//   1. Count DONE tasks completed per week over the last 10-12 weeks
//      -> historical throughput series (e.g. [4, 6, 3, 5, 7, 2, 5, 4, 6, 3])
//   2. For each simulation run, sample randomly from that series until
//      the remaining backlog hits zero. Record how many weeks it took.
//   3. Run 5000 simulations. Sort the durations. The 50th/85th/95th
//      percentiles give probability-of-done dates.
//
// No story points needed. No estimation ceremony. Just counts of what
// actually shipped.

import { getActions, type ActionItem } from "@/lib/data";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const HISTORY_WEEKS = 12;
const SIMS = 5000;

export interface ForecastResult {
  generatedAt: string;
  // The historical series (oldest first). Length = HISTORY_WEEKS.
  weeklyThroughput: number[];
  // Median items/week across history. Stable signal compared to the mean.
  medianPerWeek: number;
  // Open task counts the forecast addresses.
  remainingBacklog: number;
  // Per-brand breakdown when brand !== null. Else null.
  brand: string | null;
  // Percentile dates (ISO YYYY-MM-DD) the team is X% confident of finishing.
  percentiles: { p50: string; p85: string; p95: string };
  // Underlying simulation distribution (weeks-to-complete). Useful for chart.
  simulatedWeeks: { weeks: number; count: number }[];
  // Warning surfaced when history is too thin / variance too high to trust.
  warning: string | null;
}

function isoWeekStartIndex(now: number, completedMs: number): number {
  return Math.floor((now - completedMs) / WEEK_MS);
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildHistory(items: ActionItem[], brand: string | null): number[] {
  const now = Date.now();
  const cutoffMs = now - HISTORY_WEEKS * WEEK_MS;
  const buckets = new Array(HISTORY_WEEKS).fill(0);
  for (const it of items) {
    if (it.status !== "DONE") continue;
    if (brand && !(it.brands ?? []).includes(brand)) continue;
    const t = new Date(it.completedAt || it.updatedAt).getTime();
    if (!Number.isFinite(t) || t < cutoffMs || t > now) continue;
    const idx = isoWeekStartIndex(now, t);
    if (idx >= 0 && idx < HISTORY_WEEKS) buckets[idx]++;
  }
  // Reverse so oldest week is first (chronological).
  return buckets.reverse();
}

function simulate(history: number[], backlog: number): number[] {
  // Drop any leading zero-weeks before the team started shipping at all.
  // Otherwise the sampler will draw a lot of zeros and bloat the forecast.
  const nonZero = history.filter((n) => n > 0);
  const pool = nonZero.length === 0 ? history : nonZero;

  const results: number[] = [];
  for (let s = 0; s < SIMS; s++) {
    let remaining = backlog;
    let weeks = 0;
    // Safety cap so a degenerate pool of all zeros doesn't infinite loop.
    while (remaining > 0 && weeks < 200) {
      const tput = pickRandom(pool);
      remaining -= tput;
      weeks++;
    }
    results.push(weeks);
  }
  return results.sort((a, b) => a - b);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  // Nearest-rank: ceil(p/100 * N) - 1, clamped. Was floor(p/100 * N), which
  // skewed every percentile one rank high.
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function bucketDistribution(sorted: number[]): { weeks: number; count: number }[] {
  const counts = new Map<number, number>();
  for (const w of sorted) counts.set(w, (counts.get(w) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([weeks, count]) => ({ weeks, count }))
    .sort((a, b) => a.weeks - b.weeks);
}

export async function computeForecast(brand: string | null = null): Promise<ForecastResult> {
  const doc = await getActions();
  const items = doc.items.filter((it) => !it.archivedAt);

  const history = buildHistory(items, brand);
  const sortedHist = [...history].sort((a, b) => a - b);
  const medianIdx = Math.floor(sortedHist.length / 2);
  const medianPerWeek =
    sortedHist.length === 0
      ? 0
      : sortedHist.length % 2 === 0
        ? (sortedHist[medianIdx - 1] + sortedHist[medianIdx]) / 2
        : sortedHist[medianIdx];

  const remainingBacklog = items.filter((it) => {
    if (it.status === "DONE" || it.status === "TRIAGE") return false;
    if (brand && !(it.brands ?? []).includes(brand)) return false;
    return true;
  }).length;

  let warning: string | null = null;
  const nonZeroWeeks = history.filter((n) => n > 0).length;
  if (nonZeroWeeks < 4) {
    warning = `Only ${nonZeroWeeks} weeks of throughput data - forecast is unreliable. Wait until 6+ weeks for trust.`;
  } else if (medianPerWeek === 0) {
    warning = "Median throughput is 0 - cannot forecast";
  }

  const sims = simulate(history, remainingBacklog);

  const today = new Date();
  const p50weeks = percentile(sims, 50);
  const p85weeks = percentile(sims, 85);
  const p95weeks = percentile(sims, 95);

  return {
    generatedAt: new Date().toISOString(),
    weeklyThroughput: history,
    medianPerWeek,
    remainingBacklog,
    brand,
    percentiles: {
      p50: isoDay(addDays(today, p50weeks * 7)),
      p85: isoDay(addDays(today, p85weeks * 7)),
      p95: isoDay(addDays(today, p95weeks * 7)),
    },
    simulatedWeeks: bucketDistribution(sims),
    warning,
  };
}
