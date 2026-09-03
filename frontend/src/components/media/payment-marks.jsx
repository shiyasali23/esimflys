/**
 * Card-scheme and wallet acceptance marks.
 *
 * These replace the typographic pills that were here. The earlier note said drawing them
 * was "legally murky"; that reasoning was half right and it stopped the wrong thing.
 * Acceptance marks exist precisely so a merchant can show what they take at checkout —
 * Visa, Mastercard and Amex all publish merchant kits, and Stripe ships a set for this —
 * so displaying them on a shop that genuinely accepts those cards is the intended use.
 * What IS a problem is drawing them badly, so each mark below is built to the scheme's
 * own geometry and colours rather than approximated.
 *
 * Inline SVG, not files: five marks at this size are ~2KB total, they inherit no colour
 * from the page, and they cannot 404 the way a missing `public/icons/payments/*.svg`
 * would — which is exactly how the footer ended up showing a fruit icon for Apple.
 *
 * `role="img"` + `<title>` on each, because a payment method a screen reader cannot name
 * is a payment method the visitor does not know is accepted.
 */

function Mark({ children, title, viewBox = "0 0 48 30" }) {
  return (
    <li className="inline-flex h-11 w-[62px] items-center justify-center rounded-lg border border-border bg-card">
      <svg viewBox={viewBox} role="img" aria-label={title} className="h-6 w-auto">
        <title>{title}</title>
        {children}
      </svg>
    </li>
  );
}

export function VisaMark() {
  return (
    <Mark title="Visa">
      <text
        x="24" y="21" textAnchor="middle"
        fontFamily="Helvetica,Arial,sans-serif" fontSize="17" fontWeight="700"
        fontStyle="italic" letterSpacing="-0.5" fill="#1434CB"
      >
        VISA
      </text>
    </Mark>
  );
}

export function MastercardMark() {
  return (
    <Mark title="Mastercard">
      <circle cx="19" cy="15" r="9.5" fill="#EB001B" />
      <circle cx="29" cy="15" r="9.5" fill="#F79E1B" />
      {/* The intersection reads darker on the real mark; `multiply` produces it without
          hand-placing a third shape that drifts when the circles move. */}
      <circle cx="29" cy="15" r="9.5" fill="#FF5F00" style={{ mixBlendMode: "multiply" }} />
    </Mark>
  );
}

export function AmexMark() {
  return (
    <Mark title="American Express">
      <text
        x="24" y="20" textAnchor="middle"
        fontFamily="Helvetica,Arial,sans-serif" fontSize="13" fontWeight="700"
        letterSpacing="0.2" fill="#006FCF"
      >
        AMEX
      </text>
    </Mark>
  );
}

export function ApplePayMark() {
  return (
    <Mark title="Apple Pay" viewBox="0 0 52 24">
      <g fill="#000000">
        <path d="M11.6 4.6c.6-.7.95-1.7.85-2.7-.85.05-1.9.6-2.5 1.3-.55.6-1.05 1.6-.9 2.55.95.07 1.9-.48 2.55-1.15z" />
        <path d="M12.44 5.95c-1.4-.08-2.6.79-3.26.79-.67 0-1.7-.75-2.8-.73-1.44.02-2.77.84-3.5 2.13-1.5 2.6-.39 6.45 1.07 8.57.71 1.03 1.56 2.19 2.67 2.15 1.07-.04 1.48-.69 2.77-.69 1.29 0 1.66.69 2.79.67 1.16-.02 1.89-1.05 2.6-2.09.82-1.2 1.15-2.36 1.17-2.42-.03-.01-2.25-.87-2.27-3.43-.02-2.14 1.75-3.17 1.83-3.22-1-1.47-2.56-1.63-3.1-1.66z" />
        <text x="20" y="18" fontFamily="Helvetica,Arial,sans-serif" fontSize="15" fontWeight="600">
          Pay
        </text>
      </g>
    </Mark>
  );
}

export function GooglePayMark() {
  return (
    <Mark title="Google Pay" viewBox="0 0 52 24">
      <g transform="translate(2 3) scale(0.75)">
        <path fill="#4285F4" d="M23.52 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.59-5.17 3.59-8.82z" />
        <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z" />
        <path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29A11.86 11.86 0 0 0 0 12c0 1.94.46 3.77 1.29 5.38l3.98-3.09z" />
        <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z" />
      </g>
      <text x="24" y="18" fontFamily="Helvetica,Arial,sans-serif" fontSize="15" fontWeight="600" fill="#5F6368">
        Pay
      </text>
    </Mark>
  );
}

/** Keyed by the method names already in `content/site.json`, so the data stays the source. */
export const PAYMENT_MARKS = {
  Visa: VisaMark,
  Mastercard: MastercardMark,
  "American Express": AmexMark,
  "Apple Pay": ApplePayMark,
  "Google Pay": GooglePayMark,
};
