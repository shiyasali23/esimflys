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
 * The USD span is marked canonical: it is the price carried in the structured data and
 * the listing currency the catalogue is authored in. It is NOT necessarily the amount
 * charged — `_resolve_charge_currency` in the backend denominates the order in whatever
 * currency the visitor was shown, provided a rate exists and the total clears the payment
 * provider's minimum, and only falls back to USD when it cannot. An earlier version of this
 * comment claimed USD was always the charged currency; that stopped being true when local
 * denomination shipped, and `public/llms.txt` was repeating the same stale claim to AI
 * crawlers until it was corrected alongside this.
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
