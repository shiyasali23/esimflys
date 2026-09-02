import { CreditCard, ShieldCheck } from "lucide-react";
import site from "@/content/site.json";

/**
 * The card brands and wallets checkout accepts, all processed by Stripe.
 *
 * Rendered as typographic badges rather than the card schemes' own logos, deliberately.
 * Visa, Mastercard, American Express, Apple Pay and Google Pay marks are trademarks with
 * their own usage rules, and hand-redrawing them as inline SVG produces an approximation
 * that is both legally murky and visibly wrong at small sizes. Naming the brands in text is
 * accurate, accessible, weighs nothing, and needs no permission.
 *
 * To use the official marks instead: download the brand assets (Stripe publishes a set for
 * merchants), drop the SVGs into `public/icons/payments/`, and swap the <span> below for an
 * <img> keyed on the method name. The data already lives in `content/site.json`.
 */
export function PaymentBadges({ className }) {
  const { processor, methods } = site.payments;

  return (
    <div className={className}>
      <ul className="flex flex-wrap items-center gap-2">
        {methods.map((m) => (
          <li
            key={m}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-label-bold uppercase tracking-wide text-muted-foreground"
          >
            <CreditCard className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
            {m}
          </li>
        ))}
      </ul>
      <p className="mt-3 inline-flex items-center gap-1.5 text-body-sm text-muted-foreground">
        <ShieldCheck className="h-4 w-4 shrink-0 text-cta-text" aria-hidden />
        Payments are processed by {processor}. Card details never reach our servers.
      </p>
    </div>
  );
}
