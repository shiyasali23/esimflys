import { Globe, ShieldCheck, Zap } from "lucide-react";

import { PAYMENT_MARKS } from "@/components/media/payment-marks";
import { SITE } from "@/config/site";
import site from "@/content/site.json";

/**
 * The reassurance band that closes every page, ABOVE the footer.
 *
 * It lived inside `<footer>` and that was the wrong home for it twice over. A footer is
 * navigation and small print — chrome a reader's eye skips — so a trust claim placed
 * there inherits that treatment no matter how it is styled. And structurally it is not
 * footer content at all: "we take these cards, Stripe holds them, we cover 68 countries"
 * is a statement about the product, and it belongs to the page.
 *
 * So it is a section of its own, on its own surface, with the footer beginning after it.
 * The dark band it sits against is what separates page from chrome; the card lifts off
 * that band rather than being another light box on a light page.
 */
export function TrustBand() {
  const { processor, methods } = site.payments;

  return (
    <section aria-label="Payment security and coverage" className="bg-muted/60">
      <div className="mx-auto max-w-6xl px-6 py-10 md:py-12">
        <div className="grid gap-8 rounded-card border border-border bg-card p-6 shadow-l2 md:grid-cols-[1fr_auto_1fr] md:items-center md:gap-10 md:p-8">
          <Claim
            icon={ShieldCheck}
            title="Secure payments"
            body={`Payments processed by ${processor}. Card details never reach our servers.`}
          />

          {/*
            The marks are the middle column and the visual anchor: they are the only part
            of this band a reader recognises without reading, so they get the centre and
            the rules either side rather than being tucked beside a paragraph.
          */}
          <ul className="flex flex-wrap items-center justify-center gap-2.5 md:border-x md:border-border md:px-10">
            {methods.map((method) => {
              const Mark = PAYMENT_MARKS[method];
              return Mark ? <Mark key={method} /> : null;
            })}
          </ul>

          <Claim
            icon={Globe}
            title="Global coverage"
            body={`${SITE.countryCount}+ countries · delivered by email in minutes`}
            className="md:justify-self-end"
          />
        </div>

        {/*
          One line under the card, not a fourth column. Three claims is the most a reader
          takes in at a glance, so the delivery promise sits below as a footnote instead
          of competing with the two above it.
        */}
        <p className="mt-4 flex items-center justify-center gap-2 text-center text-body-sm text-muted-foreground">
          <Zap className="h-4 w-4 shrink-0 text-cta-text" aria-hidden />
          Instant delivery — your QR code and activation details arrive by email, usually
          within a minute of payment.
        </p>
      </div>
    </section>
  );
}

function Claim({ icon: Icon, title, body, className = "" }) {
  return (
    <div className={`flex gap-3.5 ${className}`}>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary-container">
        <Icon className="h-5 w-5 text-primary" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="font-display text-base font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-body-sm leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
