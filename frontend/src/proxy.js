import { NextResponse } from "next/server";
import { currencyForCountry, isSupportedCurrency } from "@/config/currencies";

/**
 * Edge proxy (Next 16 renamed `middleware` → `proxy`). Blueprint §28.8:
 * set a default display currency from the visitor's geo (CDN header) on first
 * visit, so the no-flash script shows the right currency on first paint. The
 * cached HTML is identical for everyone — the cookie only selects which
 * pre-rendered price variant is revealed.
 */
export function proxy(request) {
  const res = NextResponse.next();

  const existing = request.cookies.get("cur")?.value;
  if (!existing || !isSupportedCurrency(existing)) {
    const country =
      request.headers.get("x-vercel-ip-country") ||
      request.headers.get("cf-ipcountry") ||
      "US";
    res.cookies.set("cur", currencyForCountry(country), {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|api).*)"],
};
