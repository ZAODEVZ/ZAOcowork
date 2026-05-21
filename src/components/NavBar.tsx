"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PORTALS = [
  {
    href: "/",
    label: "Dev",
    sub: "Development & Ops",
    dot: "bg-blue-400",
    activeClass: "bg-blue-500/20 text-blue-200 border-blue-500/40",
  },
  {
    href: "/music",
    label: "Music",
    sub: "WaveWarZ & Artist Ops",
    dot: "bg-purple-400",
    activeClass: "bg-purple-500/20 text-purple-200 border-purple-500/40",
  },
  {
    href: "/marketing",
    label: "Marketing",
    sub: "Social, Brand & Campaigns",
    dot: "bg-amber-400",
    activeClass: "bg-amber-500/20 text-amber-200 border-amber-500/40",
  },
  {
    href: "/chat",
    label: "Assistant",
    sub: "Ask the AI about the board",
    dot: "bg-teal-400",
    activeClass: "bg-teal-500/20 text-teal-200 border-teal-500/40",
  },
];

export function NavBar() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1.5 rounded-xl bg-black/25 border border-white/10 p-1.5">
      {PORTALS.map(({ href, label, sub, dot, activeClass }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            title={sub}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all whitespace-nowrap ${
              active
                ? activeClass
                : "border-transparent text-white/50 hover:text-white/80 hover:bg-white/[0.06]"
            }`}
          >
            <span className={`h-2 w-2 rounded-full flex-shrink-0 ${active ? dot : "bg-white/20"}`} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
