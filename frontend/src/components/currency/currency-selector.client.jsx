"use client";
import { useEffect } from "react";
import { ChevronDown, Globe } from "lucide-react";
import { cn } from "@/lib/cn";
import { useCurrency } from "./use-currency.client";
import { useOfferedCurrencies } from "./rates-provider.client";

/**
 * The currency picker.
 *
 * Only lists currencies the backend is currently quoting. A currency whose rate has
 * gone stale is withdrawn upstream rather than charged on an old number, so offering
 * it here would let someone select a currency that has no price to show.
 *
 * The picker hides itself when USD is the only option — a one-item dropdown is noise,
 * and it happens whenever the FX feed is unavailable.
 */
export function CurrencySelector({ className, overHero = false }) {
  const currency = useCurrency((s) => s.currency);
  const init = useCurrency((s) => s.init);
  const select = useCurrency((s) => s.select);
  const offered = useOfferedCurrencies();

  useEffect(() => {
    init();
  }, [init]);

  if (offered.length < 2) return null;

  return (
    <div
      className={cn(
        "relative inline-flex h-8 items-center rounded-full border font-body text-sm font-semibold transition-colors focus-within:ring-2 focus-within:ring-ring sm:h-9",
        overHero
          ? "border-white/40 bg-white/10 text-white hover:bg-white/20"
          : "border-border bg-transparent text-foreground hover:bg-muted",
        className,
      )}
    >
      <Globe className="pointer-events-none absolute left-3 hidden h-4 w-4 opacity-80 sm:block" aria-hidden />
      <select
        value={currency}
        onChange={(event) => select(event.target.value, offered)}
        aria-label="Display currency"
        /*
          `text-base` is load-bearing, not cosmetic: Safari on iOS zooms the whole viewport
          when a form control smaller than 16 px receives focus, and leaves it zoomed. This
          select inherited the wrapper's 14 px, so opening the currency picker rescaled the
          page around it.
          Measured 14 px on the live site. It is the only form control on the page under
          16 px. The wrapper hides it below `md`, so this bites on tablets and on a phone in
          landscape rather than in portrait — narrower than it sounds, but the fix is two
          pixels on a three-letter code inside an `h-9` pill, which still fits.
        */
        className="h-full cursor-pointer appearance-none bg-transparent pl-3 pr-8 text-base text-inherit focus:outline-none focus-visible:outline-none sm:pl-9 sm:pr-9"
      >
        {offered.map((code) => (
          <option key={code} value={code} className="bg-white font-medium text-foreground">
            {code}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 h-4 w-4 opacity-80 sm:right-3" aria-hidden />
    </div>
  );
}
