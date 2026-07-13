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
  sameAs: ["https://zaoos.com", "https://farcaster.xyz/~/channel/zao"],
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
