/**
 * The admin route group renders NO storefront chrome.
 *
 * This previously imported the customer `Header` and `Footer` and padded the page with
 * `pt-20` to clear them. That header is the shop's — it offers Destinations, How it
 * works, a currency switcher and a Get eSIM Now button, none of which belong on a
 * screen where somebody is reconciling payouts, and it cost 68px of every viewport.
 *
 * They are not hidden here; they are absent. `AdminShell` renders `AdminSurface`,
 * which owns the whole viewport. Nothing in this subtree imports storefront chrome, so
 * there is no CSS rule holding it back that a later change can quietly remove.
 *
 * `<main id="main-content">` moved into `AdminSurface` with the scroll container, so
 * the skip link still lands on the scrollable region rather than above it.
 */
export default function AdminLayout({ children }) {
  return children;
}
