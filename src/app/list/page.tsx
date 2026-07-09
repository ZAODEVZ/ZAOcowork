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
  { name: "The ZAO", handle: "thezao", hash: "icm_ohb0F_XOYDz9Tw_w4yX3PA", desc: "The decentralized impact network (ZAO = ZTalent Artist Organization) - mission, Respect/Fractal governance, production lanes." },
  { name: "Zaal (BetterCallZaal)", handle: "bettercallzaal", hash: "icm_r1ZHKeAdS9UNt4oz7n6HRA", desc: "Founder of The ZAO - who he is, what he runs, how he operates, links." },
  { name: "ZABAL Games", handle: "zabalgamez", hash: "icm_6EcindcuwxlkMO7-lT83cQ", desc: "The ZAO's 3-month build-a-thon - tracks, the June/July/August arc, how to enter." },
  { name: "WaveWarZ", handle: "wavewarz", hash: "icm_RxT9r-_IjG1U9kxOniSzFQ", desc: "Live-traded music battles - artists battle, fans trade and earn. A ZAO front door." },
  { name: "ZAO Festivals", handle: "zao-festivals", hash: "icm_5JRCZhz7S4C3yo5c27ElNA", desc: "The IRL live-culture arm - ZAOstock (Oct 3 2026, Ellsworth ME), ZAOville, ZAO-PALOOZA, ZAO-CHELLA." },
  { name: "COC Concertz", handle: "coc-concertz", hash: "icm_PmXTIAro8llyOv9LCJ-LZw", desc: "The ZAO's live concert series - numbered editions putting independent artists on stage." },
  { name: "The ZAO Newsletter", handle: "zao-newsletter", hash: "icm_C2TnmeXV0tcs6QkGbc2sGA", desc: "The daily build log on Paragraph - the strict voice + how it runs." },
  { name: "Zuke (ZAO Spaces)", handle: "zuke", hash: "icm_RF7Y6H1bkbn5NujhB2pI0A", desc: "The ZAO's audio-spaces app (Juke-integrated) - hosts + records community spaces." },
  { name: "Fractal + Respect", handle: "fractal", hash: "icm_4YDB03ZKwFxsSumnzeYh0A", desc: "ZAO governance - Respect (soulbound), the weekly Respect Game, OREC on-chain execution." },
  { name: "POIDH @ ZAO", handle: "poidh", hash: "icm_1CRn7Oyvee1jDSK9kje7dw", desc: "ZAO's on-chain clip-up + creative bounties on Base (with Kenny's POIDH)." },
  { name: "ZAO Assistant", handle: "zao-assistant", hash: "icm_-hsPHePpqX01RovoB_SEqA", desc: "The AI operator layer - capabilities, operating rules, where context lives. Point a fresh assistant here." },
  { name: "Farcaster (knowledge)", handle: "farcaster", hash: "icm_IrttNJQlfVyaC1hFkPmW-w", desc: "General Farcaster protocol knowledge (the Neynar era) + the ZAO's Farcaster footprint." },
  { name: "Loop Engineering (knowledge)", handle: "loop-engineering", hash: "icm_7knlj4KZlzS8wqumf-8A0w", desc: "How autonomous agents run - the 5 loops, the Karpathy method - mapped to how ZAO runs ZOE." },
  { name: "Milk Road (reference)", handle: "milk-road", hash: "icm_OGk1tBJqRQe9kpsIK3yxSw", desc: "The crypto newsletter's growth/monetization playbook, studied for The ZAO Newsletter." },
];

const humanUrl = (hash: string) => `https://useicm.com/icm/${hash}`;
const llmUrl = (hash: string) => `https://useicm.com/api/objects/${hash}/llm.txt`;

export default function ListPage() {
  return (
    <main className="min-h-screen bg-[#0a1628] text-slate-100">
      <div className="mx-auto max-w-3xl px-5 py-14 sm:py-20">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#f5a623]">
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
            className="text-[#f5a623] underline decoration-[#f5a623]/40 underline-offset-2"
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
                  className="text-lg font-semibold text-white hover:text-[#f5a623]"
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

        <div className="mt-12 rounded-xl border border-[#f5a623]/25 bg-[#f5a623]/[0.06] p-5">
          <p className="text-sm font-semibold text-white">Use one in your assistant</p>
          <p className="mt-2 text-[14px] leading-relaxed text-slate-300">
            Paste the prompt into any AI chat:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-black/40 p-3 font-mono text-xs text-slate-200">
{`Use thezao as my shareable context box:
https://useicm.com/icm/icm_ohb0F_XOYDz9Tw_w4yX3PA
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
