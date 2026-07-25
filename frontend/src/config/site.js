import catalog from "@/data/catalog.json";

/**
 * Global site configuration — single source of truth.
 * COUNTRY_COUNT comes from the real catalogue (blueprint §28.7): the mockups'
 * "150+/190+/200+" copy is reconciled to this one verified number.
 */
export const SITE = {
  name: "eSIMFlys",
  legalName: "eSIMFlys Global",
  baseUrl: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  tagline: "Instant Travel eSIM Data",
  description:
    "Prepaid data-only travel eSIMs for 60+ countries. Buy online, scan a QR code, and get connected on arrival — no physical SIM, keep your number.",
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
