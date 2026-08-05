import { formatMinor } from "@/lib/format/money";

/**
 * An amount that is ALREADY denominated — an order total, a payment, a commission.
 *
 * The counterpart to `<Price>`, and the distinction is the whole point:
 *
 * - `<Price usd={…}>` is a **catalogue** price. It is authored in USD, and the shopper
 *   has not committed to anything yet, so it is converted into whichever currency they
 *   are browsing in.
 * - `<Money minor={…} currency={…}>` is a **recorded** amount. The server already
 *   decided its currency and will honour that exact figure. It is formatted, never
 *   converted.
 *
 * Passing a recorded amount to `<Price>` converts an already-converted number a second
 * time: an INR order total would be multiplied by the INR rate again. Every money field
 * the API returns arrives with its own `currency` alongside it, so there is never a
 * reason to guess.
 *
 * @param {{ minor: number, currency: string, className?: string }} props
 */
export function Money({ minor, currency, className }) {
  return (
    <span className={`tabular-nums ${className || ""}`}>{formatMinor(minor, currency)}</span>
  );
}
