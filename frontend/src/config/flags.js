/**
 * Feature flags (blueprint §5.4, §26, §37). Keep behaviour honest:
 * we never ship fabricated data, and we surface real data blockers.
 */
export const FLAGS = {
  /** Backend at :8000 not up yet → use catalog.json + mock BFF responses. */
  USE_MOCKS: (process.env.USE_MOCKS ?? "true") !== "false",

  /** No verified first-party reviews → NEVER render Review UI or Review/AggregateRating JSON-LD. */
  reviewsEnabled: false,

  /** No regional bundles exist in the catalogue → regional pages off. */
  regionsEnabled: false,

  /**
   * DATA BLOCKER R13: every plan is `status="paused"` in the launch catalogue.
   * With a correct live filter the store shows 0 plans. This DEV flag renders
   * paused plans so the UI is buildable/reviewable. MUST be false for real launch,
   * once the business activates plans.
   */
  showPausedPlans: (process.env.SHOW_PAUSED_PLANS ?? "true") !== "false",

  /** DATA BLOCKER R14: hotspot is "Unknown" for all plans → never claim hotspot support. */
  showHotspotClaim: false,
};
