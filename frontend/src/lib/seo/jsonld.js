import { SITE } from "@/config/site";
import { routes } from "@/config/routes";

/**
 * JSON-LD builders — supported types only, mirroring visible content (blueprint §27).
 * Gotchas honored: prices are STRINGS; WebSite uses the hyphenated "query-input";
 * NO aggregateRating/Review (no verified reviews). FAQPage is emitted ONLY for
 * countries with approved, real editorial FAQs (faqPageJsonLd) — mirrors the visible accordion.
 */

/** FAQPage for a country's approved, human-written FAQ (mirrors the visible accordion). */
export function faqPageJsonLd(faqs) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: (faqs || []).map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function organizationJsonLd() {
  const org = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE.name,
    url: SITE.baseUrl,
    logo: `${SITE.baseUrl}/icons/logo-512.png`,
  };
  // sameAs intentionally omitted until real, verified social profiles exist (no fabrication).
  return org;
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE.name,
    url: SITE.baseUrl,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE.baseUrl}/destinations?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/** @param {{ name: string, path: string }[]} items */
export function breadcrumbJsonLd(items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: new URL(it.path, SITE.baseUrl).toString(),
    })),
  };
}

/**
 * Product for a country page with an AggregateOffer over its real plans.
 * Prices are strings; priceCurrency USD (canonical, blueprint §28.8). Mirrors the
 * visible plans; availability reflects what the page shows.
 * @param {any} country @param {Array<any>} plans
 */
export function countryProductJsonLd(country, plans) {
  const prices = plans.map((p) => Number(p.retail_price_usd)).filter((n) => !Number.isNaN(n));
  const product = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `eSIM ${country.name}`,
    description: `Prepaid travel eSIM data plans for ${country.name}. Fast 4G/5G data, install by QR, keep your number.`,
    brand: { "@type": "Brand", name: SITE.name },
    /*
      `image` is required for the Product rich result. Without it Search Console reports
      "Missing field 'image'" and the whole price-range decoration is withheld — which was
      the state on all ten indexable country pages, discarding the most valuable structured
      data on the site for one absent field.

      This points at the shared hero illustration rather than a per-country photograph
      because no per-country product imagery exists. It is the site's own artwork depicting
      the product context, so it is accurate, if generic. Swap it for a per-country asset
      when one exists.
    */
    image: [`${SITE.baseUrl}/images/hero-portal.webp`],
    url: new URL(routes.country(country.slug), SITE.baseUrl).toString(),
  };
  /*
    Deliberately NOT emitted, having been checked rather than assumed:

    - `sku`: this node aggregates every plan for the country, so there is no single stock
      unit it could name. Inventing one would be fabricated data.
    - `hasMerchantReturnPolicy` / `shippingDetails`: Google added these as prerequisites for
      the merchant-listing price decoration, but /legal/refund grants a CONDITIONAL 14-day
      withdrawal right, and schema.org's return model cannot express the conditions. Marking
      it `MerchantReturnNotPermitted` would be false and a finite-window value would overstate
      the certainty. An eSIM also has no shipping to describe. Encoding either inaccurately is
      worse than omitting it — this needs a legal read, not an engineering guess.
  */
  if (prices.length) {
    product.offers = {
      "@type": "AggregateOffer",
      priceCurrency: "USD",
      lowPrice: String(Math.min(...prices)),
      highPrice: String(Math.max(...prices)),
      offerCount: String(plans.length),
      availability: "https://schema.org/InStock",
    };
  }
  return product;
}

/** DefinedTermSet for the glossary (mirrors the visible terms). @param {any[]} terms */
export function glossaryJsonLd(terms) {
  return {
    "@context": "https://schema.org",
    "@type": "DefinedTermSet",
    name: "eSIM Glossary",
    url: `${SITE.baseUrl}/glossary`,
    hasDefinedTerm: terms.map((t) => ({
      "@type": "DefinedTerm",
      name: t.term,
      description: t.definition,
    })),
  };
}

/**
 * ItemList for the /destinations index — mirrors the country links visible on the page.
 *
 * Google maps no rich result to a bare ItemList, so this is not decoration for the SERP: it
 * is here because /destinations is the catalogue's index page and it previously offered a
 * machine reader nothing but 68 anchors and ~35 words of prose. The list is what the page
 * IS, so stating it lets an answer engine enumerate coverage without scraping link text.
 *
 * Every country the page renders is included, including the noindex ones. The rule followed
 * here is "markup mirrors visible content" — the links are on the page and crawlable, and
 * omitting them would describe a page that does not exist.
 *
 * @param {{ slug: string, name: string }[]} countries
 */
export function destinationsItemListJsonLd(countries) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Travel eSIM destinations",
    numberOfItems: countries.length,
    itemListElement: countries.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      url: new URL(routes.country(c.slug), SITE.baseUrl).toString(),
    })),
  };
}
