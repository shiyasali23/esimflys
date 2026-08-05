/**
 * `localhost`, not `127.0.0.1` — the host here is load-bearing, not cosmetic.
 *
 * The rewrite forwards this as the `Host` header, and allauth builds the Google
 * `redirect_uri` from it. With `127.0.0.1` the callback lands on a different host
 * than the browser session (which lives on `localhost:3000`), so the session cookie
 * Django sets during the callback is scoped to `127.0.0.1` and never reaches the
 * frontend: sign-in appears to succeed while the app still sees a signed-out user.
 */
/**
 * `BACKEND_ORIGIN` is read at BUILD time and baked into the rewrite destinations
 * below, so an unset value cannot be corrected later by the runtime environment.
 * A production build would ship rewrites pointing at `localhost:8000`: every page
 * renders perfectly while cart, checkout, sign-in and Google OAuth are all dead.
 * Fail the build instead of shipping that.
 */
function resolveBackendOrigin() {
  const configured = process.env.BACKEND_ORIGIN;
  if (configured) return configured.replace(/\/$/, "");
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "BACKEND_ORIGIN must be set for a production build. It is baked into the /api/v1 and /accounts rewrites, which carry every authenticated request.",
    );
  }
  return "http://localhost:8000";
}

const BACKEND_ORIGIN = resolveBackendOrigin();

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
  /**
   * `frame-ancestors 'none'` is the load-bearing one: `/account/esims/[id]` renders
   * decrypted eSIM activation credentials, and without it any site can iframe that
   * page and overlay it. `X-Frame-Options` repeats it for older agents.
   *
   * Deliberately NOT a script-src CSP. The app injects inline JSON-LD and a pre-paint
   * currency script, and Next emits its own bootstrap inline — locking those down
   * needs per-request nonces, which needs middleware this app does not have. A CSP
   * with `'unsafe-inline'` would be decoration, so the honest move is to protect what
   * can actually be protected and leave script-src to a later middleware change.
   */
  async headers() {
    const baseline = [
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: 'camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com")',
      },
      // Cloudflare answers http:// itself and that redirect never reaches this Worker,
      // so this header only hardens clients that already arrived over TLS.
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
    ];
    return [
      { source: "/:path*", headers: baseline },
      {
        // Anything behind a session must not sit in a shared or browser cache.
        source: "/:path(account|admin|agency|checkout|auth|orders)/:rest*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
    ];
  },
  images: {
    formats: ["image/avif", "image/webp"],
    // Owned/CDN hosts go here later. No remote hosts today (flags are local).
    remotePatterns: [],
  },
};

export default nextConfig;
