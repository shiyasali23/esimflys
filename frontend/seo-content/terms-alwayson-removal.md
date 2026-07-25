# Proposed removal — Terms "Always On service" section (FOR LEGAL CONFIRMATION)

**Status: NOT applied to the live code.** This is a prepared diff. `src/content/legal/terms.js` is unchanged, so the block below is still live at `/legal/terms` until your counsel confirms removal and a developer applies it.

## Why remove it
The `id: "always-on-service"` section describes a product eSIMFlys does **not** offer and reads as copied competitor boilerplate:
- **Subscriptions** and "cancellation of a User's subscription" — eSIMFlys is **prepaid, data-only** (no subscriptions).
- A **"Local Phone Number Activation"** SMS service — not part of the product.
- **Free "always-on" data across ~100 named countries** — an unsupported availability/coverage claim.
- Hard-coded **rollout dates** ("Starting 4 November 2025 (CET)…", "Starting 26 February 2026 (CET)…") and long country lists — not eSIMFlys commitments.

Leaving it in the Terms contradicts the rest of the document (which correctly describes prepaid Data Plans) and could create consumer-protection exposure at launch.

## The change
Delete the entire section object (currently `src/content/legal/terms.js`, lines ~102–130) from the `sections` array. It sits between the `user-obligations` section and the `payment-terms` section.

**Block to delete (verbatim):**
```js
    {
      id: "always-on-service",
      title: "Always On service",
      body: [
        { p: "The service activates in the following circumstances:" },
        { ul: [
            "upon cancellation of a User’s subscription; or",
            "at eSIM installation for a single, limited-days destination package.",
        ] },
        { p: "The Always On service is provided to Users at no additional charge. This service is an automatic, limited-data service that activates after the cancellation of a User’s subscription. It offers continued network connectivity under defined conditions. For subscription plans, a “Local Phone Number Activation” refers to the optional service allowing Users to receive SMS messages via a local number assigned in supported countries." },
        { p: "The Always On service provides data coverage in the following countries:" },
        { ul: [ /* Europe / Asia / North America / South America / Africa / Oceania country lists */ ] },
        { p: "Starting 4 November 2025 (CET), this feature is available for all subscriptions activated on or after that date." },
        { p: "Starting 26 February 2026 (CET), this benefit also applies to users who purchase trip-destination eSIMs, except for the following destinations…" },
        { p: "The Always On service is not eligible for any refunds, whether partial or full, under any circumstances." },
        { p: "eSIMFlys reserves the right to contact the User to verify the status of the “Always On” service following a period of consecutive weeks of inactivity." },
      ],
    },
```
*(The full country lists and exclusion list are in the live file at the same lines — quoted here in shortened form for readability.)*

**After removal:** the `user-obligations` section object is immediately followed by the `payment-terms` section object; the surrounding array syntax is already valid (each section is a comma-separated object, so deleting one object plus its trailing comma is the whole edit).

## Safety notes for the developer applying it
- Deletion only — **do not author replacement legal language** (that's for counsel). If counsel wants a genuine always-on/free-data clause later, they supply the wording.
- The `/legal/[doc]` page renders sections dynamically, so removing the object also removes its heading and any table-of-contents entry automatically — no component change needed.
- Confirm no internal anchor links point to `#always-on-service` before removing (grep `always-on-service` across `src/`).
- After applying: `npm run build && npm run lint && npm test`, and load `/legal/terms` to confirm it renders one fewer section with valid layout.

## Broader legal review (separate from this removal)
`privacy.js`, `terms.js`, `refund.js`, `cookies.js` are placeholder boilerplate. Before launch, counsel should confirm: the controlling legal entity ("eSIMFlys"/"eSIMFlys Global"), governing law/jurisdiction (currently "laws of Ireland"), the liability cap ("€100"), and the support email (`support@esimflys.com`).
