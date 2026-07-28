import { redirect } from "next/navigation";
import { getSession, isAdmin, isLead, userLabel } from "@/lib/auth";
import { listActiveBrands } from "@/lib/brands-db";
import { getBoardCounts } from "@/lib/data";
import { logout } from "@/app/actions";
import { NavBar } from "@/components/NavBar";
import { Chat } from "@/components/Chat";
import { SlaGridChip } from "@/components/SlaGridChip";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  // Three SQL COUNTs instead of reading all 1314 tasks to length-filter them
  // three times. This also makes the number CORRECT: the old count included
  // archived rows, so this header read 304 open while the board header (which
  // already used getBoardCounts) read 301. Measured 2026-07-28: 3 archived
  // rows are not DONE, so open 304->301 and aging 128->125. blocked is
  // unchanged at 4.
  const [{ open, blocked, aging }, navBrands] = await Promise.all([
    getBoardCounts(),
    listActiveBrands(),
  ]);

  const userLabelStr = userLabel(user);

  return (
    <main className="min-h-screen relative text-white px-4 bg-[#03141f] overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(20,184,166,0.16),transparent_55%),radial-gradient(ellipse_at_bottom,rgba(14,165,233,0.10),transparent_60%)]" />
      <div className="relative max-w-4xl mx-auto py-6 space-y-4">

        <header className="flex flex-col gap-3 rounded-2xl bg-white/[0.06] backdrop-blur-xl border border-white/10 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">The Zao Co-Works</h1>
              <p className="text-white/50 text-xs md:text-sm">
                {open} open · {blocked} blocked · {aging} aging
              </p>
            </div>
            <div className="flex items-center gap-2">
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

        <div className="rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/10 p-4 md:p-5">
          <div className="mb-4 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-teal-400" />
            <span className="text-sm font-semibold text-white/80">Co-Works Assistant</span>
            <span className="text-xs text-white/40">— ask about the board, powered by OpenRouter</span>
          </div>
          <Chat />
        </div>

        <footer className="pt-4 text-xs text-white/30 border-t border-white/10 flex items-center justify-between">
          <a href="https://github.com/songchaindao-dot/cowork-zaodevz" className="hover:text-white/60">
            source on github
          </a>
          <span>answers reflect the live board · the assistant can be wrong</span>
        </footer>
      </div>
      <SlaGridChip />
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
