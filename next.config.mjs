/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      // The ZAO papers - static reading pages served from public/
      { source: '/papers', destination: '/papers.html' },
      { source: '/papers/technical', destination: '/papers/technical.html' },
      { source: '/papers/manifesto', destination: '/papers/manifesto.html' },
      // Main whitepaper reading page (kept; the /papers index links to it)
      { source: '/paper', destination: '/paper.html' },
    ];
  },
};

export default nextConfig;
