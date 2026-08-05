import "./globals.css";
import { Oswald, Poppins } from "next/font/google";
import { SITE } from "@/config/site";
import { SkipLink } from "@/components/layout/skip-link";
import { NoFlashCurrencyScript } from "@/components/currency/no-flash-script";
import { RatesProvider } from "@/components/currency/rates-provider.client";
import { AccountCurrencySync } from "@/components/currency/account-currency-sync.client";
import { getRates } from "@/server/rates";
import { ConsentBanner } from "@/components/layout/consent-banner.client";
import { JsonLd } from "@/components/seo/json-ld";
import { organizationJsonLd, websiteJsonLd } from "@/lib/seo/jsonld";

const oswald = Oswald({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-oswald",
  display: "swap",
});
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-poppins",
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
      className={`${oswald.variable} ${poppins.variable}`}
      suppressHydrationWarning
    >
      <body>
        <NoFlashCurrencyScript offered={Object.keys(fx.rates)} />
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
