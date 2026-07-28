/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      // The ZAO papers - static reading pages served from public/
      { source: '/papers', destination: '/papers.html' },
      { source: '/papers/technical', destination: '/papers/technical.html' },
      { source: '/papers/manifesto', destination: '/papers/manifesto.html' },
      { source: '/papers/the-zao-protocol', destination: '/papers/the-zao-protocol.html' },
      { source: '/papers/drafts', destination: '/papers/drafts/index.html' },
      // The clean URL papers.json advertises for this draft. Without it,
      // /papers/drafts/zaalcaster 404s while the .html form serves 200 - so
      // the canonical URL in the papers index was dead. The page itself is
      // real and already public; only the route was missing.
      { source: '/papers/drafts/zaalcaster', destination: '/papers/drafts/zaalcaster.html' },
      { source: '/papers/team', destination: '/papers/team/index.html' },
      { source: '/papers/team/django', destination: '/papers/team/django.html' },
      { source: '/papers/team/candy', destination: '/papers/team/candy.html' },
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
