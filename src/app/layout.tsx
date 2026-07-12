import "./globals.css";
import type { Metadata, Viewport } from "next";

// Custom domain thezao.xyz lives here (Vercel project: thezao/za-ocowork).
// metadataBase + openGraph make link previews on Farcaster / X / Telegram /
// Slack point at the real domain and show the right title + description.
// Em-dashes stripped per the global no-em-dash rule.
export const metadata: Metadata = {
  metadataBase: new URL("https://thezao.xyz"),
  title: "The ZAO Co-Works",
  description:
    "Operational tracker for The ZAO ecosystem teams - tasks synced across the web board and @ZAOcoworkingBot on Telegram. Brand-tagged across ZAOstock, ZABAL Games, WaveWarZ, BCZ Strategies, and more.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Zao Works",
  },
  openGraph: {
    title: "The ZAO Co-Works",
    description:
      "One board for every ZAO ecosystem brand - tasks, sync with Telegram, brand filters, ping a teammate.",
    url: "https://thezao.xyz",
    siteName: "The ZAO Co-Works",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "The ZAO Co-Works",
    description:
      "One board for every ZAO ecosystem brand - tasks, sync with Telegram, brand filters, ping a teammate.",
  },
};

export const viewport: Viewport = {
  themeColor: "#041225",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

// Organization structured data - site-wide. Gives AI answer engines
// (ChatGPT, Perplexity, Google AI Overviews, Claude) a grounded entity for
// "The ZAO". Facts from research/identity/icm-boxes/thezao.llm.txt.
const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "The ZAO",
  alternateName: "ZTalent Artist Organization",
  url: "https://thezao.xyz",
  description:
    "A decentralized impact network returning profit margin, data, and IP rights to artists using blockchain and AI. Music first, community second, technology third.",
  founder: { "@type": "Person", name: "Zaal Panthaki", alternateName: "BetterCallZaal" },
  sameAs: ["https://zaoos.com", "https://warpcast.com/~/channel/zao"],
};

// FAQPage structured data for GEO (AI answer engines). Questions grounded in
// verified facts from llms.txt and the what-is-the-zao paper.
const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is The ZAO?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The ZAO (ZTalent Artist Organization) is a decentralized impact network founded by Zaal Panthaki in 2022. It brings profit margin, data, and IP rights back to artists using blockchain and AI. The ZAO is not a record label or music community, but an impact network whose first artist domain is music. It prioritizes: music first, community second, technology third.",
      },
    },
    {
      "@type": "Question",
      name: "What is Respect?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Respect is The ZAO's on-chain contribution currency running on the Optimism network. It exists as two token types: a soulbound OG ERC-20 and a ZOR ERC-1155. As of 2026-07-05, there are 156 unique Respect holders (122 OG holders, 55 ZOR holders, 21 holding both). Respect is earned by contributing to The ZAO and participating in the weekly Respect Game.",
      },
    },
    {
      "@type": "Question",
      name: "How is Respect distributed?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The Respect Game runs weekly and ranks contributions using a Fibonacci curve for rewards. Winners are determined through an on-chain voting system called OREC (Optimistic Respect Execution Contract), which has a 72-hour voting window followed by a 72-hour veto window. The game has run unbroken for over 100 weeks since 2024-07-30.",
      },
    },
    {
      "@type": "Question",
      name: "What is the Fractal?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The Fractal is The ZAO's governance model that uses a Fibonacci curve to shape how contributions and rewards are distributed. It represents the fractal nature of impact - small actions compound into larger organizational structures. The Fractal is the foundation of the weekly Respect Game and determines how voting power and rewards are allocated.",
      },
    },
    {
      "@type": "Question",
      name: "What is WaveWarZ?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "WaveWarZ is a live-traded music battle platform where artists compete in real-time. It runs on Solana mainnet and Base testnet, featuring 7 confirmed partners. Players engage in music battles, with live trading of outcomes and prize pools funded by participation. It is one of The ZAO's primary production lanes.",
      },
    },
    {
      "@type": "Question",
      name: "What are the ZABAL Games?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The ZABAL Games is a 3-month build-a-thon running in June, July, and August 2026. It features a curated roster of mentors from the ZAO ecosystem and partners like Magnetiq. Participants are selected to build products, services, and art at the intersection of music and blockchain. The ZABAL Games serve as an incubator for new ventures within The ZAO ecosystem.",
      },
    },
    {
      "@type": "Question",
      name: "What festivals does The ZAO run?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The ZAO operates multiple festivals throughout the year: ZAOstock (October 3, 2026), ZAOville, ZAO-PALOOZA, and ZAO-CHELLA. These are community-driven events that bring ZAO members and partners together to celebrate music, art, and decentralized culture.",
      },
    },
    {
      "@type": "Question",
      name: "Is The ZAO a record label?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. The ZAO is a decentralized impact network, not a record label. Artists retain full IP rights and ownership of their work. The ZAO exists to return three things to artists: profit margin, data rights, and IP control. It uses blockchain and AI as infrastructure, but the artist returns are the core mission.",
      },
    },
    {
      "@type": "Question",
      name: "How do I join The ZAO?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The ZAO is primarily organized on Farcaster, a decentralized social network. Join the /zao and /zabal channels on Farcaster to participate in community discussions. You can also explore The ZAO ecosystem through its website at thezao.xyz and follow updates on Farcaster or X (@bettercallzaal).",
      },
    },
    {
      "@type": "Question",
      name: "What is the legal structure of The ZAO?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The ZAO operates as a decentralized impact network with no single formal legal entity. The operating umbrella is BetterCallZaal Strategies LLC, an operating company. As individual production lanes (like WaveWarZ or ZABAL Games) mature, some spin out their own entities while remaining part of the larger ZAO ecosystem.",
      },
    },
    {
      "@type": "Question",
      name: "What is ZAO OS?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "ZAO OS is the lab and monorepo where new ZAO ecosystem projects are prototyped and incubated. Projects live in the ZAO OS until they reach production maturity, at which point they graduate to their own repositories and domains. ZAO OS also houses approximately 820 research documents that serve as the institutional memory of The ZAO.",
      },
    },
    {
      "@type": "Question",
      name: "How does the on-chain governance work?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The ZAO uses a multi-layer governance system: Respect holders vote on-chain (OREC settlement), while important decisions also go to Snapshot (decentralized voting) and community forums. Voting results are executed through OREC, which uses a 72-hour voting window plus 72-hour veto window. This optimistic execution approach enables fast, transparent decision-making.",
      },
    },
    {
      "@type": "Question",
      name: "What networks is The ZAO on?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The ZAO's primary blockchain is Optimism, where the Respect token and OREC governance contracts live. WaveWarZ operates on Solana mainnet and Base testnet. The broader ZAO ecosystem uses multiple chains depending on the specific use case, but Optimism is the core governance layer.",
      },
    },
    {
      "@type": "Question",
      name: "Where can I learn more about The ZAO's technology and vision?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The ZAO publishes comprehensive papers at thezao.xyz/papers, including a whitepaper explaining the impact network model, a technical whitepaper detailing the Respect and Fractal systems, and a manifesto outlining the vision. You can also access AI-readable context boxes through ICM (https://useicm.com) and follow research documentation at zaoos.com.",
      },
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      </head>
      <body className="min-h-screen antialiased">
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker'in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){});})}`,
          }}
        />
      </body>
    </html>
  );
}
