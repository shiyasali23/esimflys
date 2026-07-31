import { describe, it, expect } from "vitest";
import nextConfig from "../../../next.config.mjs";

/**
 * The same-origin proxy.
 *
 * Both of these are load-bearing and fail silently when wrong, so they are pinned
 * rather than left to a comment:
 *
 *  - the destination's TRAILING SLASH. Next normalises `:path*` without it and
 *    Django's APPEND_SLASH adds it back, which bounces a request between the two
 *    forever (observed: `curl -L` gave up after 50 redirects).
 *
 *  - the destination HOST. The rewrite forwards it as `Host`, and allauth builds
 *    the Google `redirect_uri` from that header. `127.0.0.1` produces a callback on
 *    a different host than the browser session, so the session cookie Django sets
 *    is scoped away from `localhost:3000` and sign-in appears to succeed while the
 *    app still sees a signed-out user. Cookies ignore the port, so `localhost:8000`
 *    and `localhost:3000` share them; `127.0.0.1:8000` does not.
 */
describe("the backend proxy", () => {
  it("routes the API and the allauth flow", async () => {
    const rewrites = await nextConfig.rewrites();
    expect(rewrites.map((r) => r.source)).toEqual(
      expect.arrayContaining(["/api/v1/:path*", "/accounts/:path*"]),
    );
  });

  it("keeps the trailing slash on every destination", async () => {
    const rewrites = await nextConfig.rewrites();
    for (const rule of rewrites) {
      expect(rule.destination.endsWith("/")).toBe(true);
    }
  });

  it("targets localhost, never 127.0.0.1", async () => {
    const rewrites = await nextConfig.rewrites();
    for (const rule of rewrites) {
      expect(rule.destination).not.toContain("127.0.0.1");
      expect(new URL(rule.destination.replace(/:path\*.*/, "")).hostname).toBe("localhost");
    }
  });

  // Next's own 308 would strip the slash before the rewrite ever ran.
  it("leaves trailing-slash normalisation to Django", () => {
    expect(nextConfig.skipTrailingSlashRedirect).toBe(true);
  });
});
