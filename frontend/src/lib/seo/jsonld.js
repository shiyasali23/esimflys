import { SITE } from "@/config/site";
import { routes } from "@/config/routes";
import { ownedProfiles } from "@/components/layout/social-links";

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
  const { operator, support } = SITE;
  const org = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE.name,
    legalName: SITE.legalName,
    url: SITE.baseUrl,
    /* Year precision only: the launch year is what /about states, and nothing more exact is published. */
    foundingDate: SITE.foundingYear,
    logo: `${SITE.baseUrl}/icons/logo-512.png`,
    /*
      Who actually takes the money, stated in the markup as well as on /about.

      This is the strongest entity signal the site has available. It is also the honest one:
      eSIMFlys is a trading name, and the operating company is 4estolondon in London. Every
      field below is either supplied by the business or omitted — nothing here is inferred.
    */
    address: {
      "@type": "PostalAddress",
      addressLocality: operator.city,
      addressCountry: operator.countryCode,
      ...(operator.streetAddress ? { streetAddress: operator.streetAddress } : {}),
    },
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: support.email,
        availableLanguage: "English",
        /* 24/7, expressed the way schema.org models opening hours. */
        hoursAvailable: {
          "@type": "OpeningHoursSpecification",
          dayOfWeek: [
            "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
          ],
          opens: "00:00",
          closes: "23:59",
        },
      },
    ],
  };

  if (operator.registrationNumber) {
    org.identifier = {
      "@type": "PropertyValue",
      name: "Company registration number",
      value: operator.registrationNumber,
    };
  }

  /*
    `sameAs` only ever lists profiles that exist.

    `content/site.json` holds a slot per network with `url: null` until one is created, and
    this filter drops every empty slot. A fabricated or dead profile URL is worse than an
    absent one: sameAs is a primary input to entity resolution, and pointing it at nothing
    teaches Google the wrong thing about who this company is.

    `ownedProfiles`, NOT `publishableProfiles`. The footer also carries icons for slots
    marked `owned: false` — links to a platform's front door, shown because the design
    asks for them while no real accounts exist yet. Those are navigation, not identity,
    and claiming instagram.com as `sameAs` would assert this company IS that page.
  */
  const sameAs = ownedProfiles().map((p) => p.url);
  if (sameAs.length) org.sameAs = sameAs;

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
 * A list of named, linkable things that the page visibly renders.
 *
 * Google maps no rich result to a bare ItemList, so none of these earn a SERP feature. They
 * are here so an answer engine can enumerate what a hub page contains without inferring it
 * from anchor text, which is the whole job of pages like /destinations and /help.
 *
 * The rule every caller follows: the list mirrors what is actually in the rendered DOM. Where
 * a page hides detail behind interaction (the device tabs, for example) only the visible
 * level is described, never the hidden contents.
 *
 * @param {string} name
 * @param {{ name: string, path: string }[]} items
 */
export function itemListJsonLd(name, items) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      ...(it.path ? { url: new URL(it.path, SITE.baseUrl).toString() } : {}),
    })),
  };
}

/**
 * ItemList for the /destinations index — mirrors the country links visible on the page.
 *
 * Every country the page renders is included, including the noindex ones: the links are on
 * the page and crawlable, so omitting them would describe a page that does not exist.
 *
 * @param {{ slug: string, name: string }[]} countries
 */
export function destinationsItemListJsonLd(countries) {
  return itemListJsonLd(
    "Travel eSIM destinations",
    countries.map((c) => ({ name: c.name, path: routes.country(c.slug) })),
  );
}

/**
 * TechArticle for the explainer at /what-is-esim.
 *
 * TechArticle rather than Article: this is reference material explaining how a technology
 * works, not news or opinion. Neither earns a rich result — the value is that an answer
 * engine asked "what is an eSIM" can identify this page as a definitional source with a
 * stated publisher, rather than as one more commercial page.
 *
 * `dateModified` is the real last-change date of the underlying content file, taken from
 * version control at authoring time. It is not a build timestamp; stamping "now" on every
 * deploy would be a fabricated freshness signal.
 *
 * @param {{ title: string, description: string, path: string, dateModified?: string }} opts
 */
export function techArticleJsonLd({ title, description, path, dateModified }) {
  const url = new URL(path, SITE.baseUrl).toString();
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: title,
    description,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    publisher: {
      "@type": "Organization",
      name: SITE.name,
      url: SITE.baseUrl,
      logo: `${SITE.baseUrl}/icons/logo-512.png`,
    },
    ...(dateModified ? { dateModified } : {}),
  };
}
