import { redirect } from "next/navigation";
import { getSession, isAdmin, isLead } from "@/lib/auth";
import { listActiveBrands } from "@/lib/brands-db";
import { NavBar } from "@/components/NavBar";
import { BotsBoard } from "@/components/BotsBoard";

export const dynamic = "force-dynamic";

// /bots — fleet liveness + ZOE chat + control plane. Session-gated like the board.
// Any session can: see live bot status, ask ZOE a question, read command history.
// Admins can also: use lifecycle controls and assign tasks to bots.
export default async function BotsPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const [navBrands, admin] = await Promise.all([listActiveBrands(), isAdmin(user)]);

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#0a1628" }}>
      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto space-y-6">
          <header>
            <NavBar isAdmin={admin} isLead={isLead(user)} brands={navBrands} />
          </header>
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Bot fleet</h1>
            <p className="text-sm text-slate-400">
              Live status of the ZAO bot fleet. Expand a bot to ask ZOE a question
              or see its recent activity. Admins: lifecycle controls also available.
            </p>
          </div>
          <BotsBoard isAdmin={admin} />
        </div>
      </main>
    </div>
  );
}
