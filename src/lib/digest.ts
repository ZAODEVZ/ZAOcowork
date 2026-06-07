// Weekly throughput digest builder (doc 764 F6).
//
// Pulls task data + audit_logs, computes the past-week metrics, and
// returns a Digest object the email route renders into both plain-text
// and HTML. Cache-friendly - the route call should be cheap enough to
// run on a cron timer without rate-limit concerns.

import { getActions, ageDays, type ActionItem } from "@/lib/data";
import { listAuditLogs } from "@/lib/audit";

export interface DigestStuckItem {
  id: string;
  title: string;
  owner: string;
  status: string;
  ageDays: number;
  staleDays: number;
}

export interface Digest {
  weekStart: string; // YYYY-MM-DD (Monday)
  weekEnd: string; // YYYY-MM-DD (today)
  shipped: number;
  shippedPrev: number;
  shippedPerDayMedian: number;
  newCount: number;
  newBySource: Record<string, number>;
  agingCount: number;
  agingNew: number;
  staleCount: number;
  staleDelta: number;
  expediteCleared: number;
  expediteMedianHours: number | null;
  triageRouted: number;
  triageMedianMinutes: number | null;
  topStuck: DigestStuckItem[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function staleDays(it: ActionItem): number {
  const acts = it.activity ?? [];
  const latest = Math.max(
    acts.length ? new Date(acts[acts.length - 1].createdAt).getTime() : 0,
    new Date(it.updatedAt).getTime(),
  );
  return Math.floor((Date.now() - latest) / DAY_MS);
}

export async function buildWeeklyDigest(): Promise<Digest> {
  const now = new Date();
  const weekStartMs = now.getTime() - 7 * DAY_MS;
  const prevWeekStartMs = weekStartMs - 7 * DAY_MS;

  const [doc, recentAudit] = await Promise.all([
    getActions(),
    listAuditLogs({ limit: 1000 }).catch(() => ({ rows: [], total: null, available: false })),
  ]);

  const items = doc.items.filter((it) => !it.archivedAt);

  // Shipped this week + last week
  const shippedThis: ActionItem[] = [];
  let shippedPrev = 0;
  for (const it of items) {
    if (it.status !== "DONE") continue;
    const ts = new Date(it.completedAt || it.updatedAt).getTime();
    if (ts >= weekStartMs) shippedThis.push(it);
    else if (ts >= prevWeekStartMs) shippedPrev++;
  }

  // Daily shipped distribution this week (Monte Carlo input)
  const perDay = new Array(7).fill(0);
  for (const it of shippedThis) {
    const ts = new Date(it.completedAt || it.updatedAt).getTime();
    const day = Math.floor((now.getTime() - ts) / DAY_MS);
    if (day >= 0 && day < 7) perDay[day]++;
  }
  const shippedPerDayMedian = median(perDay) ?? 0;

  // New tasks this week + source breakdown (from createdBy field which
  // includes 'github:', 'bot:', or human names).
  const newThis = items.filter((it) => new Date(it.createdAt).getTime() >= weekStartMs);
  const newBySource: Record<string, number> = {};
  for (const it of newThis) {
    const src = it.createdBy.startsWith("github:")
      ? "GitHub"
      : it.createdBy.startsWith("bot:") || it.createdBy === "Telegram"
        ? "Telegram"
        : it.createdBy.startsWith("meeting:")
          ? "Meeting"
          : "Manual";
    newBySource[src] = (newBySource[src] ?? 0) + 1;
  }

  // Aging > 14d among active rows
  const aging = items.filter((it) => it.status !== "DONE" && ageDays(it.createdAt) > 14);
  // "Became aging this week" = crossed the 14d line in the last 7d, i.e. age
  // 14-21d. The old `createdAt >= now-14d` was mutually exclusive with aging
  // (>14d old) so it was always 0.
  const agingNew = aging.filter((it) => ageDays(it.createdAt) <= 21).length;

  // Stale: no activity 5+d on active row
  const stale = items.filter((it) => {
    if (it.status === "DONE" || it.status === "TRIAGE") return false;
    return staleDays(it) > 5;
  });
  // Approximation of stale delta: assume any stale created in last 7d is "new stale".
  const staleDelta =
    items.filter((it) => it.status !== "DONE" && it.status !== "TRIAGE" && staleDays(it) > 5 && new Date(it.createdAt).getTime() >= weekStartMs)
      .length - 0; // can't compute "last week" without snapshots; surface as delta=new-stale

  // Expedites cleared this week + median cycle time hours
  const expediteCleared = shippedThis.filter((it) => it.serviceClass === "Expedite");
  const expediteCycleHours = expediteCleared
    .map((it) => {
      const created = new Date(it.createdAt).getTime();
      const completed = new Date(it.completedAt || it.updatedAt).getTime();
      return (completed - created) / (60 * 60 * 1000);
    })
    .filter((h) => Number.isFinite(h) && h > 0);

  // Triage routed this week + median minutes from inbox -> TODO
  // From audit_logs entries where action = 'triage_route'.
  const triageEvents = recentAudit.rows.filter(
    (r) => r.action === "triage_route" && new Date(r.created_at).getTime() >= weekStartMs,
  );
  const triageMinutes: number[] = [];
  for (const ev of triageEvents) {
    if (!ev.entity_id) continue;
    const task = items.find((it) => it.id === ev.entity_id);
    if (!task) continue;
    const mins = (new Date(ev.created_at).getTime() - new Date(task.createdAt).getTime()) / 60000;
    if (Number.isFinite(mins) && mins > 0 && mins < 7 * 24 * 60) {
      triageMinutes.push(mins);
    }
  }

  // Top 3 stuck: longest stale among active, highest priority bias.
  const topStuckPool = items
    .filter((it) => it.status !== "DONE" && it.status !== "TRIAGE" && staleDays(it) >= 3)
    .map((it) => ({
      id: it.id,
      title: it.title,
      owner: String(it.owner),
      status: it.status,
      ageDays: ageDays(it.createdAt),
      staleDays: staleDays(it),
      priorityRank: it.priority === "P1" ? 0 : it.priority === "P2" ? 1 : 2,
    }))
    .sort((a, b) => {
      if (a.priorityRank !== b.priorityRank) return a.priorityRank - b.priorityRank;
      return b.staleDays - a.staleDays;
    })
    .slice(0, 3);

  return {
    weekStart: isoDay(new Date(weekStartMs)),
    weekEnd: isoDay(now),
    shipped: shippedThis.length,
    shippedPrev,
    shippedPerDayMedian,
    newCount: newThis.length,
    newBySource,
    agingCount: aging.length,
    agingNew,
    staleCount: stale.length,
    staleDelta,
    expediteCleared: expediteCleared.length,
    expediteMedianHours: median(expediteCycleHours),
    triageRouted: triageEvents.length,
    triageMedianMinutes: median(triageMinutes),
    topStuck: topStuckPool,
  };
}

export function digestToText(d: Digest): string {
  const lines: string[] = [];
  lines.push(`ZAOcowork weekly digest (${d.weekStart} -> ${d.weekEnd})`);
  lines.push("");
  const deltaSign = d.shipped > d.shippedPrev ? "up" : d.shipped < d.shippedPrev ? "down" : "flat";
  lines.push(`Shipped: ${d.shipped} tasks (median ${d.shippedPerDayMedian}/day, ${deltaSign} from ${d.shippedPrev} last week)`);
  const srcParts = Object.entries(d.newBySource).map(([s, n]) => `${s}: ${n}`).join(", ");
  lines.push(`New: ${d.newCount} tasks${srcParts ? ` (${srcParts})` : ""}`);
  lines.push(`Aging > 14d: ${d.agingCount} tasks (${d.agingNew} new this week)`);
  lines.push(`Stale (no activity 5d): ${d.staleCount} tasks${d.staleDelta > 0 ? ` (+${d.staleDelta} this week)` : ""}`);
  const expediteStr = d.expediteMedianHours !== null
    ? `median ${d.expediteMedianHours.toFixed(1)}h`
    : "no data";
  lines.push(`Expedites cleared: ${d.expediteCleared} (${expediteStr})`);
  const triageStr = d.triageMedianMinutes !== null
    ? `median ${Math.round(d.triageMedianMinutes)} min from inbox to TODO`
    : "no data";
  lines.push(`Triage routed: ${d.triageRouted} (${triageStr})`);
  lines.push("");
  if (d.topStuck.length > 0) {
    lines.push("Top stuck:");
    for (const s of d.topStuck) {
      lines.push(`  - #${s.id} "${s.title.slice(0, 70)}" - ${s.staleDays}d stale in ${s.status}, owner ${s.owner}`);
    }
  } else {
    lines.push("No stuck tasks - clean board");
  }
  return lines.join("\n");
}

export function digestToHtml(d: Digest): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const srcParts = Object.entries(d.newBySource)
    .map(([s, n]) => `<li>${escape(s)}: <strong>${n}</strong></li>`)
    .join("");
  const stuckList = d.topStuck.length === 0
    ? `<li>No stuck tasks - clean board.</li>`
    : d.topStuck
        .map((s) =>
          `<li>#${escape(s.id)} <a href="https://www.thezao.xyz/?task=${encodeURIComponent(s.id)}">${escape(s.title)}</a> - ${s.staleDays}d stale in ${escape(s.status)}, owner ${escape(s.owner)}</li>`,
        )
        .join("");
  const deltaSign = d.shipped > d.shippedPrev ? "up" : d.shipped < d.shippedPrev ? "down" : "flat";
  return `<!doctype html><html><body style="font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0f1f;color:#e2e8f0;padding:24px;max-width:640px;margin:0 auto;">
  <h2 style="color:#fff;margin-top:0;">ZAOcowork weekly digest</h2>
  <p style="color:#94a3b8;margin:0 0 16px;">${escape(d.weekStart)} -&gt; ${escape(d.weekEnd)}</p>

  <div style="background:#111827;border:1px solid #1f2937;border-radius:12px;padding:16px;margin-bottom:12px;">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;">Shipped</div>
    <div style="font-size:24px;font-weight:bold;color:#10b981;">${d.shipped} tasks <span style="font-size:13px;font-weight:normal;color:#94a3b8;">(median ${d.shippedPerDayMedian}/day, ${deltaSign} from ${d.shippedPrev} last week)</span></div>
  </div>

  <ul style="list-style:none;padding:0;margin:0 0 16px;">
    <li style="padding:6px 0;border-bottom:1px solid #1f2937;"><strong style="color:#fff;">New:</strong> ${d.newCount} tasks${srcParts ? `<ul style="margin:4px 0 0 16px;font-size:13px;color:#94a3b8;">${srcParts}</ul>` : ""}</li>
    <li style="padding:6px 0;border-bottom:1px solid #1f2937;"><strong style="color:#fff;">Aging &gt; 14d:</strong> ${d.agingCount} tasks <span style="color:#94a3b8;">(${d.agingNew} new this week)</span></li>
    <li style="padding:6px 0;border-bottom:1px solid #1f2937;"><strong style="color:#fff;">Stale (no activity 5d):</strong> ${d.staleCount} tasks${d.staleDelta > 0 ? ` <span style="color:#f59e0b;">(+${d.staleDelta} this week)</span>` : ""}</li>
    <li style="padding:6px 0;border-bottom:1px solid #1f2937;"><strong style="color:#fff;">Expedites cleared:</strong> ${d.expediteCleared}${d.expediteMedianHours !== null ? ` <span style="color:#94a3b8;">(median ${d.expediteMedianHours.toFixed(1)}h cycle)</span>` : ""}</li>
    <li style="padding:6px 0;"><strong style="color:#fff;">Triage routed:</strong> ${d.triageRouted}${d.triageMedianMinutes !== null ? ` <span style="color:#94a3b8;">(median ${Math.round(d.triageMedianMinutes)} min from inbox)</span>` : ""}</li>
  </ul>

  <h3 style="color:#fff;font-size:14px;margin:24px 0 8px;">Top stuck</h3>
  <ul style="list-style:disc;padding-left:20px;margin:0;color:#cbd5e1;">${stuckList}</ul>

  <p style="margin-top:24px;color:#64748b;font-size:11px;">Generated by ZAOcowork (doc 764 F6). Cron at <a href="https://www.thezao.xyz/admin/feed" style="color:#60a5fa;">/admin/feed</a> for the full activity stream.</p>
</body></html>`;
}
