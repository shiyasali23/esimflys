import Link from "next/link";
import { AgencySignOut } from "@/features/agency/components/agency-sign-out.client";

/**
 * Chrome for the partner portal.
 *
 * Deliberately not the storefront Header/Footer: an agency is here to read its own
 * sales, not to shop, and the marketing nav ("Browse destinations", the plan pages)
 * invites them into a funnel that isn't theirs.
 */
export default function AgencyLayout({ children }) {
  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          {/*
            `text-xl font-bold tracking-tight`, matching the storefront wordmark exactly.

            This read `text-headline-sm`, which is NOT a token — globals.css defines
            headline-lg and headline-md only, so Tailwind emitted no rule for it and the
            wordmark rendered at inherited 16px regular. It looked like a paragraph, not a
            masthead, in a 64px header. Verified: the built agency.html carried the class
            with no matching CSS rule.
          */}
          <Link href="/agency" className="font-display text-xl font-bold uppercase tracking-tight text-foreground">
            eSIMFlys <span className="text-muted-foreground">Partners</span>
          </Link>
          <AgencySignOut />
        </div>
      </header>

      <main id="main-content" className="flex-1">
        {children}
      </main>

      <footer className="border-t border-border bg-white py-6">
        <div className="mx-auto max-w-6xl px-4 text-body-sm text-muted-foreground">
          eSIMFlys partner portal — sales attributed to your referral code.
        </div>
      </footer>
    </div>
  );
}
