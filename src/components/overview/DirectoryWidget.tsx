import { Card, SectionHeader } from "./ui";

interface Link {
  label: string;
  url: string;
}

interface LinkSection {
  title: string;
  items: Link[];
}

const DASHBOARDS: Link[] = [
  { label: "Board", url: "/board" },
  { label: "My Work", url: "/my-work" },
  { label: "Repos", url: "/repos" },
  { label: "Fleet / Loops", url: "/fleet" },
  { label: "Papers", url: "https://thezao.xyz/papers" },
  { label: "Fractals", url: "https://thezao.xyz/fractals" },
];

const SURFACES: Link[] = [
  { label: "The ZAO", url: "https://thezao.xyz" },
  { label: "ZAO Directory", url: "https://thezao.xyz/list" },
  { label: "Research", url: "https://github.com/ZAODEVZ/ZAOOS/tree/main/research" },
  { label: "What is the ZAO", url: "https://thezao.xyz/what-is-the-zao" },
];

const BOTS = [
  { label: "ZOE", handle: "@zaoclaw_bot" },
  { label: "ZOL", handle: "@zolbot" },
  { label: "ZAO Devz", handle: "@zaodevz_bot" },
  { label: "ZAOstock", handle: "@ZAOstockTeamBot" },
  { label: "ZAO Cowork", handle: "@ZAOcoworkingBot" },
];

export function DirectoryWidget() {
  return (
    <Card className="p-6 lg:col-span-3">
      <SectionHeader label="Dashboards & Links" accent="slate" />

      <div className="space-y-8">
        {/* Dashboards Section */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-3">
            Dashboards
          </h3>
          <div className="flex flex-wrap gap-2">
            {DASHBOARDS.map((link) => (
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

        {/* Surfaces Section */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-3">
            Surfaces
          </h3>
          <div className="flex flex-wrap gap-2">
            {SURFACES.map((link) => (
              <a
                key={link.label}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-slate-700/50 hover:bg-slate-600/50 border border-slate-600 hover:border-white/40 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>

        {/* Bots Section */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-3">
            Bots
          </h3>
          <div className="flex flex-wrap gap-2">
            {BOTS.map((bot) => (
              <span
                key={bot.label}
                className="rounded-lg bg-slate-700/30 border border-slate-600/50 px-3 py-1.5 text-xs font-semibold text-slate-300"
              >
                {bot.label} <span className="text-slate-400">({bot.handle})</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
