import { ShieldCheck } from "lucide-react";
import site from "@/content/site.json";

/**
 * Short labels for a chip, not the legal names.
 *
 * "American Express" is 16 characters — in a footer column it was wider than the column
 * itself, so it wrapped onto two lines inside its own pill and forced every other badge
 * onto a row of its own. The row read as five stacked boxes, which is what a broken
 * layout looks like. "Amex" is what the card says on the front anyway.
 */
const SHORT = {
  "American Express": "Amex",
};

/**
 * The card brands and wallets checkout accepts, all processed by Stripe.
 *
 * Typographic, not the schemes' own logos, deliberately. Visa, Mastercard, Amex, Apple
 * Pay and Google Pay marks are trademarks with their own usage rules, and hand-redrawing
 * them as inline SVG produces an approximation that is both legally murky and visibly
 * wrong at small sizes — the footer already had one of those, a green-and-yellow triangle
 * standing in for Google Play. Naming the brands in text is accurate, accessible, weighs
 * nothing, and needs no permission.
 *
 * To use the official marks instead: download the brand assets (Stripe publishes a set
 * for merchants), drop the SVGs into `public/icons/payments/`, and swap the <li> content
 * for an <img> keyed on the method name. The data already lives in `content/site.json`.
 */
export function PaymentBadges({ className }) {
  const { processor, methods } = site.payments;

  return (
    <div className={className}>
      <ul className="flex flex-wrap items-center gap-x-2 gap-y-2">
        {methods.map((m) => (
          <li
            key={m}
            className="inline-flex h-7 items-center rounded-md border border-border bg-card px-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground"
          >
            {SHORT[m] ?? m}
          </li>
        ))}
      </ul>
      <p className="mt-3 flex items-start gap-2 text-body-sm text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-cta-text" aria-hidden />
        <span>
          Payments processed by {processor}. Card details never reach our servers.
        </span>
      </p>
    </div>
  );
}
