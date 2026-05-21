import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getActions, ageDays } from "@/lib/data";
import { logout } from "@/app/actions";
import { Board } from "@/components/Board";
import { NavBar } from "@/components/NavBar";
import { PWAInstallButton } from "@/components/PWAInstallButton";
import { MARKETING_CATEGORIES } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MarketingPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const doc = await getActions();

  const portalItems = doc.items.filter((x) =>
    MARKETING_CATEGORIES.includes(String(x.category)),
  );

  const open = portalItems.filter((x) => x.status !== "DONE");
  const wipMine = portalItems.filter(
    (x) => x.status === "WIP" && (String(x.owner).toLowerCase() === user || String(x.owner) === "Both"),
  ).length;
  const blocked = portalItems.filter((x) => x.status === "BLOCKED").length;
  const aging = portalItems.filter(
    (x) => x.status !== "DONE" && ageDays(x.createdAt) > 14,
  ).length;
  const done7d = portalItems.filter((x) => {
    if (x.status !== "DONE") return false;
    const d = new Date(x.updatedAt).getTime();
    return Date.now() - d < 7 * 24 * 60 * 60 * 1000;
  }).length;

  const userLabel =
    user === "zaal" ? "Zaal" : user === "iman" ? "Iman" : user === "thyrev" ? "ThyRev" : "Samantha";

  return (
    <main className="min-h-screen relative text-white px-4 bg-[#150a00] overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(245,158,11,0.15),transparent_55%),radial-gradient(ellipse_at_bottom,rgba(234,88,12,0.10),transparent_60%)]" />
      <div className="relative max-w-7xl mx-auto py-6 space-y-4">

        <header className="flex flex-col gap-3 rounded-2xl bg-white/[0.06] backdrop-blur-xl border border-white/10 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">The Zao Co-Works</h1>
              <p className="text-white/50 text-xs md:text-sm">
                Updated {new Date(doc.updatedAt).toLocaleString()}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <PWAInstallButton />
              <UserBadge name={userLabel} />
              <form action={logout}>
                <button className="text-xs rounded-lg border border-white/10 px-2.5 py-1.5 hover:bg-white/5 text-white/70">
                  Sign out
                </button>
              </form>
            </div>
          </div>
          <NavBar />
        </header>

        <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="Open" value={open.length} />
          <Stat label="My WIP" value={wipMine} tone={wipMine > 5 ? "warn" : "ok"} hint="target ≤ 5" />
          <Stat label="Blocked" value={blocked} tone={blocked > 0 ? "red" : "ok"} />
          <Stat label="Aging > 14d" value={aging} tone={aging > 0 ? "red" : "ok"} />
          <Stat label="Done 7d" value={done7d} tone="ok" />
        </section>

        <div className="rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/10 p-4 md:p-5">
          <div className="mb-4 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            <span className="text-sm font-semibold text-white/80">Marketing Board</span>
            <span className="text-xs text-white/40">— Social · Brand · Content · Campaigns</span>
          </div>
          <Board
            items={portalItems}
            currentUser={user}
            portalCategories={MARKETING_CATEGORIES}
            defaultCategory="Social"
          />
        </div>

        <footer className="pt-4 text-xs text-white/30 border-t border-white/10 flex items-center justify-between">
          <a href="https://github.com/bettercallzaal/imanprojects" className="hover:text-white/60">
            source on github
          </a>
          <span>SIX-SIGMA.md + BACKLOG.md in repo</span>
        </footer>
      </div>
    </main>
  );
}

function UserBadge({ name }: { name: string }) {
  const initial = name.charAt(0).toUpperCase();
  const tone = name === "Zaal" ? "bg-blue-500/30 border-blue-400/50" : "bg-purple-500/30 border-purple-400/50";
  return (
    <div className={`flex items-center gap-2 rounded-full border ${tone} px-2.5 py-1`}>
      <span className="h-5 w-5 rounded-full bg-black/40 flex items-center justify-center text-xs font-bold">
        {initial}
      </span>
      <span className="text-xs">{name}</span>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "ok",
  hint,
}: {
  label: string;
  value: number;
  tone?: "ok" | "warn" | "red";
  hint?: string;
}) {
  const toneCls =
    tone === "red"
      ? "text-red-200 border-red-500/25"
      : tone === "warn"
      ? "text-amber-200 border-amber-500/25"
      : "text-white border-white/10";
  return (
    <div className={`rounded-2xl bg-white/[0.06] backdrop-blur-xl border ${toneCls} px-4 py-3`}>
      <div className="text-[10px] uppercase tracking-wider text-white/50">{label}</div>
      <div className="mt-1 text-2xl font-bold leading-none">{value}</div>
      {hint && <div className="text-[10px] text-white/35 mt-1">{hint}</div>}
    </div>
  );
}
