import { redirect } from "next/navigation";
import { getSession, isAdmin, isLead } from "@/lib/auth";
import { listActiveBrands } from "@/lib/brands-db";
import { serviceClient } from "@/lib/supabase-server";
import { NavBar } from "@/components/NavBar";
import { BackButton } from "@/components/BackButton";
import { AgenticTaskCard, type ContextNote } from "@/components/AgenticTaskCard";

export const dynamic = "force-dynamic";

// /agentic-todos - a super-easy-to-read board of the agent-captured tasks
// (source = "ai-proposal", e.g. the zaal-personal master list). Grouped by
// tier, each card reads clean and lets you drop context or a voice note right
// on it. Self-contained: it does not bounce to the board (those rows are
// filtered off the shared board), so pop in, read, add memory, done.

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
}

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
const TIER_ORDER: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

function tierOf(r: Row): string {
  const meta = (r.metadata ?? {}) as Record<string, unknown>;
  const tier = typeof meta.tier === "string" ? meta.tier : r.priority;
  return tier && TIER_ORDER[tier] !== undefined ? tier : "P3";
}

function commentsOf(r: Row): ContextNote[] {
  const meta = (r.metadata ?? {}) as Record<string, unknown>;
  const raw = meta.comments;
  if (!Array.isArray(raw)) return [];
  return raw.map((c, i) => {
    const o = (c ?? {}) as Record<string, unknown>;
    return {
      id: typeof o.id === "string" ? o.id : `c-${i}`,
      content: typeof o.content === "string" ? o.content : "",
      displayName: typeof o.displayName === "string" ? o.displayName : undefined,
      createdAt: typeof o.createdAt === "string" ? o.createdAt : undefined,
    };
  }).filter((c) => c.content);
}

export default async function AgenticTodosPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const admin = await isAdmin(user);
  const navBrands = await listActiveBrands();

  const { data, error } = await serviceClient()
    .from("tasks")
    .select("id,title,status,category,priority,due,notes,important,urgent,metadata")
    .eq("source", "ai-proposal")
    .is("archived_at", null);
  if (error) throw new Error(`agentic tasks read failed: ${error.message}`);

  const rows = (data ?? []) as Row[];
  const open = rows.filter((r) => r.status !== "done").length;

  const tiers = ["P0", "P1", "P2", "P3"];
  const byTier = new Map<string, Row[]>();
  for (const r of rows) {
    const tier = tierOf(r);
    if (!byTier.has(tier)) byTier.set(tier, []);
    byTier.get(tier)!.push(r);
  }
  for (const list of byTier.values()) {
    list.sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999") || (a.category ?? "").localeCompare(b.category ?? ""));
  }

  return (
    <main className="min-h-screen relative text-white px-4 bg-[#0a0a1f] overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(139,92,246,0.14),transparent_55%),radial-gradient(ellipse_at_bottom,rgba(59,130,246,0.10),transparent_60%)]" />
      <div className="relative max-w-2xl mx-auto py-6 space-y-4">
        <BackButton fallback="/summary" label="Back to summary" />
        <NavBar isAdmin={admin} isLead={isLead(user)} brands={navBrands} />

        <header className="rounded-2xl bg-white/[0.06] backdrop-blur-xl border border-white/10 px-5 py-4">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Agentic Todos</h1>
          <p className="text-white/50 text-xs md:text-sm">
            {open} open · pop in anytime and add context or a voice note to any item.
          </p>
        </header>

        {rows.length === 0 ? (
          <p className="text-sm text-white/40 italic px-2 py-6">No agentic todos yet.</p>
        ) : (
          tiers.map((tier) => {
            const list = byTier.get(tier) ?? [];
            if (list.length === 0) return null;
            return (
              <section key={tier} className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <span className={`h-2 w-2 rounded-full ${TIER_DOT[tier]}`} />
                  <h2 className="text-sm font-semibold text-white/85">{TIER_LABEL[tier]}</h2>
                  <span className="text-xs text-white/35">{list.length}</span>
                </div>
                {list.map((r) => (
                  <AgenticTaskCard
                    key={r.id}
                    id={r.id}
                    title={r.title}
                    notes={r.notes}
                    due={r.due}
                    status={r.status}
                    category={r.category}
                    important={Boolean(r.important || r.urgent)}
                    isNew={Boolean(((r.metadata ?? {}) as Record<string, unknown>).added_by_claude)}
                    comments={commentsOf(r)}
                  />
                ))}
              </section>
            );
          })
        )}
      </div>
    </main>
  );
}
