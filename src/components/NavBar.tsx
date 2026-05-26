"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BRANDS, brandColor } from "@/lib/brands";

// Brands surfaced as top-row tabs. Order is intentional: most-active first,
// "General" pseudo-brand (no filter) leads. Anything not in this list lives
// in the "More" dropdown so the tab strip stays short on desktop and
// horizontally scrollable on mobile without being a wall.
const PRIMARY_BRANDS = [
  "The ZAO",
  "ZAO Devz",
  "ZAOstock",
  "WaveWarZ",
  "COC Concertz",
  "ZABAL Games",
] as const;

const PRIMARY_SET = new Set<string>(PRIMARY_BRANDS);
const OVERFLOW_BRANDS = BRANDS.filter((b) => !PRIMARY_SET.has(b));

export function NavBar({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const activeBrand = sp.get("brand");

  const onBoard = pathname === "/";
  const onChat = pathname === "/chat";
  const onAdmin = pathname === "/admin";

  return (
    <nav className="flex flex-wrap items-center gap-1.5 rounded-xl bg-black/25 border border-white/10 p-1.5">
      <div className="flex items-center gap-1.5 overflow-x-auto flex-1 min-w-0">
        <BrandTab href="/" label="General" active={onBoard && !activeBrand} tone="ok" />
        {PRIMARY_BRANDS.map((b) => (
          <BrandTab
            key={b}
            href={`/?brand=${encodeURIComponent(b)}`}
            label={b}
            active={onBoard && activeBrand === b}
            tone={onBoard && activeBrand === b ? "brand" : "ok"}
            brandName={b}
          />
        ))}
        <MoreBrandsDropdown activeBrand={onBoard ? activeBrand : null} />
      </div>
      <div className="flex items-center gap-1.5 ml-auto">
        <SimpleTab
          href="/chat"
          label="Assistant"
          active={onChat}
          dot="bg-teal-400"
          activeClass="bg-teal-500/20 text-teal-200 border-teal-500/40"
        />
        {isAdmin && (
          <SimpleTab
            href="/admin"
            label="Admin"
            active={onAdmin}
            dot="bg-fuchsia-400"
            activeClass="bg-fuchsia-500/20 text-fuchsia-200 border-fuchsia-500/40"
          />
        )}
      </div>
    </nav>
  );
}

function BrandTab({
  href,
  label,
  active,
  tone,
  brandName,
}: {
  href: string;
  label: string;
  active: boolean;
  tone: "ok" | "brand";
  brandName?: string;
}) {
  const activeClass =
    tone === "brand" && brandName
      ? brandColor(brandName)
      : "bg-blue-500/20 text-blue-200 border-blue-500/40";
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

function MoreBrandsDropdown({ activeBrand }: { activeBrand: string | null }) {
  const [open, setOpen] = useState(false);
  const overflowActive = activeBrand && !PRIMARY_SET.has(activeBrand) ? activeBrand : null;
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
            ? brandColor(overflowActive)
            : "border-transparent text-white/55 hover:text-white/85 hover:bg-white/[0.06]"
        }`}
      >
        {overflowActive ?? "More"} <span className="opacity-60">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 z-40 min-w-[180px] rounded-xl bg-[#0a1226] border border-white/15 shadow-2xl shadow-black/40 p-1.5">
          {OVERFLOW_BRANDS.map((b) => {
            const isActive = activeBrand === b;
            return (
              <Link
                key={b}
                href={`/?brand=${encodeURIComponent(b)}`}
                prefetch={false}
                onClick={() => setOpen(false)}
                className={`block px-3 py-1.5 rounded-lg text-xs font-medium border whitespace-nowrap transition ${
                  isActive
                    ? brandColor(b)
                    : "border-transparent text-white/70 hover:text-white hover:bg-white/[0.06]"
                }`}
              >
                {b}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
