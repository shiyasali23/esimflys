"use client";

/**
 * Agency referral attribution, captured on arrival and replayed at checkout.
 *
 * A travel agency shares `esimflys.com/r/{code}` (optionally `/r/{code}/{country-slug}`).
 * The Worker redirects that to a real page carrying `?ref={code}` and sets a 15-day
 * cookie. This module is the storefront half: it reads either source on any page and
 * keeps the code until the customer buys.
 *
 * It is ATTRIBUTION, never a discount. The code is sent as `promo_code` at order
 * creation and the server decides what it means — a tracking code is pinned to
 * `discount_value = 0` by a database constraint, so this can credit an agency and can
 * never move a price. That is why it is safe for this value to live in a cookie the
 * browser itself can write.
 *
 * Two rules the rest of the app depends on:
 *
 *   1. A code the customer TYPED always wins over one captured from a link. Someone who
 *      deliberately enters a code is making a choice; a cookie from a week ago is not.
 *   2. Attribution must never block a sale. Every function here fails soft — a blocked
 *      cookie jar or a malformed value ends with "no attribution", never an exception on
 *      the checkout path.
 */

const COOKIE = "esf_ref";
const MAX_AGE_DAYS = 15;

/** Mirrors the Worker's own pattern, so a hand-typed URL cannot inject anything odd. */
const VALID = /^[A-Za-z0-9._@-]{1,64}$/;

function readCookie() {
  if (typeof document === "undefined") return null;
  try {
    const hit = document.cookie.split("; ").find((part) => part.startsWith(`${COOKIE}=`));
    if (!hit) return null;
    return decodeURIComponent(hit.slice(COOKIE.length + 1)) || null;
  } catch {
    return null;
  }
}

function writeCookie(code) {
  if (typeof document === "undefined") return;
  try {
    const maxAge = 60 * 60 * 24 * MAX_AGE_DAYS;
    document.cookie = `${COOKIE}=${encodeURIComponent(code)}; path=/; max-age=${maxAge}; samesite=lax`;
  } catch {
    // Safari private mode and blocked jars both throw. The `?ref=` on the current URL
    // still carries this visit, so a purchase made now is attributed anyway.
  }
}

/**
 * Capture `?ref=` from the current URL, if present, and persist it.
 *
 * Last touch wins, deliberately: if a traveller opens agency A's link and later agency
 * B's, the most recent link is the one that sent them back, and re-writing the cookie
 * also refreshes the 15 days.
 *
 * Called once on mount from the storefront shell. Safe to call repeatedly.
 */
export function captureReferralFromUrl() {
  if (typeof window === "undefined") return null;
  let code = null;
  try {
    code = new URLSearchParams(window.location.search).get("ref");
  } catch {
    return readCookie();
  }
  if (code && VALID.test(code)) {
    writeCookie(code);
    return code;
  }
  return readCookie();
}

/** The code to attribute this purchase to, or null. Never throws. */
export function storedReferral() {
  const code = readCookie();
  return code && VALID.test(code) ? code : null;
}

/** Called once a code has become an order, so it cannot attribute a second one. */
export function clearReferral() {
  if (typeof document === "undefined") return;
  try {
    document.cookie = `${COOKIE}=; path=/; max-age=0; samesite=lax`;
  } catch {
    // A cookie that will not clear expires on its own in 15 days.
  }
}
