/** @type {import('next').NextConfig} */
const nextConfig = {
  // Canonicalize the mockup's /plans routes → /destinations (blueprint §28.3). Single-hop 308.
  async redirects() {
    return [
      { source: "/plans", destination: "/destinations", permanent: true },
      { source: "/plans/:slug", destination: "/esim/:slug", permanent: true },
      { source: "/destinations/:slug", destination: "/esim/:slug", permanent: true },
    ];
  },
  images: {
    formats: ["image/avif", "image/webp"],
    // Owned/CDN hosts go here later. No remote hosts today (flags are local).
    remotePatterns: [],
  },
};

export default nextConfig;
