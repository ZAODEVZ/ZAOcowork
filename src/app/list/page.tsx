import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ICM context boxes - The ZAO",
  description:
    "AI-readable context boxes for The ZAO ecosystem. Point any assistant (ChatGPT, Claude, Cursor) at a box and it instantly understands the project.",
};

interface Box {
  name: string;
  id: string;
  handle: string;
  desc: string;
  hash: string;
}

// Source of truth for box content: bettercallzaal/ZAOOS research/identity/icm-boxes/
const BOXES: Box[] = [
  {
    name: "The ZAO",
    id: "thezao",
    handle: "thezao",
    desc: "The decentralized impact network (ZAO = ZTalent Artist Organization) - mission, Respect/Fractal governance, production lanes.",
    hash: "icm_wkJvcyrDUl999kJdqUB_dg",
  },
  {
    name: "Zaal (BetterCallZaal)",
    id: "bettercallzaal",
    handle: "bettercallzaal",
    desc: "Founder of The ZAO - who he is, what he runs, how he operates, links.",
    hash: "icm_07XkRrWam3vO9u5nbJEahg",
  },
  {
    name: "ZABAL Games",
    id: "zabalgamez",
    handle: "zabalgamez",
    desc: "The ZAO's 3-month build-a-thon - tracks, the June/July/August arc, how to enter.",
    hash: "icm_PiCDHNNZ3WZpNoF59OA8Dw",
  },
  {
    name: "WaveWarZ",
    id: "wavewarz",
    handle: "wavewarz",
    desc: "Live-traded music battles - artists battle, fans trade and earn. A ZAO front door.",
    hash: "icm_dMc9jOsP91lAjxkGFhoxDg",
  },
  {
    name: "ZAO Assistant",
    id: "zao-assistant",
    handle: "zao-assistant",
    desc: "The AI operator layer - what it can do, the operating rules, where context lives. Point a fresh assistant here.",
    hash: "icm_3_kBodVZqijpMtjXSqGBXw",
  },
  {
    name: "Farcaster (knowledge)",
    id: "farcaster",
    handle: "farcaster",
    desc: "General Farcaster protocol knowledge - the Neynar era, the primitives - plus the ZAO's Farcaster footprint.",
    hash: "icm_bnMUjrLlbSpcYLiuZ-V_NQ",
  },
];

const humanUrl = (hash: string) => `https://useicm.com/icm/${hash}`;
const llmUrl = (hash: string) => `https://useicm.com/api/objects/${hash}/llm.txt`;

export default function ListPage() {
  return (
    <main className="min-h-screen bg-zao-navy text-slate-100">
      <div className="mx-auto max-w-3xl px-5 py-14 sm:py-20">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-zao-gold">
          The ZAO / context boxes
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl text-balance">
          AI-readable context boxes
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-slate-300">
          Permanent addresses any AI assistant can read to understand The ZAO. Point ChatGPT,
          Claude, or Cursor at a box and it knows the project - no re-explaining. Built on{" "}
          <a
            href="https://useicm.com"
            className="text-zao-gold underline decoration-zao-gold/40 underline-offset-2"
          >
            useicm.com
          </a>
          . They compose - one box links to the rest.
        </p>

        <ul className="mt-10 flex flex-col gap-3">
          {BOXES.map((b) => (
            <li
              key={b.id}
              className="rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <a
                  href={humanUrl(b.hash)}
                  className="text-lg font-semibold text-white hover:text-zao-gold"
                >
                  {b.name}
                </a>
                <span className="font-mono text-xs text-slate-400">{b.handle}</span>
              </div>
              <p className="mt-1.5 text-[14px] leading-relaxed text-slate-300">{b.desc}</p>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs">
                <a
                  href={humanUrl(b.hash)}
                  className="text-[#6ea8fe] hover:underline underline-offset-2"
                >
                  open box
                </a>
                <a
                  href={llmUrl(b.hash)}
                  className="text-slate-400 hover:text-slate-200 hover:underline underline-offset-2"
                >
                  llm.txt endpoint
                </a>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-12 rounded-xl border border-zao-gold/25 bg-zao-gold/[0.06] p-5">
          <p className="text-sm font-semibold text-white">Use one in your assistant</p>
          <p className="mt-2 text-[14px] leading-relaxed text-slate-300">
            Paste the prompt into any AI chat:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-black/40 p-3 font-mono text-xs text-slate-200">
{`Use thezao as my shareable context box:
https://useicm.com/icm/icm_wkJvcyrDUl999kJdqUB_dg
Read it first, then use it as context for this conversation.`}
          </pre>
        </div>

        <p className="mt-10 font-mono text-xs text-slate-500">
          Source of truth: github.com/bettercallzaal/ZAOOS - research/identity/icm-boxes/
        </p>
      </div>
    </main>
  );
}
