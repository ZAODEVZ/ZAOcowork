/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      // The ZAO Whitepaper - static reading page served from public/paper.html
      { source: '/paper', destination: '/paper.html' },
    ];
  },
};

export default nextConfig;
