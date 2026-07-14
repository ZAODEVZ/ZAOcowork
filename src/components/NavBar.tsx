"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { brandColor as constBrandColor, BRANDS as CONST_BRANDS } from "@/lib/brands";
import ActivityStrip from "./ActivityStrip";
import { MentionsBadge } from "./MentionsBadge";
import { CommandPalette } from "./CommandPalette";
import { KeyboardHelp } from "./KeyboardHelp";

// NavBar's brand tabs. Phase D switched from a hardcoded BRANDS const to a
// `brands` prop loaded server-side from the brands table. Each brand carries
// its display name, the Tailwind color-class string, and a sort_order. Brands
// with sort_order < PRIMARY_CUTOFF render as inline tabs; everything else
// goes into the "More" dropdown so the desktop tab strip stays scannable
// (mobile gets a horizontal scroll either way).
//
// The fallback projection from the const list is used pre-migration so
// pages still render before 002 is applied. NavBar itself stays a client
// component (uses usePathname + useSearchParams); the parent server page
// is responsible for fetching the brand list and passing it down.

const PRIMARY_CUTOFF = 100;

export interface NavBrand {
  name: string;
  color: string;
  sort_order: number;
}

function fallbackBrands(): NavBrand[] {
  return CONST_BRANDS.map((name, i) => ({
    name,
    color: constBrandColor(name),
    sort_order: i < 6 ? (i + 1) * 10 : 100 + i * 10,
  }));
}

export function NavBar({
  isAdmin = false,
  isLead = false,
  brands,
}: {
  isAdmin?: boolean;
  // Doc 766 finding #3: leads need the Admin tab too so they can reach
  // /admin/triage, /admin/cleanup, /admin/proposals, /admin/feed.
  // /admin itself opens to leads now and gates admin-only sections.
  isLead?: boolean;
  brands?: NavBrand[];
}) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const activeBrand = sp.get("brand");

  const onBoard = pathname === "/board";
  const onHome = pathname === "/";
  const onOverview = pathname === "/overview";
  const onPaths = pathname === "/paths";
  const onRepos = pathname === "/repos";
  const onChat = pathname === "/chat";
  const onTaskChat = pathname === "/task-chat";
  const onActivity = pathname === "/activity";
  const onMine = pathname === "/my-work";
  const onCalendar = pathname === "/calendar";
  const onMeetings = pathname === "/meetings";
  const onCrm = pathname === "/crm";
  const onPhotos = pathname === "/photos";
  const onSettings = pathname === "/settings";
  const onSummary = pathname === "/summary";
  const onAdmin = pathname.startsWith("/admin");
  const showAdminTab = isAdmin || isLead;

  const resolved = useMemo<NavBrand[]>(() => {
    const list = brands && brands.length > 0 ? brands : fallbackBrands();
    return [...list].sort((a, b) => a.sort_order - b.sort_order);
  }, [brands]);

  const primary = resolved.filter((b) => b.sort_order < PRIMARY_CUTOFF);
  const overflow = resolved.filter((b) => b.sort_order >= PRIMARY_CUTOFF);

  // Layout note: parent is flex-col with header row (flex, no wrap). The primary-tabs
  // container scrolls horizontally when content overflows; the right-side
  // Assistant/Admin block stays pinned with `flex-shrink-0`. flex-wrap on
  // the parent caused the primary tabs to wrap to a hidden second row on
  // narrow viewports (Iman bug 2026-05-26 Test 10). ActivityStrip renders
  // below the tabs as an unobtrusive status footer.
  return (
    <>
    <nav className="flex flex-col rounded-xl bg-black/25 border border-white/10 p-1.5">
      <div className="flex items-center gap-1.5">
        {/* Top-level tabs: Mission Control | Paths | Board | Repos */}
        <div className="flex items-center gap-1.5 overflow-x-auto flex-1 min-w-0 scrollbar-thin">
          <BrandTab href="/overview" label="Mission Control" active={onOverview} color={null} />
          <BrandTab href="/paths" label="Paths" active={onPaths} color={null} />
          <BrandTab href="/board" label="Board" active={onBoard && !activeBrand} color={null} />
          <BrandTab href="/repos" label="Repos" active={onRepos} color={null} />
          {/* Separator */}
          <div className="h-4 w-px bg-white/10 flex-shrink-0" />
          {/* Brand tabs */}
          {primary.map((b) => (
            <BrandTab
              key={b.name}
              href={`/board?brand=${encodeURIComponent(b.name)}`}
              label={b.name}
              active={onBoard && activeBrand === b.name}
              color={b.color}
            />
          ))}
          {overflow.length > 0 && (
            <MoreBrandsDropdown
              brands={overflow}
              activeBrand={onBoard ? activeBrand : null}
            />
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("zao:open-search"))}
            title="Search tasks (⌘K or /)"
            aria-label="Search tasks"
            className="px-2.5 py-1.5 rounded-lg text-xs border border-transparent text-white/55 hover:text-white/85 hover:bg-white/[0.06] transition"
          >
            ⌕
          </button>
          <NavMenu
            showAdmin={showAdminTab}
            active={{
              mine: onMine,
              calendar: onCalendar,
              meetings: onMeetings,
              crm: onCrm,
              photos: onPhotos,
              activity: onActivity,
              chat: onChat,
              taskChat: onTaskChat,
              admin: onAdmin,
              settings: onSettings,
              summary: onSummary,
            }}
          />
        </div>
      </div>
      <ActivityStrip />
    </nav>
    <CommandPalette />
    <KeyboardHelp />
    </>
  );
}

function BrandTab({
  href,
  label,
  active,
  color,
}: {
  href: string;
  label: string;
  active: boolean;
  color: string | null;
}) {
  const activeClass = color ?? "bg-blue-500/20 text-blue-200 border-blue-500/40";
  return (
    <Link
      href={href}
      prefetch={false}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all whitespace-nowrap ${
        active
          ? activeClass
          : "border-transparent text-white/55 hover:text-white/85 hover:bg-white/[0.06]"
      }`}
    >
      {label}
    </Link>
  );
}

function SimpleTab({
  href,
  label,
  active,
  dot,
  activeClass,
}: {
  href: string;
  label: string;
  active: boolean;
  dot: string;
  activeClass: string;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all whitespace-nowrap ${
        active
          ? activeClass
          : "border-transparent text-white/55 hover:text-white/85 hover:bg-white/[0.06]"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${active ? dot : "bg-white/20"}`} />
      {label}
    </Link>
  );
}

// Collapses the secondary destinations (My Work / Activity / Assistant / Admin /
// Settings) into one ☰ menu so the top bar stays uncluttered — just brand tabs,
// quick search, and this. The mention badge surfaces on the trigger so you still
// see pings while it's collapsed.
function NavMenu({
  showAdmin,
  active,
}: {
  showAdmin: boolean;
  active: { mine: boolean; calendar: boolean; meetings: boolean; crm: boolean; photos: boolean; activity: boolean; chat: boolean; taskChat: boolean; admin: boolean; settings: boolean; summary: boolean };
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setCoords({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onScroll() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  const anyActive =
    active.mine || active.calendar || active.meetings || active.crm || active.photos || active.activity || active.chat || active.taskChat || active.admin || active.settings;

  const items: Array<{ href: string; label: string; icon: string; active: boolean; badge?: boolean; external?: boolean }> = [
    { href: "/summary", label: "Summary", icon: "", active: active.summary },
    { href: "/my-work", label: "My Work", icon: "🙋", active: active.mine },
    { href: "/calendar", label: "Calendar", icon: "📅", active: active.calendar },
    { href: "/meetings", label: "Meetings", icon: "🗓️", active: active.meetings },
    { href: "/activity", label: "Activity / Notifications", icon: "📰", active: active.activity, badge: true },
    { href: "/chat", label: "Assistant", icon: "🤖", active: active.chat },
    { href: "/task-chat", label: "Task Chat", icon: "💬", active: active.taskChat },
    { href: "/crm", label: "CRM", icon: "👥", active: active.crm },
    { href: "/photos", label: "Photos", icon: "", active: active.photos },
    ...(showAdmin ? [{ href: "/admin", label: "Admin", icon: "🛠️", active: active.admin }] : []),
    { href: "/settings", label: "Settings", icon: "⚙", active: active.settings },
  ];

  const zaoSurfaces = [
    { href: "https://thezao.xyz/fractals", label: "Fractals", external: true },
    { href: "https://thezao.xyz", label: "The ZAO", external: true },
    { href: "https://thezao.xyz/papers", label: "Papers", external: true },
    { href: "https://thezao.xyz/list", label: "Directory", external: true },
    { href: "https://thezao.xyz/bots", label: "Bots Board", external: true },
    { href: "https://zao.frapps.xyz", label: "Governance", external: true },
    { href: "https://zabalnewsletterbuilder.vercel.app", label: "Newsletter", external: true },
  ];

  return (
    <div className="flex-shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-label="Menu"
        aria-expanded={open}
        className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
          open || anyActive
            ? "bg-white/10 text-white border-white/20"
            : "border-transparent text-white/55 hover:text-white/85 hover:bg-white/[0.06]"
        }`}
      >
        <span className="text-sm leading-none">☰</span>
        <span className="hidden sm:inline">Menu</span>
        <MentionsBadge />
      </button>
      {mounted &&
        open &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", top: coords.top, right: coords.right }}
            className="z-[60] min-w-[180px] rounded-xl bg-[#0a1226] border border-white/15 shadow-2xl shadow-black/40 p-1.5"
          >
            {items.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                prefetch={false}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition ${
                  it.active ? "bg-white/10 text-white" : "text-white/65 hover:text-white hover:bg-white/[0.06]"
                }`}
              >
                <span className="text-sm leading-none">{it.icon}</span>
                {it.label}
              </Link>
            ))}
            <div className="my-1.5 border-t border-white/10" />
            <div className="px-3 py-1.5">
              <div className="text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-2">
                ZAO Surfaces
              </div>
              <div className="space-y-0.5">
                {zaoSurfaces.map((surface) =>
                  surface.external ? (
                    <a
                      key={surface.href}
                      href={surface.href}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-xs text-white/65 hover:text-white hover:bg-white/[0.06] transition"
                    >
                      {surface.label}
                      <span className="text-[10px] text-white/30">↗</span>
                    </a>
                  ) : (
                    <Link
                      key={surface.href}
                      href={surface.href}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-xs text-white/65 hover:text-white hover:bg-white/[0.06] transition"
                    >
                      {surface.label}
                    </Link>
                  )
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function MoreBrandsDropdown({
  brands,
  activeBrand,
}: {
  brands: NavBrand[];
  activeBrand: string | null;
}) {
  const [open, setOpen] = useState(false);
  const overflowMap = useMemo(() => {
    const m = new Map<string, NavBrand>();
    for (const b of brands) m.set(b.name, b);
    return m;
  }, [brands]);
  const overflowActive = activeBrand && overflowMap.has(activeBrand) ? activeBrand : null;
  const overflowActiveColor = overflowActive ? overflowMap.get(overflowActive)?.color ?? null : null;
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => setMounted(true), []);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setCoords({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onScroll() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all whitespace-nowrap ${
          overflowActive
            ? overflowActiveColor ?? "bg-white/10 text-white/70 border-white/20"
            : "border-transparent text-white/55 hover:text-white/85 hover:bg-white/[0.06]"
        }`}
      >
        {overflowActive ?? "More"} <span className="opacity-60">{open ? "▴" : "▾"}</span>
      </button>
      {mounted &&
        open &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", top: coords.top, right: coords.right }}
            className="z-[60] min-w-[200px] rounded-xl bg-[#0a1226] border border-white/15 shadow-2xl shadow-black/40 p-1.5 max-h-[60vh] overflow-y-auto"
          >
          {brands.map((b) => {
            const isActive = activeBrand === b.name;
            return (
              <Link
                key={b.name}
                href={`/board?brand=${encodeURIComponent(b.name)}`}
                prefetch={false}
                onClick={() => setOpen(false)}
                className={`block px-3 py-1.5 rounded-lg text-xs font-medium border whitespace-nowrap transition ${
                  isActive
                    ? b.color
                    : "border-transparent text-white/70 hover:text-white hover:bg-white/[0.06]"
                }`}
              >
                {b.name}
              </Link>
            );
          })}
          </div>,
          document.body,
        )}
    </div>
  );
}
