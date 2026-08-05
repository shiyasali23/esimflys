"use client";
import { useEffect } from "react";
import { useSession } from "@/features/auth/use-session.client";
import { useCurrency } from "./use-currency.client";
import { useOfferedCurrencies } from "./rates-provider.client";

/**
 * Applies the account's `preferred_currency` once a session is known.
 *
 * Deliberately **passive**: it reads the session store but never calls `load()`.
 * Public pages currently make no `/account/me/` request at all, and adding one here
 * would put an uncached, authenticated round-trip on every storefront page just to
 * pick a currency symbol.
 *
 * That costs nothing in practice. Signing in populates the store, this effect fires,
 * and the resulting cookie carries the preference to every later page — including
 * public ones — with no further requests. The account value is the cross-device
 * seed; the cookie is what does the work.
 *
 * Renders nothing.
 */
export function AccountCurrencySync() {
  const user = useSession((s) => s.user);
  const init = useCurrency((s) => s.init);
  const applyAccountPreference = useCurrency((s) => s.applyAccountPreference);
  const offered = useOfferedCurrencies();

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (!user?.preferred_currency) return;
    applyAccountPreference(user.preferred_currency, offered);
  }, [user, offered, applyAccountPreference]);

  return null;
}
