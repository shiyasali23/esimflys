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
import { OG_CARD, OG_CARD_ALT } from "@/lib/seo/metadata";

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
const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-inter-tight",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
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
    // The home page and the 404 declare no openGraph of their own, so they inherit this
    // one. Every other route goes through buildMetadata, which names the same card.
    images: [{ url: OG_CARD, width: 1200, height: 630, alt: OG_CARD_ALT }],
  },
  twitter: { card: "summary_large_image", images: [OG_CARD] },
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
