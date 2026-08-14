/** Typed route builders — no magic route strings anywhere else (RULES §3).
 *
 * The authenticated detail views take their id from a query string rather than a path
 * segment. That is a deployment constraint, not a preference: the site is a Next static
 * export, and a static export can only emit pages for ids known at build time. Order,
 * eSIM, customer and agency ids are not, so `/account/orders/[id]` had no page to emit.
 *
 * Only private, noindex screens moved. Every public URL — `/`, `/esim/[slug]`, `/help`,
 * `/legal` — keeps its path segment and stays prerendered, so nothing that search or AI
 * crawlers index has changed.
 */
const q = (path, key, value) => `${path}?${key}=${encodeURIComponent(value)}`;

export const routes = {
  home: () => "/",
  destinations: () => "/destinations",
  country: (slug) => `/esim/${slug}`,
  region: (slug) => `/esim/${slug}`,
  checkout: () => "/checkout",
  payment: () => "/checkout/payment",
  confirmation: () => "/checkout/confirmation",
  orderLookup: () => "/orders/lookup",
  account: () => "/account",
  accountEsims: () => "/account/esims",
  accountEsim: (id) => q("/account/esims/detail", "id", id),
  accountOrders: () => "/account/orders",
  accountOrder: (id) => q("/account/orders/detail", "id", id),
  /** Agency tabs are separate static pages; the org travels in `?org=`. */
  agencies: () => "/agency",
  agency: (orgId) => q("/agency/portal", "org", orgId),
  agencyTab: (orgId, slug) =>
    q(slug ? `/agency/${slug}` : "/agency/portal", "org", orgId),
  agencyTabPath: (slug) => (slug ? `/agency/${slug}` : "/agency/portal"),
  admin: () => "/admin",
  adminOrder: (id) => q("/admin/orders/detail", "id", id),
  adminAgency: (id) => q("/admin/agencies/detail", "id", id),
  adminCustomer: (id) => q("/admin/customers/detail", "id", id),
  adminEsim: (id) => q("/admin/esims/detail", "id", id),
  signin: () => "/auth/signin",
  signup: () => "/auth/signup",
  forgotPassword: () => "/auth/forgot-password",
  resetPassword: () => "/auth/reset-password",
  help: () => "/help",
  glossary: () => "/glossary",
  supportedDevices: () => "/supported-devices",
  contact: () => "/contact",
  legal: (doc) => `/legal/${doc}`,
};
