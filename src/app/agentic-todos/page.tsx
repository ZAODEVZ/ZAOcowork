import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession, isAdmin, isLead } from "@/lib/auth";
import { listActiveBrands } from "@/lib/brands-db";
import { serviceClient } from "@/lib/supabase-server";
import { NavBar } from "@/components/NavBar";
import { BackButton } from "@/components/BackButton";

export const dynamic = "force-dynamic";

// /agentic-todos - the read surface for tasks captured by the agents
// (source = "ai-proposal"), e.g. Claude's seeded master list under the
// zaal-personal project. Grouped by tier so the highest-priority items
// read first. Each row deep-links to /todo/[id], where you add context
// (a comment) that writes straight back to the same task.

interface AgenticTask {
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
  project: string | null;
}

const TIER_ORDER: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
const TIER_LABEL: Record<string, string> = {
  P0: "P0 - this week / money",
  P1: "P1 - quick decisions",
  P2: "P2 - build and ops",
  P3: "P3 - strategic / parked",
};
const TIER_DOT: Record<string, string> = {
  P0: "bg-red-500",
  P1: "bg-amber-500",
  P2: "bg-blue-500",
  P3: "bg-emerald-500",
};
const STATUS_BADGE: Record<string, string> = {
  todo: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  in_progress: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  blocked: "bg-red-500/15 text-red-300 border-red-500/30",
  done: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
};

function tierOf(t: AgenticTask): string {
  const meta = (t.metadata ?? {}) as Record<string, unknown>;
  const tier = typeof meta.tier === "string" ? meta.tier : t.priority;
  return tier && TIER_ORDER[tier] !== undefined ? tier : "P3";
}

function isNew(t: AgenticTask): boolean {
  const meta = (t.metadata ?? {}) as Record<string, unknown>;
  return Boolean(meta.added_by_claude);
}

function TaskRow({ t }: { t: AgenticTask }) {
  const overdue = t.due && t.status !== "done" && new Date(t.due) < new Date();
  const star = t.important || t.urgent;
  return (
    <Link
      href={`/todo/${encodeURIComponent(t.id)}`}
      prefetch={false}
      className="block rounded-xl px-3 py-2.5 -mx-1 hover:bg-white/[0.05] transition"
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm text-white/90">
            {star ? <span className="text-amber-300" aria-hidden="true">* </span> : null}
            {t.title}
            {isNew(t) ? (
              <span className="ml-2 align-middle text-[9px] uppercase tracking-wide text-violet-300 border border-violet-400/40 rounded px-1 py-0.5">
                new
              </span>
            ) : null}
          </div>
          {t.notes ? <div className="text-[12px] text-white/50 mt-0.5 leading-snug">{t.notes}</div> : null}
          <div className="text-[11px] text-white/35 mt-1">
            {t.category ?? "General"}
            {t.due ? (
              <span className={overdue ? "text-red-300" : "text-white/35"}> · due {t.due}</span>
            ) : null}
          </div>
        </div>
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full border font-medium flex-shrink-0 ${STATUS_BADGE[t.status] ?? "border-white/15 text-white/50"}`}
        >
          {t.status}
        </span>
      </div>
    </Link>
  );
}

export default async function AgenticTodosPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const admin = await isAdmin(user);
  const navBrands = await listActiveBrands();

  const { data, error } = await serviceClient()
    .from("tasks")
    .select("id,title,status,category,priority,due,notes,important,urgent,metadata,project")
    .eq("source", "ai-proposal")
    .is("archived_at", null);
  if (error) throw new Error(`agentic tasks read failed: ${error.message}`);

  const tasks = (data ?? []) as AgenticTask[];
  const open = tasks.filter((t) => t.status !== "done").length;

  const tiers = ["P0", "P1", "P2", "P3"];
  const byTier = new Map<string, AgenticTask[]>();
  for (const t of tasks) {
    const tier = tierOf(t);
    if (!byTier.has(tier)) byTier.set(tier, []);
    byTier.get(tier)!.push(t);
  }
  for (const list of byTier.values()) {
    list.sort((a, b) => {
      const d = (a.due ?? "9999").localeCompare(b.due ?? "9999");
      if (d !== 0) return d;
      return (a.category ?? "").localeCompare(b.category ?? "");
    });
  }

  return (
    <main className="min-h-screen relative text-white px-4 bg-[#0a0a1f] overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(139,92,246,0.14),transparent_55%),radial-gradient(ellipse_at_bottom,rgba(59,130,246,0.10),transparent_60%)]" />
      <div className="relative max-w-3xl mx-auto py-6 space-y-4">
        <BackButton fallback="/summary" label="Back to summary" />
        <NavBar isAdmin={admin} isLead={isLead(user)} brands={navBrands} />

        <header className="rounded-2xl bg-white/[0.06] backdrop-blur-xl border border-white/10 px-5 py-4">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Agentic Todos</h1>
          <p className="text-white/50 text-xs md:text-sm">
            {open} open · captured by the agents · tap any item to open it and add context.
          </p>
        </header>

        {tasks.length === 0 ? (
          <p className="text-sm text-white/40 italic px-2 py-6">No agentic todos yet.</p>
        ) : (
          tiers.map((tier) => {
            const list = byTier.get(tier) ?? [];
            if (list.length === 0) return null;
            return (
              <section
                key={tier}
                className="rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/10 p-4 md:p-5"
              >
                <div className="mb-2 flex items-baseline gap-2">
                  <span className={`h-2 w-2 rounded-full ${TIER_DOT[tier]}`} />
                  <h2 className="text-sm font-semibold text-white/85">{TIER_LABEL[tier]}</h2>
                  <span className="text-xs text-white/35">{list.length}</span>
                </div>
                <div className="divide-y divide-white/5">
                  {list.map((t) => (
                    <TaskRow key={t.id} t={t} />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>
    </main>
  );
}
