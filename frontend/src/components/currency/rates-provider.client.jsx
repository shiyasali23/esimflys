"use client";
import { createContext, useContext } from "react";
import { BASE_CURRENCY } from "@/config/currencies";

/**
 * Carries the FX table from the server layout down to every `<Price>`.
 *
 * `<Price>` is rendered inside 21 client components, so it cannot fetch the table
 * itself — a server-only `await` is impossible there, and one fetch per price would
 * be dozens of requests per page. The root layout fetches once with ISR and this
 * provider distributes the result.
 *
 * The default is USD-only rather than an empty object, so a `<Price>` mounted
 * outside the provider (a test, a stray island) still renders a correct USD price
 * instead of crashing or silently showing nothing.
 */

const FALLBACK = Object.freeze({ rates: Object.freeze({ [BASE_CURRENCY]: 1 }), buffer: 1 });

const RatesContext = createContext(FALLBACK);

export function RatesProvider({ value, children }) {
  return <RatesContext.Provider value={value || FALLBACK}>{children}</RatesContext.Provider>;
}

export function useRates() {
  return useContext(RatesContext);
}

/** The currencies actually on offer — USD first, since it is the canonical one. */
export function useOfferedCurrencies() {
  const { rates } = useRates();
  const codes = Object.keys(rates || {});
  return codes.includes(BASE_CURRENCY)
    ? [BASE_CURRENCY, ...codes.filter((c) => c !== BASE_CURRENCY)]
    : codes;
}
