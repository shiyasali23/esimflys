import Link from "next/link";
import { ChevronRight, Globe, Lock, Mail, ShieldCheck } from "lucide-react";
import { SocialLinks } from "@/components/layout/social-links";
import { PAYMENT_MARKS } from "@/components/media/payment-marks";
import nav from "@/content/nav.json";
import site from "@/content/site.json";
import { SITE } from "@/config/site";

/**
 * The full marketing footer, and a compact one for checkout.
 *
 * A 434px sitemap under a payment form is 400px of exits from a page whose only job is
 * to finish one thing — and on a laptop it was the single reason checkout did not fit on
 * screen. `compact` keeps what a transactional page is actually obliged to carry: the
 * legal links and the copyright.
 */
export function Footer({ compact = false }) {
  const year = new Date().getFullYear();

  if (compact) {
    const legal = nav.footer.find((col) => col.title?.toLowerCase() === "legal")?.links || [];
    return (
      <footer className="border-t border-border bg-background">
        {/*
          `min-h-11` on the links here for the same reason the sitemap columns carry it:
          at `text-body-sm` these render 17px tall, and on the checkout footer they are
          the refund and terms links someone reaches for when a purchase has gone wrong.
          `-my-2` keeps the visual height of the strip unchanged while the target grows.
        */}
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-1 px-6 py-3 text-body-sm text-muted-foreground sm:flex-row sm:gap-2 sm:py-4">
          <p className="py-2 sm:py-0">© {year} {site.brand}</p>
          {legal.length ? (
            <nav aria-label="Legal" className="-my-2 flex gap-1">
              {legal.map((l) => (
                <Link
                  key={l.label}
                  href={l.href}
                  className="inline-flex min-h-11 items-center px-2 transition-colors hover:text-primary"
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          ) : null}
        </div>
      </footer>
    );
  }

  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-6xl px-6 py-12 md:py-16">
      {/*
        FIRST, above the sitemap, not last under it.

        What a shop takes and how it is protected is the reassurance a hesitant buyer is
        looking for, and at the bottom of a 600px footer most people never scroll to it.
        Putting it at the top means it is the first thing the footer says.

        Payment marks run FULL WIDTH rather than inside the brand column. [MEASURED] in a
        five-column grid that column is about 190px, and "American Express" is wider than
        the column on its own — so `flex-wrap` gave every badge a row of its own and the
        result read as five stacked boxes.
      */}
      <div className="mb-10">
        <div className="grid gap-6 rounded-card border border-border bg-muted/40 p-6 md:grid-cols-[1fr_auto_1fr] md:items-center md:gap-8">
          <div className="flex gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary-container">
              <ShieldCheck className="h-[18px] w-[18px] text-primary" aria-hidden />
            </span>
            <div>
              <p className="text-label-bold text-foreground">Secure payments</p>
              <p className="mt-0.5 text-body-sm text-muted-foreground">
                Payments processed by {site.payments.processor}. Card details never reach
                our servers.
              </p>
            </div>
          </div>

          <ul className="flex flex-wrap items-center justify-center gap-2 md:border-x md:border-border md:px-8">
            {site.payments.methods.map((method) => {
              const Mark = PAYMENT_MARKS[method];
              return Mark ? <Mark key={method} /> : null;
            })}
          </ul>

          <div className="flex gap-3 md:justify-self-end">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary-container">
              <Globe className="h-[18px] w-[18px] text-primary" aria-hidden />
            </span>
            <div>
              <p className="text-label-bold text-foreground">Global coverage</p>
              <p className="mt-0.5 text-body-sm text-muted-foreground">
                {SITE.countryCount}+ countries · delivered by email in minutes
              </p>
            </div>
          </div>
        </div>
      </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-5 md:gap-10">
          <div className="col-span-2 md:col-span-1">
            <div className="font-display text-2xl font-bold uppercase text-primary">{site.brand}</div>
            <p className="mt-3 max-w-xs text-body-sm text-muted-foreground">{site.tagline}</p>
            {/*
              The App Store and Google Play badges used to sit here. They were removed,
              and the reason is worth keeping: `site.appStores` marks both apps
              "coming-soon", the badges were <span>s with no href, and the Apple mark was
              lucide's `Apple` icon — a piece of fruit with a leaf, not Apple Inc.'s
              logo, beside a hand-drawn approximation of the Google Play triangle.

              So the footer advertised two products that do not exist, could not be
              tapped, and used two trademarks incorrectly. A visitor who taps "Download
              on the App Store" and gets nothing has learned the site is broken — which
              is the opposite of what a footer badge is for. They belong back here when
              the apps ship, as real links using the official assets.
            */}
            <hr className="mt-6 border-t border-border" />
            <div className="mt-6 flex gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary-container">
                <Mail className="h-[18px] w-[18px] text-primary" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-label-bold text-foreground">Questions? Email</p>
                <a
                  href={`mailto:${SITE.support.email}`}
                  className="break-all text-body-sm font-medium text-primary underline-offset-2 hover:underline"
                >
                  {SITE.support.email}
                </a>
                <p className="mt-1 text-body-sm text-muted-foreground">
                  {SITE.support.responseTime}
                </p>
              </div>
            </div>
            {/*
              Renders nothing while every slot in `content/site.json` is null, which is
              the state today. `sameAs` applies the same filter, so the footer and the
              structured data cannot disagree about which profiles exist — and neither
              claims one that does not.
            */}
            <SocialLinks className="mt-6" />
          </div>
          {nav.footer.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              {/*
                A <p>, not an <h2>. These four column labels were headings on all 127 pages,
                so every document outline ended with "eSIMFlys / Top destinations / Resources
                / Legal" — and on the thin help pages that was half the headings on the page,
                describing chrome rather than content. The <nav> already carries
                `aria-label={col.title}`, so the landmark stays named for screen readers
                without spending a heading level on it.
              */}
              <p className="text-label-caps uppercase text-foreground">{col.title}</p>
              <span aria-hidden className="mt-2 mb-1 block h-0.5 w-7 rounded-full bg-primary" />
              {/*
                The tap target is the link box, not the text. At `text-body-sm` these
                render 17 px tall, and the old `gap-3` put 12 px of dead space between
                them — 29 px of pitch, of which only 17 px was touchable, against a 44 px
                guideline. Measured on the live site at 375 px: 19 footer links, every one
                17 px.

                `min-h-11` (44 px) on a flex box makes the whole row touchable and the gap
                redundant, so the gap goes and the pitch becomes 44 px of pure target. The
                text stays 17 px — this changes what you can hit, not what you can read.

                Cost, deliberately accepted: a 5-link column grows ~133 px -> 220 px, and
                the columns stack on mobile, so the footer is noticeably taller. `min-h-10`
                would cap it at 40 px if that ever matters more than the guideline.
              */}
              <ul className="flex flex-col">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="group flex min-h-11 items-center justify-between gap-3 border-b border-border text-body-sm text-muted-foreground transition-colors hover:text-primary"
                    >
                      {l.label}
                      <ChevronRight
                        className="h-4 w-4 shrink-0 text-border transition-colors group-hover:text-primary"
                        aria-hidden
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>
      {/*
        The closing bar is the brand colour, not another slab of page background. It is
        the last thing on every page and the line that says who is legally behind the
        shop, so it reads as a signature rather than as more footer.
      */}
      <div className="bg-[#1e3a8a] text-white/85">
        <div className="mx-auto flex max-w-6xl items-center justify-center gap-3 px-6 py-5 text-body-sm">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10">
            <Lock className="h-4 w-4 text-white" aria-hidden />
          </span>
          <p className="text-center">
            © {year} {site.brand}. Operated by 4estolondon, London, United Kingdom.
          </p>
        </div>
      </div>
    </footer>
  );
}
