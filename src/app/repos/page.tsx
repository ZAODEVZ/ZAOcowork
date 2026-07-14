import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession, isAdmin, isLead } from "@/lib/auth";
import { listActiveBrands } from "@/lib/brands-db";
import { logout } from "@/app/actions";
import { NavBar } from "@/components/NavBar";
import { BackButton } from "@/components/BackButton";
import { ReposView } from "@/components/ReposView";

export const dynamic = "force-dynamic";

export default async function ReposPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  const navBrands = await listActiveBrands().catch(() => []);

  return (
    <main className="min-h-screen relative text-white px-4 bg-[#041225] overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.18),transparent_55%),radial-gradient(ellipse_at_bottom,rgba(14,165,233,0.10),transparent_60%)]" />
      <div className="relative max-w-6xl mx-auto py-6 space-y-5">
        <header className="flex flex-col gap-3 rounded-2xl bg-white/[0.06] backdrop-blur-xl border border-white/10 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                ZAO Repos
              </h1>
              <p className="text-white/50 text-xs md:text-sm">
                Every repo across bettercallzaal and ZAODEVZ with live status.
              </p>
            </div>
            <form action={logout}>
              <button className="text-xs rounded-lg border border-white/10 px-2.5 py-1.5 hover:bg-white/5 text-white/70">
                Sign out
              </button>
            </form>
          </div>
          <NavBar isAdmin={await isAdmin(user)} isLead={isLead(user)} brands={navBrands} />
        </header>

        <ReposView />

        <footer className="pt-4 text-xs text-white/30 border-t border-white/10 flex items-center justify-between">
          <Link href="/" className="hover:text-white/60">
            back to home
          </Link>
          <span>The ZAO operational stack</span>
        </footer>
      </div>
    </main>
  );
}
