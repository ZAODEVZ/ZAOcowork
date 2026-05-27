import { redirect } from "next/navigation";
import { getSession, isAdmin, isLead } from "@/lib/auth";
import { getActions } from "@/lib/data";
import { listActiveBrands } from "@/lib/brands-db";
import { NavBar } from "@/components/NavBar";
import { TriagePanel } from "@/components/admin/TriagePanel";

export const dynamic = "force-dynamic";

// /admin/triage - lead-and-admin-only routing surface for items in
// status=TRIAGE. Doc 763 F6: external writers (NL /todo parser, Telegram
// bot, /meeting skill, research-dispatcher) default new items to TRIAGE
// so a human can pick owner + brand + priority + service class before the
// card hits the main board.
export default async function TriagePage() {
  const user = await getSession();
  if (!user) redirect("/login");
  // Both leads and admins can triage. Workers cannot.
  if (!isLead(user) && !(await isAdmin(user))) redirect("/?not-allowed=triage");

  const [doc, navBrands] = await Promise.all([
    getActions(),
    listActiveBrands(),
  ]);
  const triageItems = doc.items.filter((it) => it.status === "TRIAGE" && !it.archivedAt);

  return (
    <main className="min-h-screen relative text-white px-4 bg-[#0a0f1f] overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(168,85,247,0.16),transparent_55%)]" />
      <div className="relative max-w-6xl mx-auto py-8 space-y-6">
        <header className="rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/10 p-4 md:p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold">Triage</h1>
              <p className="text-sm text-white/55 mt-1">
                {triageItems.length === 0
                  ? "Inbox is empty. External writers will land their items here."
                  : `${triageItems.length} item${triageItems.length === 1 ? "" : "s"} waiting to be routed`}
              </p>
            </div>
          </div>
          <NavBar isAdmin={await isAdmin(user)} brands={navBrands} />
        </header>

        <TriagePanel items={triageItems} brands={navBrands.map((b) => b.name)} />
      </div>
    </main>
  );
}
