"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { UserRound } from "lucide-react";
import { useSession, hasSessionHint } from "@/features/auth/use-session.client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { routes } from "@/config/routes";

/**
 * Header account control. Auth is a cookie the browser holds, so signed-in state
 * can only come from asking the server — until that answers, neither label is
 * rendered rather than flashing the wrong one.
 *
 * This control sits in the header of every public page, so an unconditional probe
 * meant each anonymous visit called `/account/me/` and took a 403 — a console error
 * on every storefront page, and the thing that broke the invariant
 * `AccountCurrencySync` documents. A browser that has never signed in is rendered
 * signed-out without asking; the probe still runs for anyone who has.
 *
 * `probed` starts false so the first client render matches the server's, then the
 * effect decides — otherwise the two disagree and hydration warns.
 */
export function AccountNav({ overHero = false, className }) {
  const user = useSession((s) => s.user);
  const load = useSession((s) => s.load);
  const [probed, setProbed] = useState(false);

  useEffect(() => {
    // Only resolve to "signed out" here when there is nothing to ask about. With a
    // hint, keep the placeholder until the server answers — flipping to "Sign in"
    // mid-probe would flash the wrong label at someone who is signed in.
    if (hasSessionHint()) load();
    else setProbed(true);
  }, [load]);

  if (user === undefined && !probed) {
    return <span className={cn("hidden h-9 w-24 rounded-full bg-muted/40 sm:block", className)} aria-hidden />;
  }

  if (user) {
    return (
      <Link
        href={routes.account()}
        className={cn(
          "hidden items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold transition-colors sm:inline-flex",
          overHero
            ? "border-white/40 bg-white/10 text-white hover:bg-white/20"
            : "border-border text-foreground hover:bg-muted",
          className,
        )}
      >
        <UserRound size={16} aria-hidden />
        <span className="max-w-28 truncate">{user.first_name || "Account"}</span>
      </Link>
    );
  }

  return (
    <Button
      href={routes.signin()}
      variant="outline"
      size="sm"
      className={cn(
        "hidden sm:inline-flex",
        overHero && "border-white/40 bg-white/10 text-white hover:bg-white/20",
        className,
      )}
    >
      Sign in
    </Button>
  );
}
