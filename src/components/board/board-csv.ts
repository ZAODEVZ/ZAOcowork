// board-csv.ts - CSV export + due-date urgency, extracted from Board.tsx.
//
// Board.tsx was 2787 lines, which made the genuinely testable logic inside it
// unreachable from a test file. These are pure (or near-pure) helpers with no
// component state, so they move out cleanly and get real coverage.

import type { ActionItem } from "@/lib/types";

// Due-date urgency for the card's "due" badge. Makes a date preattentive:
// overdue reads red, due within 2 days reads amber, otherwise neutral.
// DONE tasks never flag — a shipped task's due date is history.
export function dueUrgency(due: string | undefined, status: string): "overdue" | "soon" | "none" {
  if (!due || status === "DONE") return "none";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(`${due}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "none";
  const diffDays = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0) return "overdue";
  if (diffDays <= 2) return "soon";
  return "none";
}

// CSV export of the currently-filtered items. Kept dependency-free: builds the
// text in-browser and downloads via a Blob URL. RFC-4180 quoting (wrap in
// quotes, double any embedded quotes) so titles/notes with commas survive.
export const CSV_COLUMNS: { header: string; get: (it: ActionItem) => string }[] = [
  { header: "id", get: (it) => String(it.id ?? "") },
  { header: "title", get: (it) => it.title ?? "" },
  { header: "status", get: (it) => it.status ?? "" },
  { header: "owner", get: (it) => String(it.owner ?? "") },
  { header: "priority", get: (it) => it.priority ?? "" },
  { header: "category", get: (it) => it.category ?? "" },
  { header: "brands", get: (it) => (it.brands ?? []).join("; ") },
  { header: "due", get: (it) => it.due ?? "" },
  { header: "createdAt", get: (it) => it.createdAt ?? "" },
  { header: "updatedAt", get: (it) => it.updatedAt ?? "" },
  { header: "completedAt", get: (it) => it.completedAt ?? "" },
];

export function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function exportItemsCsv(items: ActionItem[]) {
  const header = CSV_COLUMNS.map((c) => c.header).join(",");
  const rows = items.map((it) => CSV_COLUMNS.map((c) => csvCell(c.get(it))).join(","));
  const csv = [header, ...rows].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `zao-tasks-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}


export function parseDueDate(raw: string): Date | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!m) return null;
  const d = new Date(`${m[1]}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) return null;
  return d;
}
