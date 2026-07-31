"use client";
import { useEffect } from "react";
import Link from "next/link";
import { UserRound } from "lucide-react";
import { useSession } from "@/features/auth/use-session.client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { routes } from "@/config/routes";

/**
 * Header account control. Auth is a cookie the browser holds, so signed-in state
 * can only come from asking the server — until that answers, neither label is
 * rendered rather than flashing the wrong one.
 */
export function AccountNav({ overHero = false, className }) {
  const user = useSession((s) => s.user);
  const load = useSession((s) => s.load);

  useEffect(() => {
    load();
  }, [load]);

  if (user === undefined) {
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
