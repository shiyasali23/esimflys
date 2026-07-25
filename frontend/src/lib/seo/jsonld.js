import { SITE } from "@/config/site";

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
  };
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
