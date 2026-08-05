import { isCountryContentApproved } from "@/content/countries";

/**
 * Country-page index gate (blueprint §26). A programmatic country page is
 * INDEXABLE only when it carries approved, unique editorial content AND real plans.
 * Until content is authored + human-approved, the page is `noindex` (still crawlable)
 * and excluded from the sitemap — while remaining live and buyable. This is what
 * prevents scaled-content-abuse penalties across ~68 near-template pages.
 *
 * @param {any} country
 * @returns {{ index: boolean, reasons: string[] }}
 */
export function countryIndexDecision(country) {
  const reasons = [];
  if (!country) return { index: false, reasons: ["missing-country"] };

  const approved = isCountryContentApproved(country.slug);
  // The baked catalogue only ever holds ACTIVE plans, so livePlanCount is the
  // only meaningful signal here. The old `showPausedPlans` fallback compared
  // planCount, which the adapter sets to the same number — it could never change
  // the answer.
  const hasPlans = (country.livePlanCount ?? 0) > 0;

  if (!approved) reasons.push("content-not-approved");
  if (!hasPlans) reasons.push("no-plans");

  return { index: approved && hasPlans, reasons };
}

export function isCountryIndexable(country) {
  return countryIndexDecision(country).index;
}
