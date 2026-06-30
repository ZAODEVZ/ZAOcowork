import Link from "next/link";
import { getSession, isAdmin, isLead, userLabel } from "@/lib/auth";
import { getActions, ageDays } from "@/lib/data";
import { logout } from "./actions";
import { NavBar } from "@/components/NavBar";
import { PWAInstallButton } from "@/components/PWAInstallButton";
import { isAssignedTo, type ActionItem } from "@/lib/types";
import { listActiveBrands } from "@/lib/brands-db";
import { listMeetings } from "@/lib/meetings";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getSession();
  if (!user) return <PublicLanding />;

  const [navBrands, doc, meetings] = await Promise.all([
    listActiveBrands().catch(() => []),
    getActions(),
    listMeetings({ sinceDays: 0 }).catch(() => []),
  ]);

  const active = doc.items.filter((x) => !x.archivedAt && x.status !== "TRIAGE");
  const mine = active.filter((x) => x.status !== "DONE" && isAssignedTo(x, user));
  const myWip = mine.filter((x) => x.status === "WIP").length;
  const blocked = active.filter((x) => x.status === "BLOCKED").length;
  const aging = active.filter((x) => x.status !== "DONE" && ageDays(x.createdAt) > 14).length;
  const done7d = active.filter((x) => {
    if (x.status !== "DONE") return false;
    return Date.now() - new Date(x.updatedAt).getTime() < 7 * 24 * 60 * 60 * 1000;
  }).length;

  // "Do now": my open tasks, overdue/soonest first, then oldest.
  const todayKey = new Date().toISOString().slice(0, 10);
  const myTop = [...mine]
    .sort((a, b) => {
      const ad = dueKey(a), bd = dueKey(b);
      if (ad && bd) return ad < bd ? -1 : ad > bd ? 1 : 0;
      if (ad) return -1;
      if (bd) return 1;
      return ageDays(b.createdAt) - ageDays(a.createdAt);
    })
    .slice(0, 6);

  const now = Date.now();
  const upcoming = meetings
    .filter((m) => new Date(m.endsAt).getTime() >= now)
    .slice(0, 4);

  const name = userLabel(user);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <main className="min-h-screen relative text-white px-4 bg-[#041225] overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.18),transparent_55%),radial-gradient(ellipse_at_bottom,rgba(14,165,233,0.10),transparent_60%)]" />
      <div className="relative max-w-6xl mx-auto py-6 space-y-5">
        <header className="flex flex-col gap-3 rounded-2xl bg-white/[0.06] backdrop-blur-xl border border-white/10 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">The Zao Co-Works</h1>
              <p className="text-white/50 text-xs md:text-sm">{greeting}, {name}.</p>
            </div>
            <div className="flex items-center gap-2">
              <PWAInstallButton />
              <UserBadge name={name} />
              <form action={logout}>
                <button className="text-xs rounded-lg border border-white/10 px-2.5 py-1.5 hover:bg-white/5 text-white/70">
                  Sign out
                </button>
              </form>
            </div>
          </div>
          <NavBar isAdmin={await isAdmin(user)} isLead={isLead(user)} brands={navBrands} />
        </header>

        {/* At-a-glance stats */}
        <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="My open" value={mine.length} hint={`${myWip} in progress`} />
          <Stat label="My WIP" value={myWip} tone={myWip > 5 ? "warn" : "ok"} hint="target ≤ 5" />
          <Stat label="Blocked" value={blocked} tone={blocked > 0 ? "red" : "ok"} />
          <Stat label="Aging > 14d" value={aging} tone={aging > 0 ? "red" : "ok"} />
          <Stat label="Done 7d" value={done7d} tone="ok" />
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Your tasks today */}
          <section className="lg:col-span-2 rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/10 p-4 md:p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                <span className="text-sm font-semibold text-white/80">Your focus</span>
              </div>
              <Link href="/my-work" className="text-xs text-white/45 hover:text-white/80">
                all my work →
              </Link>
            </div>
            {myTop.length === 0 ? (
              <p className="text-sm text-white/35 py-6 text-center">
                Nothing assigned to you right now. 🎉
              </p>
            ) : (
              <div className="space-y-1.5">
                {myTop.map((t) => (
                  <Link
                    key={t.id}
                    href={`/board?task=${t.id}`}
                    className="flex items-center gap-3 px-3 py-2 rounded-xl border border-white/10 bg-black/20 hover:bg-white/[0.06] transition"
                  >
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border flex-shrink-0 ${statusChip(t.status)}`}>
                      {t.status}
                    </span>
                    <span className="flex-1 text-sm text-white/85 truncate">{t.title}</span>
                    {t.due && (
                      <span className={`text-[11px] flex-shrink-0 ${dueKey(t)! < todayKey ? "text-red-300" : "text-white/40"}`}>
                        {t.due.slice(5, 10)}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Upcoming meetings */}
          <section className="rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/10 p-4 md:p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-cyan-400" />
                <span className="text-sm font-semibold text-white/80">Upcoming</span>
              </div>
              <Link href="/meetings" className="text-xs text-white/45 hover:text-white/80">
                meetings →
              </Link>
            </div>
            {upcoming.length === 0 ? (
              <p className="text-sm text-white/35 py-6 text-center">No meetings scheduled.</p>
            ) : (
              <div className="space-y-2">
                {upcoming.map((m) => (
                  <Link
                    key={m.id}
                    href="/meetings"
                    className="block px-3 py-2 rounded-xl border border-white/10 bg-black/20 hover:bg-white/[0.06] transition"
                  >
                    <div className="text-sm text-white/85 truncate">{m.title}</div>
                    <div className="text-[11px] text-cyan-200/70">{fmtMeeting(m.startsAt)}</div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Quick links */}
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Tile href="/board" icon="▦" label="Board" tone="blue" />
          <Tile href="/calendar" icon="📅" label="Calendar" tone="blue" />
          <Tile href="/meetings" icon="🗓️" label="Meetings" tone="cyan" />
          <Tile href="/crm" icon="👥" label="CRM" tone="violet" />
          <Tile href="/my-work" icon="🙋" label="My Work" tone="amber" />
          <Tile href="/activity" icon="📰" label="Activity" tone="emerald" />
        </section>

        <footer className="pt-4 text-xs text-white/30 border-t border-white/10 flex items-center justify-between">
          <a href="https://github.com/ZAODEVZ/ZAOcowork" className="hover:text-white/60">source on github</a>
          <span>The ZAO operational stack</span>
        </footer>
      </div>
    </main>
  );
}

function dueKey(t: ActionItem): string | null {
  const m = String(t.due ?? "").match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function statusChip(status: string): string {
  switch (status) {
    case "WIP": return "border-amber-500/50 text-amber-300";
    case "BLOCKED": return "border-red-500/50 text-red-300";
    case "DONE": return "border-emerald-500/50 text-emerald-300";
    default: return "border-slate-500/50 text-slate-300";
  }
}

function fmtMeeting(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const TILE_TONE: Record<string, string> = {
  blue: "hover:border-blue-400/40 hover:bg-blue-500/10",
  cyan: "hover:border-cyan-400/40 hover:bg-cyan-500/10",
  violet: "hover:border-violet-400/40 hover:bg-violet-500/10",
  amber: "hover:border-amber-400/40 hover:bg-amber-500/10",
  emerald: "hover:border-emerald-400/40 hover:bg-emerald-500/10",
};

function Tile({ href, icon, label, tone }: { href: string; icon: string; label: string; tone: string }) {
  return (
    <Link
      href={href}
      className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-white/[0.04] border border-white/10 py-5 transition ${TILE_TONE[tone] ?? ""}`}
    >
      <span className="text-2xl">{icon}</span>
      <span className="text-xs font-medium text-white/70">{label}</span>
    </Link>
  );
}

function UserBadge({ name }: { name: string }) {
  const initial = name.charAt(0).toUpperCase();
  const tone =
    name === "Zaal" ? "bg-blue-500/30 border-blue-400/50"
    : name === "Iman" ? "bg-purple-500/30 border-purple-400/50"
    : "bg-emerald-500/30 border-emerald-400/50";
  return (
    <div className={`flex items-center gap-2 rounded-full border ${tone} px-2.5 py-1`}>
      <span className="h-5 w-5 rounded-full bg-black/40 flex items-center justify-center text-xs font-bold">{initial}</span>
      <span className="text-xs">{name}</span>
    </div>
  );
}

function Stat({ label, value, tone = "ok", hint }: { label: string; value: number; tone?: "ok" | "warn" | "red"; hint?: string }) {
  const toneCls =
    tone === "red" ? "text-red-200 border-red-500/25"
    : tone === "warn" ? "text-amber-200 border-amber-500/25"
    : "text-white border-white/10";
  return (
    <div className={`rounded-2xl bg-white/[0.06] backdrop-blur-xl border ${toneCls} px-4 py-3`}>
      <div className="text-[10px] uppercase tracking-wider text-white/50">{label}</div>
      <div className="mt-1 text-2xl font-bold leading-none">{value}</div>
      {hint && <div className="text-[11px] text-white/55 mt-1">{hint}</div>}
    </div>
  );
}

function PublicLanding() {
  return (
    <main className="min-h-screen relative text-white px-4 bg-[#041225] overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.18),transparent_55%),radial-gradient(ellipse_at_bottom,rgba(14,165,233,0.10),transparent_60%)]" />
      <div className="relative max-w-3xl mx-auto py-16 md:py-28 flex flex-col items-center text-center">
        <span className="text-[11px] uppercase tracking-[0.25em] text-zao-accent/80 mb-3">The ZAO Co-Works</span>
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight">One board for every ZAO ecosystem brand</h1>
        <p className="mt-5 text-white/65 text-base md:text-lg max-w-xl leading-relaxed">
          Operational tracker for The ZAO team. Tasks sync across the web board
          and @ZAOcoworkingBot in Telegram - tag by brand (ZAOstock, ZABAL
          Games, WaveWarZ, BCZ, more), filter by owner, ping a teammate when
          something is urgent. Sign in to your account to access the board.
        </p>
        <div className="mt-9 flex items-center gap-3">
          <Link href="/login" className="rounded-xl bg-zao-accent text-black font-bold px-6 py-3 text-sm md:text-base hover:bg-amber-300 transition">
            Sign in
          </Link>
          <a href="https://t.me/ZAOcoworkingBot" target="_blank" rel="noreferrer" className="rounded-xl border border-white/15 px-5 py-3 text-sm md:text-base text-white/70 hover:text-white hover:bg-white/5 transition">
            Open the Telegram bot
          </a>
        </div>
        <p className="mt-12 text-xs text-white/35 max-w-md">
          Access is by team password. Not a teammate yet? Ping{" "}
          <a href="https://farcaster.xyz/zaal" className="text-white/55 hover:text-white">@zaal on Farcaster</a>{" "}
          to get on the roster.
        </p>
        <footer className="mt-16 pt-6 text-xs text-white/30 border-t border-white/10 w-full flex items-center justify-between">
          <a href="https://github.com/ZAODEVZ/ZAOcowork" className="hover:text-white/60">source on github</a>
          <span>part of The ZAO operational stack</span>
        </footer>
      </div>
    </main>
  );
}
