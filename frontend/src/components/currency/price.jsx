import { SUPPORTED_CURRENCIES, BASE_CURRENCY } from "@/config/currencies";
import { getRates } from "@/config/rates";
import { formatUsd } from "@/lib/format/money";

/**
 * USD-canonical multi-currency price (blueprint §28.8).
 * Renders every supported currency as a sibling span (USD first = canonical);
 * CSS reveals only the one matching <html data-currency>, which the no-flash
 * script sets before first paint. No JS re-formats after paint → no flicker.
 * The USD value is the price used in structured data and what we charge (Phase 1).
 * @param {{ usd: number, className?: string }} props
 */
export function Price({ usd, className }) {
  const rates = getRates();
  return (
    <span className={`price tabular-nums ${className || ""}`}>
      {SUPPORTED_CURRENCIES.map((c) => (
        <span key={c.code} data-c={c.code} data-canonical={c.code === BASE_CURRENCY || undefined}>
          {formatUsd(usd, c.code, rates)}
        </span>
      ))}
    </span>
  );
}
