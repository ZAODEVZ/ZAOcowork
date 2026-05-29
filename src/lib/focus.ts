// Top-5 focus list ranker (Phase J, doc 768).
//
// Composite signal answers "what should I work on RIGHT NOW?" without
// making the user filter the board. Combined ranking per Zaal's call:
//   - Expedite service class (any owner) -> always tops the list
//   - Stale mine (no activity 5+ days, owner = me or "Both" or claimable)
//   - Overdue mine (due date past, status != DONE)
//   - P1 priority mine in WIP/BLOCKED (actively trying to ship)
//   - Pending reviews for me (lead-only: worker updates awaiting approval)
//
// Server-only helper. Pass the full items list + current session user;
// returns the top 5 with score + reason chips for UI render.

import type { ActionItem } from "./types";
import { isStale, ageDays } from "./types";

export type FocusReason =
  | "expedite"
  | "stale"
  | "overdue"
  | "p1-wip"
  | "pending-review";

export interface FocusEntry {
  task: ActionItem;
  score: number;
  reasons: FocusReason[];
}

const REASON_LABELS: Record<FocusReason, string> = {
  expedite: "Expedite",
  stale: "Stale",
  overdue: "Overdue",
  "p1-wip": "P1 in WIP",
  "pending-review": "Awaits review",
};

const REASON_COLORS: Record<FocusReason, string> = {
  expedite: "bg-red-500/20 text-red-200 border-red-500/40",
  stale: "bg-amber-500/20 text-amber-200 border-amber-500/40",
  overdue: "bg-orange-500/20 text-orange-200 border-orange-500/40",
  "p1-wip": "bg-rose-500/20 text-rose-200 border-rose-500/40",
  "pending-review": "bg-blue-500/20 text-blue-200 border-blue-500/40",
};

export function reasonLabel(r: FocusReason): string {
  return REASON_LABELS[r];
}

export function reasonColor(r: FocusReason): string {
  return REASON_COLORS[r];
}

function parseDue(raw: string): Date | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!m) return null;
  const d = new Date(`${m[1]}T00:00:00Z`);
  return Number.isFinite(d.getTime()) ? d : null;
}

function isMine(task: ActionItem, user: string): boolean {
  const u = user.toLowerCase();
  const o = String(task.owner ?? "").toLowerCase();
  if (o === u) return true;
  if (o === "both") return true;
  if (task.claimable && (!o || o === "open")) return true;
  return false;
}

export interface FocusOptions {
  isLead: boolean;
  limit?: number;
}

export function computeTopFive(
  items: ActionItem[],
  user: string,
  opts: FocusOptions = { isLead: false },
): FocusEntry[] {
  const limit = opts.limit ?? 5;
  const todayMs = Date.now();
  const scored: FocusEntry[] = [];

  for (const it of items) {
    if (it.archivedAt) continue;
    if (it.status === "DONE" || it.status === "TRIAGE") continue;

    const reasons: FocusReason[] = [];
    let score = 0;

    if (it.serviceClass === "Expedite") {
      reasons.push("expedite");
      score += 1000;
    }

    const mine = isMine(it, user);

    if (mine && isStale(it)) {
      reasons.push("stale");
      score += 500 + ageDays(it.createdAt);
    }

    if (mine) {
      const due = parseDue(it.due);
      if (due && due.getTime() < todayMs) {
        reasons.push("overdue");
        const daysLate = Math.floor((todayMs - due.getTime()) / (24 * 60 * 60 * 1000));
        score += 400 + Math.min(daysLate, 100);
      }
    }

    if (mine && it.priority === "P1" && (it.status === "WIP" || it.status === "BLOCKED")) {
      reasons.push("p1-wip");
      score += 200;
    }

    if (opts.isLead) {
      const pending = (it.updates ?? []).filter((u) => u.reviewStatus === "pending").length;
      if (pending > 0) {
        reasons.push("pending-review");
        score += 300 + pending * 10;
      }
    }

    if (reasons.length === 0) continue;
    scored.push({ task: it, score, reasons });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
