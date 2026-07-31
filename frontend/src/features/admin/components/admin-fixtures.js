/**
 * Admin payloads captured verbatim from the running backend on 2026-07-30.
 *
 * These are shapes, not guesses — every field name and null here came off the wire.
 * Two conventions the fixtures preserve deliberately:
 *  - `countries` and `payouts` are PLAIN ARRAYS; everything else is paginated;
 *  - `wholesale_amount_minor` / `margin_minor` are present only for roles with
 *    pricing capability, so `PLAN_NO_PRICING` omits them entirely rather than
 *    nulling them.
 */

export const page = (results) => ({
  count: results.length,
  next: null,
  previous: null,
  results,
});

export const DASHBOARD = {
  currency: "USD",
  revenue: { gross_minor: 3398, refunded_minor: 0, net_minor: 3398 },
  orders: { total: 1, paid: 1, by_status: { fulfilled: 1 }, by_payment_status: { paid: 1 } },
  esims: { total: 0, live: 0, failed: 0 },
  commissions: { outstanding_minor: 0, paid_minor: 0, reversed_minor: 0 },
  operations: {
    supplier_jobs_pending: 0,
    supplier_jobs_manual_review: 0,
    notifications_failed: 0,
    webhooks_rejected: 0,
  },
  margin: { retail_minor: 0, wholesale_minor: 0, margin_minor: 0 },
};

export const ORDER = {
  id: "c7b0b93e-22bb-41a6-aff9-9486e13a2e7e",
  order_number: "ESF-DEVFIXTURE01",
  customer_email: "traveller@example.com",
  currency: "USD",
  subtotal_minor: 3398,
  discount_minor: 0,
  tax_minor: 0,
  total_minor: 3398,
  status: "fulfilled",
  payment_status: "paid",
  fulfillment_status: "delivered",
  placed_at: "2026-07-30T17:50:55.456043Z",
  created_at: "2026-07-30T17:50:55.456728Z",
  promo_code_snapshot: null,
  referring_organization: null,
  referring_organization_name: null,
  item_count: 2,
};

export const ORDER_ITEM = {
  id: "08302d55-4b9c-4e34-ad2f-700b0e0c0bf0",
  item_type: "esim",
  product_code: "AL-10GB-30D-V1",
  product_name: "Albania 10 GB — 30 Days",
  country_iso2: "AL",
  country_name: "Albania",
  plan_type: "fixed",
  data_limit_mb: 10000,
  daily_high_speed_mb: null,
  validity_days: 30,
  unit_amount_minor: 1699,
  currency: "USD",
  status: "delivered",
};

export const PAYMENT = {
  id: "0d2f4383-d3f9-49e0-9501-7cb7df08a3b0",
  order: ORDER.id,
  order_number: ORDER.order_number,
  provider: "stripe",
  amount_minor: 3398,
  currency: "USD",
  status: "succeeded",
  failure_code: null,
  paid_at: "2026-07-30T17:50:55.461525Z",
  created_at: "2026-07-30T17:50:55.461630Z",
};

export const ORDER_DETAIL = {
  ...ORDER,
  items: [ORDER_ITEM, { ...ORDER_ITEM, id: "08302d55-4b9c-4e34-ad2f-700b0e0c0bf1" }],
  payments: [PAYMENT],
  esims: [],
};

export const CUSTOMER = {
  id: "ef100993-ca99-45e7-b573-9492369ee126",
  email: "traveller@example.com",
  first_name: "Amira",
  last_name: "Haddad",
  preferred_currency: "USD",
  email_verified_at: null,
  is_active: true,
  date_joined: "2026-07-29T21:18:45.422053Z",
  order_count: 1,
};

export const ORGANIZATION = {
  id: "56df7542-54d6-4327-8555-e3fcf343cc67",
  name: "Sunrise Travel",
  organization_type: "travel_agency",
  billing_email: "ops@sunrise.test",
  support_email: "help@sunrise.test",
  country: "AE",
  status: "active",
  default_commission_type: null,
  default_commission_value: null,
  commission_currency: null,
  approved_at: null,
  suspended_at: null,
  suspension_reason: null,
  member_count: 5,
  created_at: "2026-07-29T20:49:52.333076Z",
  updated_at: "2026-07-29T21:20:27.919688Z",
};

export const MEMBER = {
  id: "ecce9b58-4f87-4677-a8df-986e37261dca",
  email: "owner@sunrise.test",
  first_name: "",
  last_name: "",
  role: "owner",
  status: "active",
  created_at: "2026-07-29T20:49:52.453832Z",
};

export const TRACKING_CODE = {
  id: "6eb6ceba-03c1-49e2-92c2-388203e57dd8",
  code: "SUNRISE20",
  kind: "tracking",
  organization: ORGANIZATION.id,
  organization_name: "Sunrise Travel",
  commission_type: "percentage_bps",
  commission_value: 2000,
  usage_limit: null,
  starts_at: null,
  ends_at: null,
  is_active: true,
  redemption_count: 0,
  created_at: "2026-07-29T20:49:52.814550Z",
};

export const PLAN = {
  id: "ba48ab0e-c5ef-4be2-835c-43580f223feb",
  product_code: "AL-10GB-30D-V1",
  country: "e29258c3-3c15-42ce-9371-098c467d09c4",
  country_iso2: "AL",
  country_name: "Albania",
  plan_type: "fixed",
  display_name: "Albania 10 GB — 30 Days",
  data_limit_mb: 10000,
  daily_high_speed_mb: null,
  day_count: null,
  validity_days: 30,
  topup_supported: true,
  hotspot_supported: null,
  network_names: ["One Albania 5G"],
  retail_amount_minor: 1699,
  wholesale_amount_minor: 719,
  margin_minor: 980,
  currency: "USD",
  status: "active",
  badge: "popular",
  tier: "A",
  is_default_selected: true,
  sort_order: 1,
  supplier_verified_at: "2026-07-16T00:00:00Z",
  created_at: "2026-07-22T20:58:14.007324Z",
};

/** Support/finance/read-only roles: the pricing keys are POPPED, not nulled. */
export const PLAN_NO_PRICING = (() => {
  const { wholesale_amount_minor, margin_minor, ...rest } = PLAN;
  return rest;
})();

export const COUNTRY = {
  id: "b8c92aac-d491-4aa8-8c70-83d4ce6c53da",
  iso2: "SA",
  name: "Saudi Arabia",
  slug: "saudi-arabia",
  region: "Middle East & N.Africa",
  flag_emoji: "🇸🇦",
  timezone: null,
  is_popular: true,
  homepage_badge: "popular",
  is_active: true,
  sort_order: 1,
  plan_count: 8,
  active_plan_count: 8,
};

export const ESIM = {
  id: "8a2589f6-7e1e-4166-a72d-378c15b1268b",
  status: "ready",
  order_number: "ESF-FC3B3AAD47AD",
  product_name: "Albania 10 GB — 30 Days",
  country_iso2: "AL",
  iccid_last4: "5587",
  total_data_bytes: 10000000000,
  remaining_data_bytes: 2500000000,
  installed_at: null,
  activated_at: null,
  expires_at: null,
  last_synced_at: null,
  created_at: "2026-07-29T20:50:12.650088Z",
};

export const AUDIT_EVENT = {
  id: "67497ab4-9fc5-4ccc-9701-6c4860ee57ee",
  created_at: "2026-07-30T17:37:00.331311Z",
  actor_email: "admin@esimflys.dev",
  actor_type: "platform",
  organization: null,
  action: "esim.credentials_revealed",
  object_type: "EsimProfile",
  object_id: ESIM.id,
  object_repr: `EsimProfile object (${ESIM.id})`,
  changes: {},
  context: { iccid_last4: "***redacted***", order_number: "ESF-FC3B3AAD47AD" },
  ip_address: "127.0.0.1",
};

export const COMMISSION = {
  id: "6a2b0c1d-1111-2222-3333-444455556666",
  organization: ORGANIZATION.id,
  organization_name: "Sunrise Travel",
  order: ORDER.id,
  order_number: ORDER.order_number,
  currency: "USD",
  commission_minor: 680,
  reversed_minor: 0,
  net_minor: 680,
  status: "pending",
  approved_at: null,
  created_at: "2026-07-30T17:50:55.500000Z",
};

/**
 * Routes a request to the fixture matching its URL. Order matters: the nested
 * `/members/` and `/tracking-codes/` paths must be tested before the bare
 * organization detail, and every list path before its own detail.
 */
export function fixtureFor(url) {
  const path = String(url).split("?")[0];
  const has = (s) => path.includes(s);

  if (has("/admin/dashboard/")) return DASHBOARD;
  if (has("/members/")) return [MEMBER, { ...MEMBER, id: "m2", email: "agent@sunrise.test", role: "viewer" }];
  if (has("/tracking-codes/")) return [TRACKING_CODE];
  if (has("/admin/countries/")) return [COUNTRY];
  if (has("/admin/payouts/")) return [];
  if (has("/admin/orders/") && !path.endsWith("/admin/orders/")) return ORDER_DETAIL;
  if (has("/admin/orders/")) return page([ORDER]);
  if (has("/admin/customers/") && !path.endsWith("/admin/customers/"))
    return { customer: CUSTOMER, orders: [ORDER] };
  if (has("/admin/customers/")) return page([CUSTOMER]);
  if (has("/admin/organizations/") && !path.endsWith("/admin/organizations/")) return ORGANIZATION;
  if (has("/admin/organizations/")) return page([ORGANIZATION]);
  if (has("/admin/esims/") && !path.endsWith("/admin/esims/")) return ESIM;
  if (has("/admin/esims/")) return page([ESIM]);
  if (has("/admin/plans/")) return page([PLAN]);
  if (has("/admin/payments/")) return page([PAYMENT]);
  if (has("/admin/refunds/")) return page([]);
  if (has("/admin/commissions/")) return page([COMMISSION]);
  if (has("/admin/audit-events/")) return page([AUDIT_EVENT]);
  if (has("/admin/supplier-events/")) return page([]);
  if (has("/admin/notifications/")) return page([]);
  if (has("/account/me/")) return { id: "u1", email: "admin@esimflys.dev", is_staff: true };
  return page([]);
}
