import { NextRequest, NextResponse } from "next/server";

// Map paper slugs to titles and descriptions
const paperMetadata: Record<
  string,
  { title: string; subtitle: string; accentColor: string }
> = {
  "what-is-the-zao": {
    title: "What is The ZAO?",
    subtitle: "A decentralized impact network returning profit, data, and IP to artists",
    accentColor: "#f5a623",
  },
  whitepaper: {
    title: "The ZAO Whitepaper",
    subtitle: "The vision, governance model, and production lanes",
    accentColor: "#f5a623",
  },
  technical: {
    title: "The ZAO Technical Whitepaper",
    subtitle: "Respect, Fibonacci, OREC, and on-chain governance",
    accentColor: "#f5a623",
  },
  manifesto: {
    title: "The ZAO Manifesto",
    subtitle: "Five commitments. The permanent creed.",
    accentColor: "#f5a623",
  },
  "the-zao-protocol": {
    title: "The ZAO Protocol",
    subtitle: "Creator-economy dominance through decentralized impact networks",
    accentColor: "#f5a623",
  },
  wavewarz: {
    title: "The WaveWarZ Whitepaper",
    subtitle: "Live-traded music battles where artists are paid instantly",
    accentColor: "#f5a623",
  },
  "coc-concertz": {
    title: "COC Concertz Whitepaper",
    subtitle: "Recurring live concerts bringing independent artists and Web3 communities together",
    accentColor: "#f5a623",
  },
  history: {
    title: "The ZAO History",
    subtitle: "A dated index of what The ZAO has actually shipped",
    accentColor: "#f5a623",
  },
  fishbowlz: {
    title: "FISHBOWLZ Whitepaper",
    subtitle: "Persistent audio rooms with hot seat rotation and live transcription",
    accentColor: "#f5a623",
  },
  poidh: {
    title: "poidh Whitepaper",
    subtitle: "An on-chain bounty platform that turns creative moments into paid work",
    accentColor: "#f5a623",
  },
  zabalgamez: {
    title: "ZABAL Games Whitepaper",
    subtitle: "A Farcaster-native builder onboarding event - ship real, earn Respect",
    accentColor: "#f5a623",
  },
  "zabal-token": {
    title: "ZABAL Token Whitepaper",
    subtitle: "The front-end coordination token for The ZAO ecosystem",
    accentColor: "#f5a623",
  },
  songjam: {
    title: "SongJam Whitepaper",
    subtitle: "Live audio spaces for the ZABAL community",
    accentColor: "#f5a623",
  },
  "zao-newsletter": {
    title: "The ZAO Newsletter Whitepaper",
    subtitle: "The daily build-in-public log of The ZAO ecosystem",
    accentColor: "#f5a623",
  },
  zuke: {
    title: "Zuke Whitepaper",
    subtitle: "The ZAO's audio-spaces app, wired into the content pipeline",
    accentColor: "#f5a623",
  },
  zounz: {
    title: "ZOUNZ Whitepaper",
    subtitle: "An ERC-721 NFT DAO on Base governing the ZABAL token treasury",
    accentColor: "#f5a623",
  },
  "zao-festivals": {
    title: "ZAO Festivals Whitepaper",
    subtitle: "The in-real-life arm of The ZAO",
    accentColor: "#f5a623",
  },
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ paper: string }> }
) {
  const { paper } = await params;
  const meta = paperMetadata[paper];

  if (!meta) {
    return NextResponse.json({ error: "Paper not found" }, { status: 404 });
  }

  // Generate a simple SVG OG image
  const svg = `
    <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#141e27;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#1b2732;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="1200" height="630" fill="url(#grad)"/>
      <rect width="1200" height="630" fill="url(#grad)" opacity="0.5"/>

      <!-- Accent line -->
      <rect x="0" y="80" width="1200" height="3" fill="${meta.accentColor}"/>

      <!-- Title -->
      <text x="60" y="220" font-family="system-ui, -apple-system, sans-serif" font-size="72" font-weight="800" fill="#e8e4c4" letter-spacing="-1">
        <tspan>${escapeXml(meta.title.substring(0, 25))}</tspan>
        ${meta.title.length > 25 ? `<tspan x="60" dy="80">${escapeXml(meta.title.substring(25))}</tspan>` : ""}
      </text>

      <!-- Subtitle -->
      <text x="60" y="400" font-family="system-ui, -apple-system, sans-serif" font-size="28" fill="#e8e4c4" fill-opacity="0.7" font-weight="400">
        <tspan>${escapeXml(meta.subtitle.substring(0, 60))}</tspan>
        ${meta.subtitle.length > 60 ? `<tspan x="60" dy="40">${escapeXml(meta.subtitle.substring(60))}</tspan>` : ""}
      </text>

      <!-- Footer -->
      <text x="60" y="580" font-family="system-ui, -apple-system, sans-serif" font-size="18" fill="#e8e4c4" fill-opacity="0.5">thezao.xyz/papers</text>

      <!-- Accent dot -->
      <circle cx="1140" cy="60" r="20" fill="${meta.accentColor}"/>
    </svg>
  `;

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600, immutable",
    },
  });
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
