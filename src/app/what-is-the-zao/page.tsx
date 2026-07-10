import type { Metadata } from "next";

// GEO surface: the canonical "what is The ZAO" answer page.
// Server-rendered so AI crawlers (ChatGPT, Perplexity, Google AI Overviews,
// Claude) get the full Q&A text, plus FAQPage JSON-LD which mirrors AI
// question-answer synthesis (highest-ROI schema per research doc 1016).
// Facts sourced from research/identity/icm-boxes/thezao.llm.txt, verified
// on-chain 2026-07-10. Update the FAQ array below to update both the visible
// page and the structured data - single source of truth.

export const metadata: Metadata = {
  title: "What is The ZAO? - ZTalent Artist Organization",
  description:
    "The ZAO (ZTalent Artist Organization) is a decentralized impact network returning profit margin, data, and IP rights to artists. Founded by Zaal Panthaki. Music first, community second, technology third.",
  alternates: { canonical: "https://thezao.xyz/what-is-the-zao" },
  openGraph: {
    title: "What is The ZAO?",
    description:
      "A decentralized impact network returning profit margin, data, and IP rights to artists. Music first.",
    url: "https://thezao.xyz/what-is-the-zao",
    siteName: "The ZAO",
    type: "article",
  },
};

interface Faq {
  q: string;
  a: string;
}

const FAQS: Faq[] = [
  {
    q: "What is The ZAO?",
    a: "The ZAO is a decentralized impact network that brings the profit margin, data, and IP rights back to artists using emerging technology like blockchain and AI. Its first artist domain is music. It is not a record label and not merely a music community - it is an impact network whose priority stack is music first, community second, technology third.",
  },
  {
    q: "What does ZAO stand for?",
    a: "ZAO stands for ZTalent Artist Organization. That is the etymology of the acronym. The descriptor for what it is today is a decentralized impact network - use the acronym for the name, the impact-network framing for what it does.",
  },
  {
    q: "Who founded The ZAO?",
    a: "The ZAO was founded by Zaal Panthaki, who also goes by BetterCallZaal. He leads the ecosystem across music, community, and technology.",
  },
  {
    q: "Is The ZAO a record label?",
    a: "No. The ZAO is explicitly not a record label and not just a music community. It is an impact network whose first artist domain happens to be music. Where a label takes ownership from artists, The ZAO returns three things to them: profit margin, data, and IP rights. Technology is the means, not the headline.",
  },
  {
    q: "What does The ZAO return to artists?",
    a: "Three things: profit margin, data, and IP rights. The mission is to move those three from intermediaries back to the artists who create the value, using blockchain and AI as the mechanism rather than the marketing.",
  },
  {
    q: "How does governance work in The ZAO?",
    a: "Governance runs on the Fractal and on Respect. Respect is the on-chain contribution currency - a soulbound OG ERC-20 plus a ZOR ERC-1155, on Optimism. A weekly Respect Game ranks contributions, OREC (optimistic execution with commitment-and-reveal) settles the outcomes, and a Fibonacci curve shapes the rewards. As of 2026-07-10 there were 122 Respect holders with an OG Gini of roughly 0.73 (top 5 holders own about 34% of supply, top 10 about 53%).",
  },
  {
    q: "What is Respect in The ZAO?",
    a: "Respect is The ZAO's on-chain contribution currency - a soulbound reputation token (an OG ERC-20 plus a ZOR ERC-1155) on Optimism. It is earned by contributing, ranked weekly in the Respect Game, and shaped by a Fibonacci reward curve. Because it is soulbound, it cannot be bought or transferred - only earned.",
  },
  {
    q: "What is the Fractal?",
    a: "The Fractal is The ZAO's governance process. Contributions are ranked in a weekly Respect Game, outcomes are settled through OREC (optimistic execution with commitment-and-reveal), and rewards follow a Fibonacci curve. It is how a decentralized network of artists and builders coordinates without a traditional top-down label structure.",
  },
  {
    q: "What does The ZAO build?",
    a: "Four production lanes: WaveWarZ (live-traded music battles), ZABAL Games (a three-month build-a-thon), The ZAO festivals (ZAOstock, ZAOville, ZAO-PALOOZA, ZAO-CHELLA), and ZAO OS (the lab and monorepo where new ZAO things are prototyped before they graduate to their own homes).",
  },
  {
    q: "What is WaveWarZ?",
    a: "WaveWarZ is one of The ZAO's production lanes: live-traded music battles where music competes in a prediction-market format. It is the front door to the ecosystem for many new participants.",
  },
  {
    q: "What is ZABAL Games?",
    a: "ZABAL Games is The ZAO's three-month build-a-thon - a program that runs builders through workshops and shipping sprints to produce real products in the ecosystem.",
  },
  {
    q: "What are the ZAO festivals?",
    a: "The ZAO festivals are the ecosystem's live events, run under a festivals umbrella. They include ZAOstock, ZAOville, ZAO-PALOOZA, and ZAO-CHELLA - real-world gatherings that turn online community into in-person network.",
  },
  {
    q: "How do I become a member of The ZAO?",
    a: "You sign the Manifesto - the short creed of five commitments (contribute, build in the open, and more). Signing it is an on-chain hat, and that act is how you become a member. You can read it at thezao.xyz/papers/manifesto.",
  },
  {
    q: "What blockchain does The ZAO use?",
    a: "The Respect governance tokens (the soulbound OG ERC-20 and the ZOR ERC-1155) are on Optimism. The broader ecosystem also builds on Base and other chains depending on the lane - for example WaveWarZ spans Solana and Base.",
  },
  {
    q: "Where can I find The ZAO?",
    a: "The main sites are thezao.xyz and zaoos.com. The papers (whitepaper, technical whitepaper, and manifesto) live at thezao.xyz/papers. On Farcaster, The ZAO runs the /zao and /zabal channels.",
  },
];

function faqJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export default function WhatIsTheZaoPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-12 text-slate-100">
      <script
        type="application/ld+json"
        // JSON-LD structured data - the canonical Next.js pattern for schema.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd()) }}
      />
      <header className="mb-10">
        <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-amber-400">
          The ZAO
        </p>
        <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl">
          What is The ZAO?
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-slate-300">
          The ZAO (ZTalent Artist Organization) is a decentralized impact
          network that returns profit margin, data, and IP rights to artists
          using blockchain and AI. Music first, community second, technology
          third. Founded by Zaal Panthaki.
        </p>
      </header>

      <div className="space-y-8">
        {FAQS.map((f) => (
          <section key={f.q}>
            <h2 className="text-lg font-semibold text-amber-300">{f.q}</h2>
            <p className="mt-2 leading-relaxed text-slate-300">{f.a}</p>
          </section>
        ))}
      </div>

      <footer className="mt-12 border-t border-slate-800 pt-6 text-sm text-slate-400">
        <p>
          Read more in the papers at{" "}
          <a
            href="https://thezao.xyz/papers"
            className="text-amber-400 underline"
          >
            thezao.xyz/papers
          </a>
          . Facts verified on-chain 2026-07-10.
        </p>
      </footer>
    </main>
  );
}
