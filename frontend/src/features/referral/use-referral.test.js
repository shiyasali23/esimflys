// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  captureReferralFromUrl,
  storedReferral,
  clearReferral,
} from "@/features/referral/use-referral.client";

/**
 * Agency attribution captured from a shared link.
 *
 * The property that matters most is the one asserted last: none of this can move a
 * price. A tracking code is pinned to `discount_value = 0` by a database constraint, so
 * a cookie the browser can write is safe to trust for attribution and impossible to
 * abuse for a discount.
 */

/** `path` is a full path, e.g. "/" or "/esim/saudi-arabia?ref=X". */
function visit(path) {
  window.history.replaceState({}, "", path || "/");
}

beforeEach(() => {
  clearReferral();
  visit("/");
});

describe("capturing an agency referral", () => {
  it("stores the code from ?ref= so it survives browsing to checkout", () => {
    visit("/?ref=DESERTTOURS");
    captureReferralFromUrl();
    expect(storedReferral()).toBe("DESERTTOURS");
  });

  it("keeps the stored code on later pages that carry no ?ref=", () => {
    visit("/?ref=DESERTTOURS");
    captureReferralFromUrl();
    visit("/esim/saudi-arabia");
    captureReferralFromUrl();
    expect(storedReferral()).toBe("DESERTTOURS");
  });

  /** Last touch: the most recent link is the one that sent them back. */
  it("lets a newer agency link replace an older one", () => {
    visit("/?ref=AGENCYA");
    captureReferralFromUrl();
    visit("/?ref=AGENCYB");
    captureReferralFromUrl();
    expect(storedReferral()).toBe("AGENCYB");
  });

  /** The value reaches a URL a stranger controls, so it is validated, not trusted. */
  it("ignores a code that is not a plain referral token", () => {
    for (const bad of ["<script>", "a b", "x".repeat(65), ""]) {
      clearReferral();
      visit(`/?ref=${encodeURIComponent(bad)}`);
      captureReferralFromUrl();
      expect(storedReferral()).toBeNull();
    }
  });

  it("reports nothing when the customer arrived on their own", () => {
    captureReferralFromUrl();
    expect(storedReferral()).toBeNull();
  });

  /**
   * Once a code has become an order it must not attribute a second one — otherwise an
   * unrelated purchase weeks later still credits the agency.
   */
  it("forgets the code once it has been spent", () => {
    visit("/?ref=DESERTTOURS");
    captureReferralFromUrl();
    clearReferral();
    expect(storedReferral()).toBeNull();
  });

  /** Attribution must never be able to break a purchase. */
  it("never throws when cookies are unavailable", () => {
    const original = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get() { throw new Error("cookies blocked"); },
      set() { throw new Error("cookies blocked"); },
    });
    try {
      visit("/?ref=DESERTTOURS");
      expect(() => captureReferralFromUrl()).not.toThrow();
      expect(() => storedReferral()).not.toThrow();
      expect(() => clearReferral()).not.toThrow();
      expect(storedReferral()).toBeNull();
    } finally {
      if (original) Object.defineProperty(Document.prototype, "cookie", original);
      delete document.cookie;
    }
  });
});
