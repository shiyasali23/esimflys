"use client";
import { BASE_CURRENCY } from "@/config/currencies";
import { formatUsd } from "@/lib/format/money";
import { useRates, useOfferedCurrencies } from "./rates-provider.client";

/**
 * A USD-canonical price, rendered in every offered currency at once.
 *
 * Every currency is emitted as a sibling span and CSS reveals only the one matching
 * `<html data-currency>`, which the no-flash script sets before first paint. Two
 * things fall out of that, both deliberate:
 *
 * - **No flicker and no hydration mismatch.** Nothing re-formats after paint.
 * - **The HTML is currency-agnostic**, so a CDN can cache one copy for everyone and
 *   Googlebot cannot be served a page in a currency it did not ask for. This is why
 *   currency is never resolved server-side or put in a URL.
 *
 * The USD span is marked canonical: it is the price in the structured data and, until
 * the backend denominates orders locally, the price actually charged.
 *
 * @param {{ usd: number, className?: string }} props
 */
export function Price({ usd, className }) {
  const fx = useRates();
  const codes = useOfferedCurrencies();

  return (
    <span className={`price tabular-nums ${className || ""}`}>
      {codes.map((code) => (
        <span key={code} data-c={code} data-canonical={code === BASE_CURRENCY || undefined}>
          {formatUsd(usd, code, fx)}
        </span>
      ))}
    </span>
  );
}
