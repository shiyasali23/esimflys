/** Typed route builders — no magic route strings anywhere else (RULES §3). */
export const routes = {
  home: () => "/",
  destinations: () => "/destinations",
  country: (slug) => `/esim/${slug}`,
  region: (slug) => `/esim/${slug}`,
  checkout: () => "/checkout",
  payment: () => "/checkout/payment",
  confirmation: () => "/checkout/confirmation",
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
