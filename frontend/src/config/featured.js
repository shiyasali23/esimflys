/**
 * The countries the home page leads with, in the order they are shown.
 *
 * This list is the single source of truth for "featured", and it exists because there was
 * no such source before. Three fields disagreed about what featured meant:
 *
 *   - `sortOrder`   0-67, distinct per country. The home page used ONLY this — it called
 *                   `getFeaturedCountries`, which was `COUNTRIES.slice(0, n)`.
 *   - `isPopular`   true on 18 countries. The home page never read it.
 *   - `homepageBadge` "popular" on 4, "best_value" on 2, null on 62.
 *
 * All three are hand-entered spreadsheet columns imported by the backend's
 * `import_catalog` command (`apps/catalog/management/commands/import_catalog.py:110-113`).
 * Nothing computes them: there is no popularity score, no sales-derived ranking and no
 * recompute job anywhere in the backend. So the home page's running order was whatever
 * `sort_order` happened to hold, which had drifted into matching the ten editorially
 * approved countries by coincidence of curation rather than by rule.
 *
 * Curation stays in the frontend, alongside `config/indexing.js` and
 * `content/countries.js`, so changing what the shop leads with is a reviewable diff and
 * does not need a backend deploy or a catalogue regeneration.
 *
 * ORDER IS INTENTIONAL — the array order is the display order.
 *
 * REMOVED 2026-08-30 by request: qatar, oman, nepal, cambodia.
 *
 * NOTE: Armenia was requested for this list and is deliberately absent. It does not exist
 * in the catalogue at all — no country record and no plans, verified against
 * `data/catalog.json` (68 countries, none with iso2 "AM"). It has to be added to the
 * backend catalogue and the catalogue regenerated before it can be featured; listing the
 * slug here early would silently render nothing.
 */
export const FEATURED_SLUGS = [
  "saudi-arabia",
  "malaysia",
  "thailand",
  "singapore",
  "indonesia",
  "maldives",
  "azerbaijan",
  "georgia",
  "kazakhstan",
  "uzbekistan",
  "vietnam",
  "sri-lanka",
  "turkey",
  "egypt",
];

/**
 * How many of the list the hero shows as quick-pick chips.
 *
 * Not the full list, deliberately. The chips sit directly under the H1, and the hero's
 * measured job is to put the headline and the search box on screen fast — eighteen chips
 * would run to nine rows on a phone and push the search control far below the fold. The
 * rest of the list is one scroll away in "Where travelers go", which is a grid built for it.
 *
 * SIX, because the chips are laid out in a fixed grid: three columns from `md` up, two
 * below it. Six fills both exactly — two tidy rows on a desktop, three on a phone, with no
 * short final row. Any count that is not a common multiple of 2 and 3 leaves a ragged
 * last row, so change this in steps of six.
 */
export const HERO_CHIP_COUNT = 6;
