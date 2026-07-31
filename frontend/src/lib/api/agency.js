import { api, toList } from "./client";

/**
 * Travel-agency panel — reporting only (ADMIN_API.md §4).
 *
 * Every path is tenant-scoped. Two rules shape everything here, and both are
 * verified against live responses:
 *
 *  - **There is no customer data.** The sales payload has no `customer_email`
 *    field at all. Don't add a customer column; there is nothing behind it.
 *  - **404 means "not yours or doesn't exist"**, never 403 — the two are
 *    deliberately indistinguishable, so the UI must show a generic not-found and
 *    never name the organization.
 *
 * List shapes are inconsistent by design: sales, commissions, payouts and
 * activity are paginated; tracking codes and members are plain arrays.
 */

function scope(orgId, path) {
  return `/agency/${encodeURIComponent(orgId)}${path}`;
}

function pageQuery(page) {
  return page > 1 ? `?page=${encodeURIComponent(page)}` : "";
}

/** The user's memberships — the storefront endpoint, not an agency one. */
export async function fetchMyOrganizations() {
  return toList(await api.get("/organizations/")).results;
}

/** No `margin` key, ever. */
export function fetchAgencyDashboard(orgId) {
  return api.get(scope(orgId, "/dashboard/"));
}

export async function fetchAgencySales(orgId, { page = 1 } = {}) {
  return toList(await api.get(scope(orgId, `/sales/${pageQuery(page)}`)));
}

export async function fetchAgencyCommissions(orgId, { page = 1, status } = {}) {
  const query = new URLSearchParams();
  if (page > 1) query.set("page", String(page));
  if (status) query.set("status", status);
  const suffix = query.toString() ? `?${query}` : "";
  return toList(await api.get(scope(orgId, `/commissions/${suffix}`)));
}

export async function fetchAgencyPayouts(orgId, { page = 1 } = {}) {
  return toList(await api.get(scope(orgId, `/payouts/${pageQuery(page)}`)));
}

/** Plain array. Read-only — only the platform issues codes. */
export async function fetchAgencyTrackingCodes(orgId) {
  return toList(await api.get(scope(orgId, "/tracking-codes/"))).results;
}

export function fetchAgencyProfile(orgId) {
  return api.get(scope(orgId, "/profile/"));
}

/**
 * Only name, billing_email, support_email and country are writable, and only with
 * the manage_profile capability. `status` and the commission fields are read-only:
 * sending them is accepted and silently ignored — confirmed against the running
 * server — so they must never be rendered as editable inputs.
 */
export function updateAgencyProfile(orgId, { name, billingEmail, supportEmail, country }) {
  return api.patch(scope(orgId, "/profile/"), {
    ...(name !== undefined ? { name } : {}),
    ...(billingEmail !== undefined ? { billing_email: billingEmail } : {}),
    ...(supportEmail !== undefined ? { support_email: supportEmail } : {}),
    ...(country !== undefined ? { country } : {}),
  });
}

/** Plain array. */
export async function fetchAgencyMembers(orgId) {
  return toList(await api.get(scope(orgId, "/members/"))).results;
}

/** A user may only grant roles strictly below their own — otherwise 403. */
export function addAgencyMember(orgId, { email, role }) {
  return api.post(scope(orgId, "/members/"), { email, role });
}

export function updateAgencyMember(orgId, memberId, { role, status }) {
  return api.patch(scope(orgId, `/members/${encodeURIComponent(memberId)}/`), {
    ...(role !== undefined ? { role } : {}),
    ...(status !== undefined ? { status } : {}),
  });
}

export function removeAgencyMember(orgId, memberId) {
  return api.delete(scope(orgId, `/members/${encodeURIComponent(memberId)}/`));
}

/** {series: [{date, sales_minor, orders}]} */
export function fetchAgencyRevenue(orgId, { dateFrom, dateTo } = {}) {
  const query = new URLSearchParams();
  if (dateFrom) query.set("date_from", dateFrom);
  if (dateTo) query.set("date_to", dateTo);
  const suffix = query.toString() ? `?${query}` : "";
  return api.get(scope(orgId, `/reports/revenue/${suffix}`));
}

export async function fetchAgencyActivity(orgId, { page = 1 } = {}) {
  return toList(await api.get(scope(orgId, `/activity/${pageQuery(page)}`)));
}

export const AGENCY_ROLES = ["owner", "admin", "buyer", "viewer"];

/** owner > admin > buyer > viewer; a member may only grant strictly below their own. */
export function assignableRoles(myRole) {
  const index = AGENCY_ROLES.indexOf(myRole);
  return index < 0 ? [] : AGENCY_ROLES.slice(index + 1);
}

export function canManageAgency(myRole) {
  return myRole === "owner" || myRole === "admin";
}
