import Link from "next/link";
import { getSession, isAdmin, userLabel } from "@/lib/auth";
import { getActions, ageDays } from "@/lib/data";
import { logout } from "./actions";
import { Board } from "@/components/Board";
import { NavBar } from "@/components/NavBar";
import { PWAInstallButton } from "@/components/PWAInstallButton";
import { CATEGORIES } from "@/lib/types";
import { BRANDS } from "@/lib/brands";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  const { brand: rawBrand } = await searchParams;
  // Only accept brand values from the controlled vocab so the URL can't smuggle
  // a free-text filter into the Board's filter state.
  const urlBrand = rawBrand && (BRANDS as readonly string[]).includes(rawBrand) ? rawBrand : null;
  const user = await getSession();
  // Public homepage: no session = render a small landing with a Login CTA.
  // Anyone can hit the site root without being kicked to /login automatically.
  // The middleware allows `/` through; /login is where the password lives.
  if (!user) return <PublicLanding />;
  const doc = await getActions();

  // Unified board: every category in one place. Brand is a filter via the URL
  // (?brand=X from the top nav), category remains an in-board dropdown. Stat
  // cards below recompute for whatever tab is active so flipping brands shows
  // that brand's open/wip/blocked numbers without a page reload feel.
  const portalItems = doc.items;
  const totalAll = portalItems.length;
  const scoped = urlBrand
    ? portalItems.filter((x) => (x.brands ?? []).includes(urlBrand))
    : portalItems;

  const open = scoped.filter((x) => x.status !== "DONE");
  const wipMine = scoped.filter(
    (x) => x.status === "WIP" && (String(x.owner).toLowerCase() === user || String(x.owner) === "Both"),
  ).length;
  const blocked = scoped.filter((x) => x.status === "BLOCKED").length;
  const aging = scoped.filter(
    (x) => x.status !== "DONE" && ageDays(x.createdAt) > 14,
  ).length;
  const done7d = scoped.filter((x) => {
    if (x.status !== "DONE") return false;
    const d = new Date(x.updatedAt).getTime();
    return Date.now() - d < 7 * 24 * 60 * 60 * 1000;
  }).length;

  const userLabelStr = userLabel(user);

  return (
    <main className="min-h-screen relative text-white px-4 bg-[#041225] overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.18),transparent_55%),radial-gradient(ellipse_at_bottom,rgba(14,165,233,0.10),transparent_60%)]" />
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
              <UserBadge name={userLabelStr} />
              <form action={logout}>
                <button className="text-xs rounded-lg border border-white/10 px-2.5 py-1.5 hover:bg-white/5 text-white/70">
                  Sign out
                </button>
              </form>
            </div>
          </div>
          <NavBar isAdmin={await isAdmin(user)} />
        </header>

        <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat
            label={urlBrand ? `${urlBrand} open` : "Open"}
            value={open.length}
            hint={urlBrand ? `of ${totalAll} all-brand total` : undefined}
          />
          <Stat label="My WIP" value={wipMine} tone={wipMine > 5 ? "warn" : "ok"} hint="target ≤ 5" />
          <Stat label="Blocked" value={blocked} tone={blocked > 0 ? "red" : "ok"} />
          <Stat label="Aging > 14d" value={aging} tone={aging > 0 ? "red" : "ok"} />
          <Stat label="Done 7d" value={done7d} tone="ok" />
        </section>

        <div className="rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/10 p-4 md:p-5">
          <div className="mb-4 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-blue-400" />
            <span className="text-sm font-semibold text-white/80">
              {urlBrand ? urlBrand : "Board"}
            </span>
            <span className="text-xs text-white/40">
              {urlBrand
                ? `filtered to ${urlBrand}`
                : "every task, filter by owner or category"}
            </span>
          </div>
          <Board
            items={portalItems}
            currentUser={user}
            portalCategories={CATEGORIES}
            defaultCategory="ZAO Devz"
            urlBrand={urlBrand}
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

function PublicLanding() {
  return (
    <main className="min-h-screen relative text-white px-4 bg-[#041225] overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.18),transparent_55%),radial-gradient(ellipse_at_bottom,rgba(14,165,233,0.10),transparent_60%)]" />
      <div className="relative max-w-3xl mx-auto py-16 md:py-28 flex flex-col items-center text-center">
        <span className="text-[11px] uppercase tracking-[0.25em] text-zao-accent/80 mb-3">
          The ZAO Co-Works
        </span>
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
          One board for every ZAO ecosystem brand
        </h1>
        <p className="mt-5 text-white/65 text-base md:text-lg max-w-xl leading-relaxed">
          Operational tracker for The ZAO team. Tasks sync across the web board
          and @ZAOcoworkingBot in Telegram - tag by brand (ZAOstock, ZABAL
          Games, WaveWarZ, BCZ, more), filter by owner, ping a teammate when
          something is urgent. Sign in to your account to access the board.
        </p>
        <div className="mt-9 flex items-center gap-3">
          <Link
            href="/login"
            className="rounded-xl bg-zao-accent text-black font-bold px-6 py-3 text-sm md:text-base hover:bg-amber-300 transition"
          >
            Sign in
          </Link>
          <a
            href="https://t.me/ZAOcoworkingBot"
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-white/15 px-5 py-3 text-sm md:text-base text-white/70 hover:text-white hover:bg-white/5 transition"
          >
            Open the Telegram bot
          </a>
        </div>
        <p className="mt-12 text-xs text-white/35 max-w-md">
          Access is by team password. Not a teammate yet? Ping{" "}
          <a href="https://farcaster.xyz/zaal" className="text-white/55 hover:text-white">
            @zaal on Farcaster
          </a>{" "}
          to get on the roster.
        </p>
        <footer className="mt-16 pt-6 text-xs text-white/30 border-t border-white/10 w-full flex items-center justify-between">
          <a href="https://github.com/ZAODEVZ/ZAOcowork" className="hover:text-white/60">
            source on github
          </a>
          <span>part of The ZAO operational stack</span>
        </footer>
      </div>
    </main>
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
