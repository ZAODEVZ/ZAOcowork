/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Ensure data/actions.json is bundled into Vercel serverless functions
    outputFileTracingIncludes: {
      "/**": ["./data/**/*"],
    },
  },
};

export default nextConfig;
