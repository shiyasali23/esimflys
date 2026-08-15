import "./globals.css";
import { Inter, Inter_Tight } from "next/font/google";
import { SITE } from "@/config/site";
import { SkipLink } from "@/components/layout/skip-link";
import { NoFlashCurrencyScript } from "@/components/currency/no-flash-script";
import { RatesProvider } from "@/components/currency/rates-provider.client";
import { AccountCurrencySync } from "@/components/currency/account-currency-sync.client";
import { getRates } from "@/server/rates";
import { ConsentBanner } from "@/components/layout/consent-banner.client";
import { NoFlashConsentScript } from "@/components/layout/no-flash-consent-script";
import { JsonLd } from "@/components/seo/json-ld";
import { organizationJsonLd, websiteJsonLd } from "@/lib/seo/jsonld";

/**
 * Inter Tight for display, Inter for text.
 *
 * This replaced Oswald + Poppins, which were the reason the storefront read as a
 * template rather than a shop you would hand a card to. Oswald is a condensed
 * sports-poster face and Poppins is the geometric default of every free theme; set in
 * heavy uppercase together they signal "discount flyer", which is the last thing a page
 * asking for payment details should signal.
 *
 * Inter is the type of trusted payment UI, and it earns its place here on detail as
 * well as tone: real tabular figures, so a column of prices lines up digit for digit,
 * and a disambiguated 1/l/I and 0/O — this page shows ICCIDs and order numbers where a
 * misread character costs a support ticket.
 *
 * Both are variable fonts, so each is ONE self-hosted file covering every weight. The
 * previous pair shipped nine static instances.
 */
/*
 * `preload: false` on both, deliberately.
 *
 * next/font preloads the latin subset of each family — 47 KB + 44 KB — at high priority,
 * which puts 91 KB into the same bandwidth window as the LCP image.
 *
 * [MEASURED] home page, DPR-2 phone, Slow 4G, cold: the hero (127 KB) downloaded over
 * 1182 -> 4474 ms, i.e. 3291 ms for what is ~640 ms of transfer on this link, because
 * 335 KB was in flight alongside it — JS 212 KB, fonts 92 KB, images 31 KB. The hero was
 * getting roughly a quarter of the pipe.
 *
 * Nothing about first paint needs these files. Both are `display: swap` and next/font
 * emits metric-matched fallback faces (`Inter Fallback`, `Inter Tight Fallback`), so text
 * paints immediately in the fallback and swaps without moving — measured font-swap layout
 * shifts on a country page were 0.0003 and 0.0001, i.e. nil. Dropping the preload does not
 * stop them loading; the inlined CSS still declares them and layout still requests them.
 * It only stops them being fetched at high priority *before* the image the page is judged on.
 *
 * The JS in that window is NOT reducible the same way: it is React plus the App Router
 * plus hydration code, a static export gives no supported hook to deprioritise it, and
 * deferring it would trade LCP for interactivity. Fonts were the one safe lever here.
 */
const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-inter-tight",
  display: "swap",
  preload: false,
});
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  preload: false,
});

export const metadata = {
  metadataBase: new URL(SITE.baseUrl),
  title: {
    default: `${SITE.tagline} for 60+ Countries | ${SITE.name}`,
    template: `%s | ${SITE.name}`,
  },
  description: SITE.description,
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: SITE.name,
    title: `${SITE.tagline} for 60+ Countries | ${SITE.name}`,
    description: SITE.description,
    url: SITE.baseUrl,
  },
  twitter: { card: "summary_large_image" },
  appleWebApp: { title: SITE.name },
};

export const viewport = {
  themeColor: "#615de5",
  colorScheme: "light",
};

/**
 * The FX table is fetched here, once, and shared with every `<Price>` on the page.
 *
 * This is a plain ISR fetch — no `cookies()` and no header sniffing — so the layout
 * stays statically generated and the emitted HTML is identical for every visitor.
 * Which currency a person sees is decided in the browser from their cookie, which is
 * what keeps the page safe to sit behind a CDN.
 */
export default async function RootLayout({ children }) {
  const fx = await getRates();

  return (
    <html
      lang="en"
      className={`${interTight.variable} ${inter.variable}`}
      suppressHydrationWarning
    >
      <body>
        <NoFlashCurrencyScript offered={Object.keys(fx.rates)} />
        <NoFlashConsentScript />
        <SkipLink />
        <JsonLd data={[organizationJsonLd(), websiteJsonLd()]} />
        <RatesProvider value={fx}>
          <AccountCurrencySync />
          {children}
        </RatesProvider>
        <ConsentBanner />
      </body>
    </html>
  );
}
