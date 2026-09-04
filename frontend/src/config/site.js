import catalog from "@/data/catalog.json";

/**
 * Global site configuration — single source of truth.
 * COUNTRY_COUNT comes from the real catalogue (blueprint §28.7): the mockups'
 * "150+/190+/200+" copy is reconciled to this one verified number.
 */
/**
 * `NEXT_PUBLIC_SITE_URL` is inlined at build time and every canonical, OG url,
 * sitemap entry and absolute JSON-LD URL is resolved against it. Falling back to
 * localhost in a production build ships a site whose canonicals all point at a
 * machine nobody can reach — it looks fine in a browser and is worthless to search
 * engines. Fail the build instead.
 */
function resolveBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL must be set for a production build. It is baked into every canonical URL, the sitemap and all JSON-LD.",
    );
  }
  return "http://localhost:3000";
}

export const SITE = {
  name: "eSIMFlys",
  /*
    The trading name is eSIMFlys; the operating company is 4estolondon, London, UK.
    `legalName` previously read "eSIMFlys Global", which was a placeholder for an entity
    that does not exist. It is used in Organization structured data, so a wrong value there
    is a wrong claim about who takes the money.

    STILL MISSING, and only the business can supply them: the exact registered entity name
    as it appears at Companies House, the company registration number, and the registered
    office address. Until those exist the schema states the operator and the city only,
    which is true, rather than inventing a registration.
  */
  legalName: "4estolondon",
  operator: {
    name: "4estolondon",
    city: "London",
    country: "United Kingdom",
    countryCode: "GB",
    /** @type {string | null} Companies House number — publish once confirmed. */
    registrationNumber: null,
    /** @type {string | null} Full registered office address — publish once confirmed. */
    streetAddress: null,
  },
  support: {
    /*
      The Gmail, and it is the address that actually receives mail.

      This read `support@esimflys.com` — chosen for consistency with the legal documents
      rather than because the mailbox existed. `esimflys.com` has MX records, but nothing
      confirmed a `support@` box behind them, and a published address that bounces is
      worse than none: it sits in the Organization schema, on /about and /contact, and on
      the four legal pages someone reads when a purchase has gone wrong. All six
      references moved together, so nothing contradicts.

      The backend already replies from here — `settings.SUPPORT_EMAIL` is the Reply-To on
      every transactional email — so this makes the site agree with the mail that is
      already going out. Switch back only once a real support@ mailbox is confirmed to
      deliver, and change all six places in the same commit.
    */
    email: "work4estolondon@gmail.com",
    businessEmail: "work4estolondon@gmail.com",
    hours: "24/7",
    responseTime: "We aim to reply within a few hours, day or night.",
  },
  baseUrl: resolveBaseUrl(),
  tagline: "Instant Travel eSIM Data",
  foundingYear: "2026",
  description:
    `Prepaid data-only travel eSIMs for ${catalog.meta.countryCount} countries. Buy online, scan a QR code, and get connected on arrival — no physical SIM, keep your number.`,
  countryCount: catalog.meta.countryCount,
  planCount: catalog.meta.planCount,
  social: {
    // Placeholders — replace with real, verified profiles before shipping Organization sameAs.
    twitter: null,
    facebook: null,
    linkedin: null,
  },
};

/** Backend base URL — server-side only, never NEXT_PUBLIC_ (blueprint §22). */
export const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:8000";
