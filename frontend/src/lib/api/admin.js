import { api, toList } from "./client";

/**
 * Platform admin API (ADMIN_API.md §3, plus routes not covered there).
 *
 * Four rules are handled here rather than in components, because each one fails
 * silently rather than loudly — a screen would render plausible but wrong figures:
 *
 *  1. Status changes are ACTIONS, not field edits. `PATCH {status}` is accepted
 *     and discarded; only `POST …/{verb}/` moves an organization or a plan.
 *  2. `wholesale_amount_minor` and `margin_minor` are POPPED from payloads for
 *     roles without pricing capability — the keys are absent, not null, so
 *     `row.margin_minor.toFixed()` throws. Verified: present for platform_admin,
 *     absent for support_admin.
 *  3. Bulk endpoints never abort. They report per-item failures — and the success
 *     key differs: `updated` for plans, `approved` for commissions.
 *  4. Commissions carry `net_minor` (= commission − reversed); the gross figure
 *     overstates what is owed once a refund lands.
 *
 * List shapes are inconsistent: countries and payouts are plain arrays, the rest
 * are paginated.
 */

function query(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== "" && key !== "page") {
      search.set(key, String(value));
    }
  }
  if (params?.page && params.page > 1) search.set("page", String(params.page));
  const string = search.toString();
  return string ? `?${string}` : "";
}

/* ---- dashboard and reports ------------------------------------------------ */

/** `margin` is absent unless the caller holds platform.manage_pricing. */
export function fetchAdminDashboard(params) {
  return api.get(`/admin/dashboard/${query(params)}`);
}

/** True only when the role actually returned pricing data. */
export function hasPricingVisibility(dashboard) {
  return Boolean(dashboard && Object.hasOwn(dashboard, "margin"));
}

/* ---- orders, customers, payments ----------------------------------------- */

export async function fetchAdminOrders(params) {
  return toList(await api.get(`/admin/orders/${query(params)}`));
}

export function fetchAdminOrder(id) {
  return api.get(`/admin/orders/${encodeURIComponent(id)}/`);
}

export async function fetchAdminCustomers(params) {
  return toList(await api.get(`/admin/customers/${query(params)}`));
}

/** This read is audited as PII access. */
export function fetchAdminCustomer(id) {
  return api.get(`/admin/customers/${encodeURIComponent(id)}/`);
}

export async function fetchAdminPayments(params) {
  return toList(await api.get(`/admin/payments/${query(params)}`));
}

export async function fetchAdminRefunds(params) {
  return toList(await api.get(`/admin/refunds/${query(params)}`));
}

/** Finance capability only — support receives 403. Over-refund → 409. */
export function createRefund(orderId, { allocations, reason }) {
  return api.post(`/admin/orders/${encodeURIComponent(orderId)}/refunds/`, {
    allocations,
    ...(reason ? { reason } : {}),
  });
}

/* ---- organizations and lifecycle ----------------------------------------- */

export async function fetchAdminOrganizations(params) {
  return toList(await api.get(`/admin/organizations/${query(params)}`));
}

export function fetchAdminOrganization(id) {
  return api.get(`/admin/organizations/${encodeURIComponent(id)}/`);
}

/**
 * Agencies cannot sign themselves up — no registration, no Google login, no
 * self-service password reset. The platform creates them, so this is the only way
 * one comes into existence.
 */
export function createOrganization({ name, billingEmail, supportEmail, country, organizationType }) {
  return api.post("/admin/organizations/", {
    name,
    billing_email: billingEmail,
    ...(supportEmail ? { support_email: supportEmail } : {}),
    ...(country ? { country } : {}),
    organization_type: organizationType || "travel_agency",
  });
}

/** `status` is read-only here — lifecycle moves go through transitionOrganization. */
export function updateOrganization(id, { name, billingEmail, supportEmail, country }) {
  return api.patch(`/admin/organizations/${encodeURIComponent(id)}/`, {
    ...(name !== undefined ? { name } : {}),
    ...(billingEmail !== undefined ? { billing_email: billingEmail } : {}),
    ...(supportEmail !== undefined ? { support_email: supportEmail } : {}),
    ...(country !== undefined ? { country } : {}),
  });
}

const ORG_TRANSITIONS = {
  pending: ["active", "rejected", "closed"],
  active: ["suspended", "closed"],
  suspended: ["active", "closed"],
  rejected: ["pending", "closed"],
  closed: [],
};

const VERB_FOR_TARGET = {
  active: "activate",
  suspended: "suspend",
  rejected: "reject",
  closed: "close",
  pending: "approve",
};

/** Legal next states for a status, so the UI never offers an illegal move. */
export function allowedTransitions(status) {
  return (ORG_TRANSITIONS[status] || []).map((target) => ({
    target,
    verb: target === "active" && status === "pending" ? "approve" : VERB_FOR_TARGET[target],
    requiresReason: target === "suspended",
  }));
}

/**
 * Suspend REQUIRES a reason. An illegal move returns 409
 * `invalid_status_transition`, whose message names the legal ones — surface it.
 */
export function transitionOrganization(id, verb, { reason } = {}) {
  return api.post(`/admin/organizations/${encodeURIComponent(id)}/${verb}/`, reason ? { reason } : {});
}

export async function fetchOrganizationMembers(id) {
  return toList(await api.get(`/admin/organizations/${encodeURIComponent(id)}/members/`)).results;
}

/**
 * Creates the agency login. `password` is optional but is the only way to give a
 * brand-new member credentials at creation time — they cannot reset their own,
 * and password-reset mail for an agency address silently does nothing.
 */
export function addOrganizationMember(id, { email, role, password, firstName, lastName }) {
  return api.post(`/admin/organizations/${encodeURIComponent(id)}/members/`, {
    email,
    role,
    ...(password ? { password } : {}),
    ...(firstName ? { first_name: firstName } : {}),
    ...(lastName ? { last_name: lastName } : {}),
  });
}

/** Re-issues credentials for an existing member — the platform's only route in. */
export function setMemberPassword(id, memberId, password) {
  return api.post(
    `/admin/organizations/${encodeURIComponent(id)}/members/${encodeURIComponent(memberId)}/set-password/`,
    { password },
  );
}

export function updateOrganizationMember(id, memberId, payload) {
  return api.patch(
    `/admin/organizations/${encodeURIComponent(id)}/members/${encodeURIComponent(memberId)}/`,
    payload,
  );
}

export function removeOrganizationMember(id, memberId) {
  return api.delete(
    `/admin/organizations/${encodeURIComponent(id)}/members/${encodeURIComponent(memberId)}/`,
  );
}

export async function fetchOrganizationTrackingCodes(id) {
  return toList(await api.get(`/admin/organizations/${encodeURIComponent(id)}/tracking-codes/`))
    .results;
}

/** commission_bps defaults to 2000 (20%) and must be 1–10000. No discount fields exist. */
export function issueTrackingCode(id, { code, commissionBps = 2000, usageLimit, endsAt }) {
  return api.post(`/admin/organizations/${encodeURIComponent(id)}/tracking-codes/`, {
    code,
    commission_bps: commissionBps,
    ...(usageLimit !== undefined ? { usage_limit: usageLimit } : {}),
    ...(endsAt !== undefined ? { ends_at: endsAt } : {}),
  });
}

/* ---- eSIMs --------------------------------------------------------------- */

export async function fetchAdminEsims(params) {
  return toList(await api.get(`/admin/esims/${query(params)}`));
}

export function fetchAdminEsim(id) {
  return api.get(`/admin/esims/${encodeURIComponent(id)}/`);
}

/**
 * Credential reveal: a separate capability (superuser, platform_admin,
 * support_admin — finance cannot), rate limited to 10/HOUR, and audited. Must be
 * an explicit action, never auto-loaded with the row.
 */
export function revealEsimCredentials(id) {
  return api.post(`/admin/esims/${encodeURIComponent(id)}/reveal/`);
}

export function refreshAdminEsimUsage(id) {
  return api.post(`/admin/esims/${encodeURIComponent(id)}/refresh-usage/`);
}

/* ---- operations ---------------------------------------------------------- */

export async function fetchSupplierEvents(params) {
  return toList(await api.get(`/admin/supplier-events/${query(params)}`));
}

/**
 * Retry is state-dependent: a `succeeded` job returns 409, because re-running a
 * completed provision could buy a second eSIM.
 */
export function retrySupplierEvent(id) {
  return api.post(`/admin/supplier-events/${encodeURIComponent(id)}/retry/`);
}

const RETRYABLE_STATES = new Set(["failed", "manual_review", "retrying"]);

export function canRetry(job) {
  return RETRYABLE_STATES.has(job?.status);
}

export async function fetchNotifications(params) {
  return toList(await api.get(`/admin/notifications/${query(params)}`));
}

export function retryNotification(id) {
  return api.post(`/admin/notifications/${encodeURIComponent(id)}/retry/`);
}

/** Read-only: POST/PATCH/DELETE all return 405. */
export async function fetchAuditEvents(params) {
  return toList(await api.get(`/admin/audit-events/${query(params)}`));
}

/* ---- catalogue ----------------------------------------------------------- */

export async function fetchAdminPlans(params) {
  return toList(await api.get(`/admin/plans/${query(params)}`));
}

/** verb: activate | pause | draft */
export function setPlanStatus(id, verb) {
  return api.post(`/admin/plans/${encodeURIComponent(id)}/${verb}/`);
}

export function bulkSetPlanStatus(planIds, status) {
  return api.post("/admin/plans/bulk-status/", { plan_ids: planIds, status });
}

/** Plain array of all 68 countries. */
export async function fetchAdminCountries(params) {
  return toList(await api.get(`/admin/countries/${query(params)}`)).results;
}

/** Turns on every sellable plan for one country — the usual go-live action. */
export function activateCountryPlans(id) {
  return api.post(`/admin/countries/${encodeURIComponent(id)}/activate-plans/`);
}

/* ---- commissions and payouts -------------------------------------------- */

export async function fetchAdminCommissions(params) {
  return toList(await api.get(`/admin/commissions/${query(params)}`));
}

export function approveCommission(id) {
  return api.post(`/admin/commissions/${encodeURIComponent(id)}/approve/`);
}

export function bulkApproveCommissions(commissionIds) {
  return api.post("/admin/commissions/bulk-approve/", { commission_ids: commissionIds });
}

/**
 * Payouts complete the commission flow: review → approve → group into a payout →
 * mark paid. There is no bank integration; "paid" records an out-of-band transfer.
 *
 * This list is a PLAIN ARRAY, not a paginated envelope — verified live, and one of
 * the two endpoints the contract calls out as inconsistent.
 */
export async function fetchAdminPayouts(params) {
  return toList(await api.get(`/admin/payouts/${query(params)}`)).results;
}

/**
 * Groups every APPROVED commission for the organization inside the period into one
 * payout. The server computes the amount — never send a total.
 */
export function createPayout({ organization, periodStart, periodEnd, currency }) {
  return api.post("/admin/payouts/", {
    organization,
    period_start: periodStart,
    period_end: periodEnd,
    ...(currency ? { currency } : {}),
  });
}

/** Records a transfer that already happened elsewhere; it moves no money itself. */
export function markPayoutPaid(id, { reference, method } = {}) {
  return api.post(`/admin/payouts/${encodeURIComponent(id)}/pay/`, {
    ...(reference ? { reference } : {}),
    ...(method ? { method } : {}),
  });
}

/**
 * Normalises a bulk result. The success key is `updated` for plans and `approved`
 * for commissions — reading only one reports zero successes for the other.
 *
 * @returns {{succeeded: string[], failed: Array<{id: string, error: string}>, partial: boolean}}
 */
export function readBulkResult(result) {
  const succeeded = result?.updated ?? result?.approved ?? [];
  const failed = Array.isArray(result?.failed) ? result.failed : [];
  return {
    succeeded: Array.isArray(succeeded) ? succeeded : [],
    failed,
    partial: failed.length > 0 && (Array.isArray(succeeded) ? succeeded.length : 0) > 0,
  };
}
