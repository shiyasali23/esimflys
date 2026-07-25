import "./globals.css";
import { Oswald, Poppins } from "next/font/google";
import { SITE } from "@/config/site";
import { SkipLink } from "@/components/layout/skip-link";
import { NoFlashCurrencyScript } from "@/components/currency/no-flash-script";
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

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${oswald.variable} ${poppins.variable}`}
      suppressHydrationWarning
    >
      <body>
        <NoFlashCurrencyScript />
        <SkipLink />
        <JsonLd data={[organizationJsonLd(), websiteJsonLd()]} />
        {children}
        <ConsentBanner />
      </body>
    </html>
  );
}
