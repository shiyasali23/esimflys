/**
 * The agency route group renders no chrome of its own.
 *
 * This previously owned a 64px masthead and a footer, both laid out at `max-w-6xl` —
 * the storefront grid — so a partner reading their own sales saw the same letterboxed
 * column as the platform panel did.
 *
 * `AgencyShell` now renders the shared `AdminSurface`, so both operational surfaces
 * have one shell, one sidebar and one set of tokens. The sign-out control moved into
 * that shell's top bar rather than a masthead of its own.
 */
export default function AgencyLayout({ children }) {
  return children;
}
