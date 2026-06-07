import { redirect } from "next/navigation";
import { getSession, isAdmin, isLead } from "@/lib/auth";
import { listActiveBrands } from "@/lib/brands-db";
import { NavBar } from "@/components/NavBar";
import { BotsBoard } from "@/components/BotsBoard";

export const dynamic = "force-dynamic";

// /bots — fleet liveness board. Session-gated like the rest of the board;
// the BotsBoard client component reads GET /api/v1/bots with the session cookie.
export default async function BotsPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const navBrands = await listActiveBrands();

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#0a1628" }}>
      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto space-y-6">
          <header>
            <NavBar isAdmin={await isAdmin(user)} isLead={isLead(user)} brands={navBrands} />
          </header>
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Bot fleet</h1>
            <p className="text-sm text-slate-400">
              Live status of the ZAO bot fleet. Green = heartbeat within the last 10 minutes,
              red = offline/stale. Auto-refreshes every 30s.
            </p>
          </div>
          <BotsBoard />
        </div>
      </main>
    </div>
  );
}
