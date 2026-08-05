"use client";
import { create } from "zustand";
import { BASE_CURRENCY } from "@/config/currencies";
import { updateMe } from "@/lib/api/session";
import { useSession } from "@/features/auth/use-session.client";

/**
 * The active display currency.
 *
 * Resolution order, highest first:
 *
 *   1. explicit picker      — the `cur` cookie
 *   2. account preference   — `preferred_currency` on /account/me/
 *   3. country              — the visitor's locale region
 *   4. USD
 *
 * Steps 1, 3 and 4 run before paint in `NoFlashCurrencyScript`, because a price that
 * repaints after hydration is worse than a slightly stale one. This store owns the
 * two things that cannot happen that early: reacting to the picker, and applying the
 * account preference once a session is known.
 *
 * An explicit choice always wins. Someone who picked GBP while travelling did so
 * knowingly, and quietly overriding it from their profile on the next page is the
 * kind of "helpful" behaviour that reads as a bug.
 */

const COOKIE = "cur";
const ONE_YEAR_SECONDS = 31536000;

function readCookieCurrency() {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;)\s*cur=([A-Z]{3})/);
  return match ? match[1] : null;
}

function apply(code) {
  document.documentElement.setAttribute("data-currency", code);
}

export const useCurrency = create((set, get) => ({
  currency: BASE_CURRENCY,
  /** True once the visitor has chosen a currency themselves. */
  explicit: false,

  /** Adopt whatever the pre-paint script already decided. Never re-decides it. */
  init() {
    if (typeof document === "undefined") return;
    const fromDom = document.documentElement.getAttribute("data-currency");
    set({ currency: fromDom || BASE_CURRENCY, explicit: Boolean(readCookieCurrency()) });
  },

  /**
   * The picker. Writes the cookie so the choice survives a reload and is applied
   * before paint next time, and mirrors it to the account so it follows the person
   * to another device.
   */
  select(code, offered = []) {
    if (!offered.includes(code) || code === get().currency) return;

    document.cookie = `${COOKIE}=${code};path=/;max-age=${ONE_YEAR_SECONDS};samesite=lax`;
    apply(code);
    set({ currency: code, explicit: true });

    // Only for signed-in visitors: a guest would get a guaranteed 403, and the
    // cookie has already captured the choice for them.
    if (useSession.getState().user) {
      updateMe({ preferredCurrency: code }).catch(() => {});
    }
  },

  /** Step 2 of the chain. Yields to an explicit choice and to an unavailable currency. */
  applyAccountPreference(code, offered = []) {
    if (get().explicit || !code || code === get().currency) return;
    if (!offered.includes(code)) return;
    apply(code);
    set({ currency: code });
  },
}));
