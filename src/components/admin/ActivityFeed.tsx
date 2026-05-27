"use client";

import Link from "next/link";
import type { AuditEntityType, AuditLogRow } from "@/lib/audit";

// ActivityFeed renders a workspace-wide stream of audit_log events grouped
// by day (Today / Yesterday / specific dates). Distinct from the /admin
// AuditPanel which is a filterable table inside admin; this surface is
// the calm browsable "what happened" page (doc 764 F2 + Stream.io 2026).
//
// Filter state lives in URL params so refreshes are stable + the URL can
// be shared in a Telegram message like "look at the feed filtered to
// brand events: /admin/feed?entity=brand"

const ENTITY_LABELS: Record<AuditEntityType, string> = {
  task: "Tasks",
  user: "Users",
  brand: "Brands",
  system: "System",
};

const ACTION_LABELS: Record<string, string> = {
  add_user: "added user",
  delete_user: "removed user",
  reset_password: "reset password for",
  set_role: "changed role of",
  reactivate_user: "reactivated",
  deactivate_user: "deactivated",
  add_brand: "added brand",
  update_brand: "updated brand",
  delete_brand: "removed brand",
  bulk_set_owner: "bulk-reassigned",
  bulk_set_status: "bulk-changed status of",
  bulk_set_priority: "bulk-changed priority of",
  bulk_add_brand: "bulk-tagged brand",
  bulk_remove_brand: "bulk-removed brand",
  bulk_delete: "bulk-deleted",
  bulk_assign_unowned: "bulk-assigned unowned",
  bulk_mark_done: "marked done in bulk",
  bulk_archive: "archived in bulk",
  bulk_to_triage: "punted to triage",
  triage_route: "routed from triage",
  triage_reject: "rejected from triage",
  github_pr_opened: "opened PR",
  github_pr_closed: "closed PR",
  github_pr_reopened: "reopened PR",
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/_/g, " ");
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return d.toISOString().slice(0, 10);
}

function dayLabel(key: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  return new Date(key + "T00:00:00Z").toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function timeOnly(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function entityColor(t: AuditEntityType): string {
  switch (t) {
    case "task":
      return "border-blue-500/30 bg-blue-500/8 text-blue-200";
    case "user":
      return "border-emerald-500/30 bg-emerald-500/8 text-emerald-200";
    case "brand":
      return "border-amber-500/30 bg-amber-500/8 text-amber-200";
    case "system":
      return "border-violet-500/30 bg-violet-500/8 text-violet-200";
  }
}

export function ActivityFeed({
  rows,
  total,
  available,
  page,
  pageSize,
  entity,
  actor,
  actors,
}: {
  rows: AuditLogRow[];
  total: number | null;
  available: boolean;
  page: number;
  pageSize: number;
  entity?: AuditEntityType;
  actor: string | null;
  actors: string[];
}) {
  if (!available) {
    return (
      <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
        <div className="font-semibold mb-1">audit_logs not ready</div>
        <div className="text-xs text-amber-100/85">
          Apply <code className="text-amber-300">supabase/migrations/003_audit_logs.sql</code> in the Supabase SQL editor, then refresh.
        </div>
      </div>
    );
  }

  // Group rows by day so the scanner gets a "today / yesterday" mental
  // anchor instead of an undifferentiated list.
  const byDay = new Map<string, AuditLogRow[]>();
  for (const r of rows) {
    const k = dayKey(r.created_at);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(r);
  }
  const days = Array.from(byDay.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));

  const hasMore = total === null ? rows.length === pageSize : (page * pageSize) < total;

  function buildHref(patch: { entity?: string; actor?: string; page?: number }): string {
    const params = new URLSearchParams();
    const eff: Record<string, string | undefined> = {
      entity: patch.entity ?? entity,
      actor: patch.actor ?? actor ?? undefined,
      page: patch.page !== undefined ? String(patch.page) : page > 1 ? String(page) : undefined,
    };
    for (const [k, v] of Object.entries(eff)) {
      if (v) params.set(k, v);
    }
    const qs = params.toString();
    return `/admin/feed${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-white/45 mr-1">Entity:</span>
          <FilterChip href={buildHref({ entity: undefined, page: 1 })} active={!entity} label="All" />
          {(Object.keys(ENTITY_LABELS) as AuditEntityType[]).map((e) => (
            <FilterChip
              key={e}
              href={buildHref({ entity: e, page: 1 })}
              active={entity === e}
              label={ENTITY_LABELS[e]}
            />
          ))}
          {actors.length > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-white/45">Actor:</span>
              <select
                defaultValue={actor ?? ""}
                onChange={(e) => {
                  const v = e.currentTarget.value;
                  window.location.href = buildHref({ actor: v || undefined, page: 1 });
                }}
                className="rounded-md bg-[#0b1220] border border-white/10 px-2 py-1 text-xs text-white/85"
              >
                <option value="">All actors</option>
                {actors.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        {total !== null && (
          <div className="text-[10px] text-white/40 mt-2">{total} total events</div>
        )}
      </div>

      {/* Day-grouped list */}
      {days.length === 0 ? (
        <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-8 text-center text-sm text-white/55">
          No activity matches these filters yet.
        </div>
      ) : (
        days.map(([key, dayRows]) => (
          <div key={key} className="rounded-2xl bg-white/[0.04] border border-white/10 overflow-hidden">
            <div className="px-4 py-2 border-b border-white/10 bg-white/[0.02] flex items-baseline justify-between">
              <h3 className="text-xs font-semibold text-white/85 uppercase tracking-wider">
                {dayLabel(key)}
              </h3>
              <span className="text-[10px] text-white/40">{dayRows.length} event{dayRows.length === 1 ? "" : "s"}</span>
            </div>
            <ul className="divide-y divide-white/[0.06]">
              {dayRows.map((r) => (
                <FeedRow key={r.id} row={r} />
              ))}
            </ul>
          </div>
        ))
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs">
        {page > 1 ? (
          <Link href={buildHref({ page: page - 1 })} className="rounded-lg border border-white/10 px-3 py-1.5 text-white/70 hover:bg-white/5">
            &lt; Newer
          </Link>
        ) : (
          <span />
        )}
        <span className="text-white/40">Page {page}</span>
        {hasMore ? (
          <Link href={buildHref({ page: page + 1 })} className="rounded-lg border border-white/10 px-3 py-1.5 text-white/70 hover:bg-white/5">
            Older &gt;
          </Link>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}

function FilterChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`text-[11px] rounded-md border px-2 py-1 transition ${
        active
          ? "border-zao-accent/50 bg-zao-accent/15 text-zao-accent"
          : "border-white/10 bg-white/[0.02] text-white/55 hover:text-white/85"
      }`}
    >
      {label}
    </Link>
  );
}

function FeedRow({ row }: { row: AuditLogRow }) {
  const verb = actionLabel(row.action);
  const target = row.entity_label || (row.entity_id ? `#${row.entity_id}` : "");
  const link =
    row.entity_type === "task" && row.entity_id ? `/?task=${encodeURIComponent(row.entity_id)}` : null;

  return (
    <li className="flex items-start gap-3 px-4 py-2.5 hover:bg-white/[0.03] transition">
      <div className="flex-shrink-0 mt-0.5">
        <span className={`inline-block text-[9px] uppercase tracking-wider rounded-md border px-1.5 py-0.5 ${entityColor(row.entity_type)}`}>
          {row.entity_type}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-white/85">
          <span className="font-semibold text-white">{row.actor}</span>{" "}
          <span className="text-white/65">{verb}</span>{" "}
          {link ? (
            <Link href={link} className="font-medium text-blue-300 hover:underline truncate inline-block max-w-[60vw] align-bottom">
              {target}
            </Link>
          ) : (
            <span className="font-medium text-white/85">{target}</span>
          )}
        </div>
        {row.detail && (
          <div className="text-[11px] text-white/45 mt-0.5 truncate">{row.detail}</div>
        )}
      </div>
      <div className="flex-shrink-0 text-[10px] text-white/40 mt-1 whitespace-nowrap">
        {timeOnly(row.created_at)}
      </div>
    </li>
  );
}
