/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      // The ZAO papers - static reading pages served from public/
      { source: '/papers', destination: '/papers.html' },
      { source: '/papers/technical', destination: '/papers/technical.html' },
      { source: '/papers/manifesto', destination: '/papers/manifesto.html' },
      { source: '/papers/drafts', destination: '/papers/drafts/index.html' },
      { source: '/papers/team', destination: '/papers/team/index.html' },
      // Main whitepaper reading page (kept; the /papers index links to it)
      { source: '/paper', destination: '/paper.html' },
      // Canonical GEO front door - static paper, not a React route, so it's
      // one source of truth like the rest of the papers (was a bespoke
      // src/app/what-is-the-zao/page.tsx with a hardcoded FAQ array; that
      // duplicated facts that live in the other papers and drifted from them).
      { source: '/what-is-the-zao', destination: '/papers/what-is-the-zao.html' },
    ];
  },
};

export default nextConfig;
