import { Card, SectionHeader } from "./ui";

const SURFACES = [
  {
    name: "ZOE",
    handle: "@zaoclaw_bot",
    description: "Orchestrator - tasks, captures, auto-PR pipeline",
    color: "bg-blue-500/10 border-blue-500/20",
  },
  {
    name: "ZOL",
    handle: "@zolbot",
    description: "Farcaster agentic account on Pi",
    color: "bg-purple-500/10 border-purple-500/20",
  },
  {
    name: "ZAO Devz",
    handle: "@zaodevz_bot",
    description: "Group dispatch + hourly learning tip",
    color: "bg-green-500/10 border-green-500/20",
  },
  {
    name: "ZAOstock",
    handle: "@ZAOstockTeamBot",
    description: "Festival team coordination",
    color: "bg-orange-500/10 border-orange-500/20",
  },
];

const QUICK_LINKS = [
  { label: "The ZAO", url: "https://thezao.xyz" },
  { label: "Papers", url: "https://thezao.xyz/papers" },
  { label: "Fractals", url: "https://thezao.xyz/fractals" },
  { label: "Board", url: "/board" },
  { label: "Research", url: "https://github.com/ZAODEVZ/ZAOOS/tree/main/research" },
];

export function SurfacesWidget() {
  return (
    <Card className="p-6">
      <SectionHeader label="Surfaces & Lanes" accent="slate" />

      {/* Operating surfaces */}
      <div className="mb-8">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-3">
          Operating Bots
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {SURFACES.map((surface) => (
            <div
              key={surface.name}
              className={`rounded-lg border p-3 ${surface.color} hover:border-white/40 transition-colors`}
            >
              <div className="font-semibold text-sm text-white">{surface.name}</div>
              <div className="text-xs text-white/60 mt-0.5">{surface.handle}</div>
              <div className="text-xs text-white/50 mt-1 line-clamp-2">
                {surface.description}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick links */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-3">
          Key Pages
        </h3>
        <div className="flex flex-wrap gap-2">
          {QUICK_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.url}
              target={link.url.startsWith("/") ? undefined : "_blank"}
              rel={link.url.startsWith("/") ? undefined : "noopener noreferrer"}
              className="rounded-lg bg-slate-700/50 hover:bg-slate-600/50 border border-slate-600 hover:border-white/40 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors"
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </Card>
  );
}
