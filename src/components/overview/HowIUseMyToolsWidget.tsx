import { Card, SectionHeader } from "./ui";

/**
 * HowIUseMyToolsWidget — a living reference for how Zaal uses the tools we built.
 *
 * Front-and-center on Mission Control so the toolset stays in muscle memory
 * (the "daily learning" ask). Data-driven: add a tool to a group's `tools`
 * array and it shows up — this is the durable home for the reference, not a
 * throwaway clipboard page.
 */

interface Tool {
  cmd: string;
  use: string;
  isNew?: boolean;
}

interface ToolGroup {
  label: string;
  accent: string; // tailwind color token for the dot
  tools: Tool[];
}

const GROUPS: ToolGroup[] = [
  {
    label: "Terminals & Fleet",
    accent: "bg-blue-400",
    tools: [
      { cmd: "/spawn <repo> \"prompt\"", use: "Open a new terminal running Claude on a repo, seeded with a prompt. Watch it come up in ZTUI. Bare name -> ~/Documents/<name>.", isNew: true },
      { cmd: "/pi \"prompt\"", use: "Same as /spawn but on the Raspberry Pi (ansuz)." },
      { cmd: "zj <name>", use: "Jump your terminal into a running tmux session (zj zpoidh, zj zao-media)." },
      { cmd: "ztui", use: "Fleet view - every working agent, what needs you, bots, PRs, board, in one screen." },
      { cmd: "/worksession", use: "Start each terminal on its own ws/ branch before any work." },
    ],
  },
  {
    label: "Capture & Board (the loop)",
    accent: "bg-emerald-400",
    tools: [
      { cmd: "todo \"...\"", use: "Capture a thought to the inbox. Capture never means do-it-now." },
      { cmd: "capture -> triage -> crush", use: "The daily loop: everything captured gets triaged, then crushed. Board is the external memory." },
      { cmd: "/z", use: "Quick capture / route to the right lane." },
    ],
  },
  {
    label: "Content & Sharing",
    accent: "bg-fuchsia-400",
    tools: [
      { cmd: "/socials", use: "Platform-specific posts across all surfaces. Every post starts with ZM." },
      { cmd: "/clipboard", use: "A clean copyable page with history (~/.zao/clipboard). For AFK/phone copy moments." },
      { cmd: "/meeting", use: "Record + recap a meeting: transcript, top-3 clip, todo readback, Bonfire episode." },
    ],
  },
  {
    label: "Grounding & Knowledge",
    accent: "bg-amber-400",
    tools: [
      { cmd: "icm <brand>", use: "Ground on a brand's ICM box (the source of truth) before working on it. icm alone lists every box." },
      { cmd: "/graphify", use: "Turn any input into a knowledge-graph episode." },
      { cmd: "/zao-research  /autoresearch", use: "Research a topic to a numbered doc + PR (runs on the fleet, off the Claude cap)." },
    ],
  },
  {
    label: "Dev & Ship",
    accent: "bg-sky-400",
    tools: [
      { cmd: "/qa", use: "QA a UI feature before calling it done." },
      { cmd: "/ship", use: "The ship pipeline (secret scan, build, PR)." },
      { cmd: "/review", use: "Code review a change against the plan + standards." },
      { cmd: "/investigate", use: "Root-cause a bug before fixing." },
      { cmd: "/vps", use: "Work on the VPS (deploys, the fleet loops, ZOE's runtime)." },
    ],
  },
  {
    label: "ZOE & Agents",
    accent: "bg-violet-400",
    tools: [
      { cmd: "ZOE @zaoclaw_bot", use: "The orchestrator - tasks, captures, brief/reflect, the auto-PR fix pipeline." },
      { cmd: "zoe-zao@agentmail.to", use: "ZOE's own inbox. Reads mail, can catch account signup confirmations (rung 1 of giving ZOE a body)." },
      { cmd: "relay", use: "Hand off between lanes without you being the message bus." },
    ],
  },
];

export function HowIUseMyToolsWidget() {
  return (
    <Card className="p-6">
      <SectionHeader label="How I Use My Tools" accent="blue">
        <span className="text-xs text-white/40">the toolkit we built - front and center</span>
      </SectionHeader>

      <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {GROUPS.map((group) => (
          <div key={group.label}>
            <div className="mb-3 flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${group.accent}`} />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                {group.label}
              </h3>
            </div>
            <ul className="space-y-3">
              {group.tools.map((tool) => (
                <li key={tool.cmd}>
                  <div className="flex items-center gap-2">
                    <code className="rounded bg-slate-900/70 px-1.5 py-0.5 text-[12px] font-medium text-blue-300">
                      {tool.cmd}
                    </code>
                    {tool.isNew && (
                      <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-300">
                        new
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-white/55">{tool.use}</p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}
