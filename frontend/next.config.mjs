/**
 * `localhost`, not `127.0.0.1` — the host here is load-bearing, not cosmetic.
 *
 * The rewrite forwards this as the `Host` header, and allauth builds the Google
 * `redirect_uri` from it. With `127.0.0.1` the callback lands on a different host
 * than the browser session (which lives on `localhost:3000`), so the session cookie
 * Django sets during the callback is scoped to `127.0.0.1` and never reaches the
 * frontend: sign-in appears to succeed while the app still sees a signed-out user.
 */
const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN || "http://localhost:8000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * Next strips trailing slashes by default (308); Django REST adds them back (301).
   * Left alone the two normalisations bounce a proxied API call between :3000 and
   * :8000 forever. Disabling Next's redirect lets the URL reach the rewrite intact.
   * Our own pages are all slash-less, so nothing else depends on it.
   */
  skipTrailingSlashRedirect: true,
  /**
   * Same-origin proxy. The backend authenticates with HttpOnly SameSite=Lax session
   * cookies, so a cross-origin fetch from :3000 to :8000 would silently drop them.
   * Routing the API under our own origin keeps the cookie same-site and makes CORS
   * irrelevant. `/accounts/` carries the allauth (Google) redirect flow.
   */
  async rewrites() {
    // The destination slash is load-bearing: Next normalises `:path*` without it, and
    // Django's APPEND_SLASH would 301 straight back into a redirect loop.
    return [
      { source: "/api/v1/:path*", destination: `${BACKEND_ORIGIN}/api/v1/:path*/` },
      { source: "/accounts/:path*", destination: `${BACKEND_ORIGIN}/accounts/:path*/` },
    ];
  },
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
