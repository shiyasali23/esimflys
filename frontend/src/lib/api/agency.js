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

/** Plain array. */
export async function fetchAgencyMembers(orgId) {
  return toList(await api.get(scope(orgId, "/members/"))).results;
}

export const AGENCY_ROLES = ["owner", "admin", "buyer", "viewer"];

export function canManageAgency(myRole) {
  return myRole === "owner" || myRole === "admin";
}
