"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { brandColor as constBrandColor, BRANDS as CONST_BRANDS } from "@/lib/brands";
import ActivityStrip from "./ActivityStrip";
import { MentionsBadge } from "./MentionsBadge";
import { CommandPalette } from "./CommandPalette";

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

  const onBoard = pathname === "/";
  const onChat = pathname === "/chat";
  const onActivity = pathname === "/activity";
  const onMine = pathname === "/my-work";
  const onSettings = pathname === "/settings";
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
        <div className="flex items-center gap-1.5 overflow-x-auto flex-1 min-w-0 scrollbar-thin">
          <BrandTab href="/" label="General" active={onBoard && !activeBrand} color={null} />
          {primary.map((b) => (
            <BrandTab
              key={b.name}
              href={`/?brand=${encodeURIComponent(b.name)}`}
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
              activity: onActivity,
              chat: onChat,
              admin: onAdmin,
              settings: onSettings,
            }}
          />
        </div>
      </div>
      <ActivityStrip />
    </nav>
    <CommandPalette />
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
  active: { mine: boolean; activity: boolean; chat: boolean; admin: boolean; settings: boolean };
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const anyActive =
    active.mine || active.activity || active.chat || active.admin || active.settings;

  const items: Array<{ href: string; label: string; icon: string; active: boolean; badge?: boolean }> = [
    { href: "/my-work", label: "My Work", icon: "🙋", active: active.mine },
    { href: "/activity", label: "Activity", icon: "📰", active: active.activity, badge: true },
    { href: "/chat", label: "Assistant", icon: "🤖", active: active.chat },
    ...(showAdmin ? [{ href: "/admin", label: "Admin", icon: "🛠️", active: active.admin }] : []),
    { href: "/settings", label: "Settings", icon: "⚙", active: active.settings },
  ];

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
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
      {open && (
        <div className="absolute top-full right-0 mt-1 z-50 min-w-[180px] rounded-xl bg-[#0a1226] border border-white/15 shadow-2xl shadow-black/40 p-1.5">
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
              {it.badge && active.activity === false && (
                <span className="relative ml-auto h-3 w-3">
                  <MentionsBadge />
                </span>
              )}
            </Link>
          ))}
        </div>
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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all whitespace-nowrap ${
          overflowActive
            ? overflowActiveColor ?? "bg-white/10 text-white/70 border-white/20"
            : "border-transparent text-white/55 hover:text-white/85 hover:bg-white/[0.06]"
        }`}
      >
        {overflowActive ?? "More"} <span className="opacity-60">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 z-40 min-w-[200px] rounded-xl bg-[#0a1226] border border-white/15 shadow-2xl shadow-black/40 p-1.5 max-h-[60vh] overflow-y-auto">
          {brands.map((b) => {
            const isActive = activeBrand === b.name;
            return (
              <Link
                key={b.name}
                href={`/?brand=${encodeURIComponent(b.name)}`}
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
        </div>
      )}
    </div>
  );
}
