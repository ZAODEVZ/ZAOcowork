import type { MetadataRoute } from "next";

// Public ZAO papers surface only - the board/CRM/meetings/admin routes are
// session-gated and don't belong in a public sitemap. Draft papers under
// public/papers/drafts/ don't have clean-URL rewrites (see next.config.mjs),
// so they're listed with their real .html path.
//
// Next.js serves this at /sitemap.xml automatically (App Router convention -
// no route.ts needed). robots.txt already tells crawlers papers/ is allowed;
// this is what tells them what's actually in there.

const BASE_URL = "https://thezao.xyz";

const CORE_PAGES: Array<{ path: string; priority: number }> = [
  { path: "/", priority: 1.0 },
  { path: "/what-is-the-zao", priority: 1.0 },
  { path: "/paper", priority: 0.9 },
  { path: "/papers", priority: 0.9 },
  { path: "/papers/technical", priority: 0.9 },
  { path: "/papers/manifesto", priority: 0.8 },
  { path: "/papers/the-zao-protocol", priority: 0.8 },
  { path: "/papers/team", priority: 0.5 },
  { path: "/papers/team/django", priority: 0.4 },
  { path: "/papers/team/candy", priority: 0.4 },
];

const DRAFT_SLUGS = [
  "coc-concertz",
  "fishbowlz",
  "history",
  "poidh",
  "songjam",
  "wavewarz",
  "zabal-token",
  "zabalgamez",
  "zao-festivals",
  "zao-newsletter",
  "zounz",
  "zuke",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const core: MetadataRoute.Sitemap = CORE_PAGES.map(({ path, priority }) => ({
    url: `${BASE_URL}${path}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority,
  }));

  const draftsIndex: MetadataRoute.Sitemap = [
    {
      url: `${BASE_URL}/papers/drafts`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.5,
    },
  ];

  const drafts: MetadataRoute.Sitemap = DRAFT_SLUGS.map((slug) => ({
    url: `${BASE_URL}/papers/drafts/${slug}.html`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.3,
  }));

  return [...core, ...draftsIndex, ...drafts];
}
