import { getSession, isAdmin, isLead, userLabel } from "@/lib/auth";
import { getActions } from "@/lib/data";
import { logout } from "../actions";
import { NavBar } from "@/components/NavBar";
import { PWAInstallButton } from "@/components/PWAInstallButton";
import { listActiveBrands } from "@/lib/brands-db";
import { listActiveProjects } from "@/lib/projects";
import { redirect } from "next/navigation";
import { PathsClient } from "./PathsClient";

export const dynamic = "force-dynamic";

export default async function PathsPage() {
  const user = await getSession();
  if (!user) redirect("/");

  const [navBrands, activeProjects, doc] = await Promise.all([
    listActiveBrands(),
    listActiveProjects().catch(() => []),
    getActions(),
  ]);

  const portalItems = doc.items;
  const userLabelStr = userLabel(user);

  return (
    <main className="min-h-screen relative text-white px-4 bg-[#041225] overflow-x-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.18),transparent_55%),radial-gradient(ellipse_at_bottom,rgba(14,165,233,0.10),transparent_60%)]" />
      <div className="relative max-w-7xl mx-auto py-6 space-y-4">
        <header className="flex flex-col gap-3 rounded-2xl bg-white/[0.06] backdrop-blur-xl border border-white/10 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Paths</h1>
              <p className="text-white/50 text-xs md:text-sm">
                All your open work-paths, one next action each
              </p>
            </div>
            <div className="flex items-center gap-2">
              <PWAInstallButton />
              <UserBadge name={userLabelStr} />
              <form action={logout}>
                <button className="text-xs rounded-lg border border-white/10 px-2.5 py-1.5 hover:bg-white/5 text-white/70">
                  Sign out
                </button>
              </form>
            </div>
          </div>
          <NavBar isAdmin={await isAdmin(user)} isLead={isLead(user)} brands={navBrands} />
        </header>

        <PathsClient items={portalItems} projects={activeProjects} />
      </div>
    </main>
  );
}

function UserBadge({ name }: { name: string }) {
  const initial = name.charAt(0).toUpperCase();
  const tone =
    name === "Zaal"
      ? "bg-blue-500/30 border-blue-400/50"
      : name === "Iman"
      ? "bg-purple-500/30 border-purple-400/50"
      : "bg-emerald-500/30 border-emerald-400/50";
  return (
    <div className={`flex items-center gap-2 rounded-full border ${tone} px-2.5 py-1`}>
      <span className="h-5 w-5 rounded-full bg-black/40 flex items-center justify-center text-xs font-bold">
        {initial}
      </span>
      <span className="text-xs">{name}</span>
    </div>
  );
}
