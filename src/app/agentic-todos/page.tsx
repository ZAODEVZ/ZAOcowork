import { redirect } from "next/navigation";
import { getSession, isAdmin, isLead } from "@/lib/auth";
import { listActiveBrands } from "@/lib/brands-db";
import { serviceClient } from "@/lib/supabase-server";
import { NavBar } from "@/components/NavBar";
import { BackButton } from "@/components/BackButton";
import { AgenticTaskCard, type ContextNote } from "@/components/AgenticTaskCard";

export const dynamic = "force-dynamic";

// /agentic-todos - the easy-read board of agent-captured tasks (source =
// "ai-proposal"). This-week first (by deadline), then everything else ordered
// by LEAST-RECENTLY-TOUCHED so you can grind top-down: touch a task and it
// sinks to the bottom. Save-for-later bin at the end. Numbered; inline voice +
// context on every card.

interface Row {
  id: string;
  title: string;
  status: string;
  category: string | null;
  priority: string | null;
  due: string | null;
  notes: string | null;
  important: boolean | null;
  urgent: boolean | null;
  metadata: Record<string, unknown> | null;
  updated_at: string | null;
}

const TIER_ORDER: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
const MS_DAY = 86_400_000;

function meta(r: Row): Record<string, unknown> {
  return (r.metadata ?? {}) as Record<string, unknown>;
}
function tierOf(r: Row): string {
  const t = (meta(r).tier as string) || r.priority || "P3";
  return TIER_ORDER[t] !== undefined ? t : "P3";
}
function dueTime(r: Row): number {
  if (!r.due) return Number.MAX_SAFE_INTEGER;
  const t = new Date(r.due).getTime();
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
}
function touchedTime(r: Row): number {
  const t = r.updated_at ? new Date(r.updated_at).getTime() : 0;
  return Number.isNaN(t) ? 0 : t;
}
function commentsOf(r: Row): ContextNote[] {
  const raw = meta(r).comments;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c, i) => {
      const o = (c ?? {}) as Record<string, unknown>;
      return {
        id: typeof o.id === "string" ? o.id : `c-${i}`,
        content: typeof o.content === "string" ? o.content : "",
        displayName: typeof o.displayName === "string" ? o.displayName : undefined,
        createdAt: typeof o.createdAt === "string" ? o.createdAt : undefined,
      };
    })
    .filter((c) => c.content);
}

function card(r: Row, num: number, dim = false) {
  return (
    <AgenticTaskCard
      key={r.id}
      id={r.id}
      num={num}
      title={r.title}
      notes={r.notes}
      due={r.due}
      status={r.status}
      category={r.category}
      important={Boolean(r.important || r.urgent)}
      isNew={Boolean(meta(r).added_by_claude)}
      dim={dim}
      comments={commentsOf(r)}
    />
  );
}

export default async function AgenticTodosPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const admin = await isAdmin(user);
  const navBrands = await listActiveBrands();

  const { data, error } = await serviceClient()
    .from("tasks")
    .select("id,title,status,category,priority,due,notes,important,urgent,metadata,updated_at")
    .eq("source", "ai-proposal")
    .is("archived_at", null);
  if (error) throw new Error(`agentic tasks read failed: ${error.message}`);

  const rows = (data ?? []) as Row[];
  const soon = Date.now() + 10 * MS_DAY;
  const isLater = (r: Row) => meta(r).bucket === "later";
  const active = rows.filter((r) => r.status !== "done" && !isLater(r));
  const later = rows.filter((r) => r.status !== "done" && isLater(r));

  // This week / now: P0 + anything due within 10 days, sorted by deadline.
  const thisWeek = active
    .filter((r) => tierOf(r) === "P0" || (r.due && dueTime(r) <= soon))
    .sort((a, b) => dueTime(a) - dueTime(b));
  const thisWeekIds = new Set(thisWeek.map((r) => r.id));

  // Everything else: least-recently-touched first (grind top-down; touched sinks).
  const rest = active
    .filter((r) => !thisWeekIds.has(r.id))
    .sort((a, b) => touchedTime(a) - touchedTime(b));

  later.sort((a, b) => touchedTime(a) - touchedTime(b));

  // Number in display order.
  const display = [...thisWeek, ...rest];
  const num = new Map<string, number>();
  display.forEach((r, i) => num.set(r.id, i + 1));
  later.forEach((r, i) => num.set(r.id, display.length + i + 1));

  return (
    <main className="min-h-screen relative text-white px-4 bg-[#0a0a1f] overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(139,92,246,0.14),transparent_55%),radial-gradient(ellipse_at_bottom,rgba(59,130,246,0.10),transparent_60%)]" />
      <div className="relative max-w-2xl mx-auto py-6 space-y-4">
        <BackButton fallback="/summary" label="Back to summary" />
        <NavBar isAdmin={admin} isLead={isLead(user)} brands={navBrands} />

        <header className="rounded-2xl bg-white/[0.06] backdrop-blur-xl border border-white/10 px-5 py-4">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Agentic Todos</h1>
          <p className="text-white/50 text-xs md:text-sm">
            {active.length} active · {thisWeek.length} this week · {later.length} saved for later. Below the deadlines, oldest-touched are first - work the top and each one you touch sinks to the bottom.
          </p>
        </header>

        {rows.length === 0 ? (
          <p className="text-sm text-white/40 italic px-2 py-6">No agentic todos yet.</p>
        ) : (
          <>
            {thisWeek.length > 0 ? (
              <section className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <span className="h-2 w-2 rounded-full bg-[#f5a623]" />
                  <h2 className="text-sm font-semibold text-[#f5a623]">This week / now</h2>
                  <span className="text-xs text-white/35">{thisWeek.length}</span>
                </div>
                {thisWeek.map((r) => card(r, num.get(r.id)!))}
              </section>
            ) : null}

            {rest.length > 0 ? (
              <section className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  <h2 className="text-sm font-semibold text-white/85">To triage - least recently touched first</h2>
                  <span className="text-xs text-white/35">{rest.length}</span>
                </div>
                {rest.map((r) => card(r, num.get(r.id)!))}
              </section>
            ) : null}

            {later.length > 0 ? (
              <section className="space-y-3 pt-2">
                <div className="flex items-center gap-2 px-1">
                  <span className="h-2 w-2 rounded-full bg-slate-500" />
                  <h2 className="text-sm font-semibold text-white/45">Save for later</h2>
                  <span className="text-xs text-white/30">{later.length} · future ideas</span>
                </div>
                {later.map((r) => card(r, num.get(r.id)!, true))}
              </section>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
