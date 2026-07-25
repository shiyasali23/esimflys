/**
 * Country editorial content store — the frontend representation of the backend
 * `country_content` model (metaTitle/metaDescription/intro/countryContext/
 * networkNotes/connectionDetails/activationNotes/whyEsim/faqs/status). One JSON
 * per approved country. Swap this source for the :8000 backend later with no
 * change to callers. A country page is indexable only when its content is "approved".
 */
import saudiArabia from "./saudi-arabia.json";
import unitedArabEmirates from "./united-arab-emirates.json";
import thailand from "./thailand.json";
import indonesia from "./indonesia.json";
import malaysia from "./malaysia.json";
import singapore from "./singapore.json";
import maldives from "./maldives.json";
import turkey from "./turkey.json";
import morocco from "./morocco.json";
import montenegro from "./montenegro.json";

const ALL = {
  "saudi-arabia": saudiArabia,
  "united-arab-emirates": unitedArabEmirates,
  thailand,
  indonesia,
  malaysia,
  singapore,
  maldives,
  turkey,
  morocco,
  montenegro,
};

export function getCountryContent(slug) {
  return ALL[slug] || null;
}

export function isCountryContentApproved(slug) {
  const c = ALL[slug];
  return !!c && c.status === "approved";
}

export function approvedContentSlugs() {
  return Object.keys(ALL).filter((slug) => ALL[slug]?.status === "approved");
}
