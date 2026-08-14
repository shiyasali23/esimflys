import Link from "next/link";
import { AppStoreBadge, GooglePlayBadge } from "@/components/media/store-badges";
import nav from "@/content/nav.json";
import site from "@/content/site.json";

const APP_STORE_BADGES = {
  "App Store": AppStoreBadge,
  "Google Play": GooglePlayBadge,
};

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
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-6 py-4 text-body-sm text-muted-foreground sm:flex-row">
          <p>© {year} {site.brand}</p>
          {legal.length ? (
            <nav aria-label="Legal" className="flex gap-4">
              {legal.map((l) => (
                <Link key={l.label} href={l.href} className="transition-colors hover:text-primary">
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
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-5">
          <div className="col-span-2 md:col-span-1">
            <div className="font-display text-2xl font-bold uppercase text-primary">{site.brand}</div>
            <p className="mt-3 max-w-xs text-body-sm text-muted-foreground">{site.tagline}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {site.appStores.map((a) => {
                const Badge = APP_STORE_BADGES[a.label];
                return Badge ? <Badge key={a.label} /> : null;
              })}
            </div>
          </div>
          {nav.footer.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h2 className="mb-4 text-label-caps uppercase text-muted-foreground">{col.title}</h2>
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
                      className="flex min-h-11 items-center text-body-sm text-muted-foreground transition-colors hover:text-primary"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-6 text-body-sm text-muted-foreground md:flex-row">
          <p>© {year} {site.brand}. All rights reserved.</p>
          {site.social.length > 0 ? (
            <div className="flex gap-4">
              {site.social.map((s) => (
                <a key={s.label} href={s.href} className="hover:text-primary">
                  {s.label}
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
