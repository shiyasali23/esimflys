/**
 * Feature flags (blueprint §5.4, §26, §37). Keep behaviour honest:
 * we never ship fabricated data, and we surface real data blockers.
 *
 * There is no USE_MOCKS any more. The catalogue is ALWAYS the baked
 * `src/data/catalog.json`, generated from the live API by
 * `scripts/generate-catalog.mjs`, so there is no second source to switch between
 * and nothing to fall back to. Rebuild to refresh it.
 *
 * `showPausedPlans` is gone with it: the generator only ever writes active plans,
 * so there are no paused rows left to reveal.
 */
export const FLAGS = {
  /** No verified first-party reviews → NEVER render Review UI or Review/AggregateRating JSON-LD. */
  reviewsEnabled: false,

  /** No regional bundles exist in the catalogue → regional pages off. */
  regionsEnabled: false,

  /** DATA BLOCKER R14: hotspot is "Unknown" for all plans → never claim hotspot support. */
  showHotspotClaim: false,
};
