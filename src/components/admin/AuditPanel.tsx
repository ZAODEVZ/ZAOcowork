"use client";

import Link from "next/link";
import type { AuditEntityType, AuditLogRow } from "@/lib/audit";

// AuditPanel: paginated view of audit_logs. Server component fetches the
// page; this client wrapper renders the table + entity_type filter + the
// pagination links. Filter changes navigate to /admin?audit_entity=... so
// the active filter survives a refresh / share.

const ENTITY_BADGE: Record<AuditEntityType, string> = {
  task: "border-blue-400/40 bg-blue-500/15 text-blue-200",
  user: "border-fuchsia-400/40 bg-fuchsia-500/15 text-fuchsia-200",
  brand: "border-amber-400/40 bg-amber-500/15 text-amber-200",
  system: "border-white/15 bg-white/[0.04] text-white/55",
};

const ENTITY_FILTERS: Array<{ label: string; value: AuditEntityType | "all" }> = [
  { label: "All", value: "all" },
  { label: "Tasks", value: "task" },
  { label: "Users", value: "user" },
  { label: "Brands", value: "brand" },
  { label: "System", value: "system" },
];

const PAGE_SIZE = 50;

export function AuditPanel({
  rows,
  total,
  available,
  page,
  entity,
  actor,
  actors,
}: {
  rows: AuditLogRow[];
  total: number | null;
  available: boolean;
  page: number;
  entity: AuditEntityType | "all";
  actor: string | null;
  actors: string[];
}) {
  if (!available) {
    return (
      <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
        <div className="font-semibold mb-1">audit_logs not ready</div>
        <div className="text-xs text-amber-100/85">
          Apply <code className="text-amber-300">supabase/migrations/003_audit_logs.sql</code> in the Supabase SQL editor
          to start collecting + viewing events. Until then admin and bulk actions still run normally - the audit calls
          fail silently so they don't block real work.
        </div>
      </div>
    );
  }

  const totalLabel = total === null ? `${rows.length} loaded` : `${total} event${total === 1 ? "" : "s"} total`;
  const pageCount = total === null ? null : Math.max(1, Math.ceil(total / PAGE_SIZE));

  function buildQuery(opts: { entity?: AuditEntityType | "all"; actor?: string | null; page?: number }) {
    const sp = new URLSearchParams();
    const e = opts.entity ?? entity;
    const a = opts.actor === undefined ? actor : opts.actor;
    const p = opts.page ?? page;
    if (e && e !== "all") sp.set("audit_entity", e);
    if (a) sp.set("audit_actor", a);
    if (p > 1) sp.set("audit_page", String(p));
    const qs = sp.toString();
    return qs ? `/admin?${qs}` : "/admin";
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-white/40">Entity</span>
        {ENTITY_FILTERS.map((f) => (
          <Link
            key={f.value}
            href={buildQuery({ entity: f.value, page: 1 })}
            scroll={false}
            className={`text-xs rounded-md px-2 py-1 border transition ${
              entity === f.value
                ? "border-zao-accent/50 bg-zao-accent/15 text-zao-accent"
                : "border-white/10 text-white/55 hover:text-white/85 hover:bg-white/5"
            }`}
          >
            {f.label}
          </Link>
        ))}
        {actors.length > 0 && (
          <>
            <span className="text-[10px] uppercase tracking-wider text-white/40 ml-3">Actor</span>
            <Link
              href={buildQuery({ actor: null, page: 1 })}
              scroll={false}
              className={`text-xs rounded-md px-2 py-1 border transition ${
                !actor
                  ? "border-zao-accent/50 bg-zao-accent/15 text-zao-accent"
                  : "border-white/10 text-white/55 hover:text-white/85 hover:bg-white/5"
              }`}
            >
              Any
            </Link>
            {actors.slice(0, 8).map((a) => (
              <Link
                key={a}
                href={buildQuery({ actor: a, page: 1 })}
                scroll={false}
                className={`text-xs rounded-md px-2 py-1 border transition ${
                  actor === a
                    ? "border-zao-accent/50 bg-zao-accent/15 text-zao-accent"
                    : "border-white/10 text-white/55 hover:text-white/85 hover:bg-white/5"
                }`}
              >
                {a}
              </Link>
            ))}
          </>
        )}
        <span className="text-[10px] text-white/40 ml-auto">{totalLabel}</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.02]">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-white/40 border-b border-white/10">
              <th className="px-3 py-2 font-medium w-[140px]">When</th>
              <th className="px-3 py-2 font-medium w-[100px]">Actor</th>
              <th className="px-3 py-2 font-medium w-[80px]">Entity</th>
              <th className="px-3 py-2 font-medium w-[160px]">Action</th>
              <th className="px-3 py-2 font-medium">Detail</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-xs text-white/40">
                  No events matching the current filter.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-white/5 last:border-b-0 hover:bg-white/[0.03]">
                  <td className="px-3 py-2 text-[11px] text-white/55 font-mono">
                    {new Date(r.created_at).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-3 py-2 text-xs text-white/85">{r.actor}</td>
                  <td className="px-3 py-2">
                    <span className={`text-[10px] rounded px-1.5 py-0.5 border uppercase tracking-wider ${ENTITY_BADGE[r.entity_type]}`}>
                      {r.entity_type}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-white/85 font-mono">{r.action}</td>
                  <td className="px-3 py-2 text-xs text-white/70">
                    {r.entity_label && (
                      <span className="text-white/85">{r.entity_label}</span>
                    )}
                    {r.entity_label && r.detail && <span className="text-white/40"> - </span>}
                    {r.detail}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pageCount && pageCount > 1 && (
        <div className="flex items-center justify-between text-xs text-white/55">
          <div>
            page {page} of {pageCount}
          </div>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <Link
                href={buildQuery({ page: page - 1 })}
                scroll={false}
                className="rounded-md border border-white/10 px-2 py-1 hover:bg-white/5 hover:text-white/85"
              >
                ← prev
              </Link>
            ) : (
              <span className="rounded-md border border-white/5 px-2 py-1 text-white/25">← prev</span>
            )}
            {page < pageCount ? (
              <Link
                href={buildQuery({ page: page + 1 })}
                scroll={false}
                className="rounded-md border border-white/10 px-2 py-1 hover:bg-white/5 hover:text-white/85"
              >
                next →
              </Link>
            ) : (
              <span className="rounded-md border border-white/5 px-2 py-1 text-white/25">next →</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
