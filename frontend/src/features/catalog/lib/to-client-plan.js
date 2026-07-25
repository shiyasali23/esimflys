/**
 * Project a raw plan to a CLIENT-SAFE shape before it reaches a Client Component.
 * Strips SERVER-ONLY fields (wholesale/competitor/supplier) — defense-in-depth
 * alongside the backend already omitting them (RULES §2, §9; blueprint §20).
 * @param {Record<string, any>} plan
 */
export function toClientPlan(plan) {
  const {
    wholesale_price_usd,
    competitor_ref_price,
    competitor_ref_brand,
    supplier_package_code,
    wsp_verified_date,
    ...safe
  } = plan;
  return safe;
}

/** @param {Array<Record<string, any>>} plans */
export function toClientPlans(plans) {
  return plans.map(toClientPlan);
}
