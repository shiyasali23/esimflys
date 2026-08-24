import { SITE } from "@/config/site";

/** Site-wide social card. Regenerate with `node scripts/generate-og-image.mjs`. */
export const OG_CARD = `${SITE.baseUrl}/og-card.png`;
export const OG_CARD_ALT = `${SITE.name} — ${SITE.tagline}. Prepaid data-only travel eSIMs.`;

/**
 * Build a Next.js Metadata object with a self-referential canonical + OG/Twitter
 * (blueprint §28.1). `title` runs through the root template `%s | eSIMFlys`.
 * @param {{ title?: string, description?: string, path?: string, index?: boolean, ogImage?: string, type?: string }} opts
 */
export function buildMetadata({
  title,
  description,
  path = "/",
  index = true,
  ogImage,
  type = "website",
}) {
  const url = new URL(path, SITE.baseUrl).toString();
  return {
    title,
    description,
    // A noindex page must not also declare a canonical: the two are contradictory
    // signals, and the private surfaces (admin, agency, account detail) all shared a
    // single group path, so every one of them pointed at a URL that was not itself.
    alternates: index ? { canonical: path } : undefined,
    robots: index ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: {
      type,
      url,
      title,
      description,
      siteName: SITE.name,
      /*
        Always an image, and stated explicitly rather than inherited.

        A page-level `openGraph` object REPLACES the parent's wholesale — it is not merged
        key by key — so neither the root layout's openGraph nor an `app/opengraph-image.png`
        file convention survives on any route that calls this helper. Both were tried:

        [MEASURED] with the file convention and no explicit key, og:image reached 3 of 126
        emitted pages — the home page, 404 and _not-found, i.e. exactly the three routes
        that declare no openGraph of their own.

        Naming the URL here is what makes it reach all of them. `OG_CARD` is a plain public
        asset so the URL carries no build hash and stays stable across deploys.
      */
      images: [{ url: ogImage || OG_CARD, width: 1200, height: 630, alt: OG_CARD_ALT }],
    },
    /*
      Twitter needs the image named too: declaring `summary_large_image` while supplying no
      image was the original defect — the card reserved a large slot and rendered nothing on
      every share, across all 127 pages.
    */
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage || OG_CARD],
    },
  };
}
