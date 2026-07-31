"use client";
import { useEffect } from "react";
import Link from "next/link";
import { Building2, ShieldCheck } from "lucide-react";
import { useSession } from "@/features/auth/use-session.client";
import { usePortals } from "@/features/auth/use-portals.client";
import { cn } from "@/lib/cn";
import { routes } from "@/config/routes";

/**
 * Links to the agency and admin portals, for the people who have them.
 *
 * Without these the panels are reachable only by typing a URL. Both are probed
 * server-side rather than guessed from the account payload, so nothing appears
 * for a customer — and a link is never shown that would land on "no access".
 *
 * A user may hold both.
 */
export function PortalLinks({ overHero = false }) {
  const user = useSession((s) => s.user);
  const { organizations, isAdmin, load } = usePortals();

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  if (!user || organizations === undefined) return null;

  const agency = organizations?.[0];
  if (!agency && !isAdmin) return null;

  const style = cn(
    "hidden items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-semibold transition-colors lg:inline-flex",
    overHero
      ? "border-white/40 bg-white/10 text-white hover:bg-white/20"
      : "border-border text-foreground hover:bg-muted",
  );

  return (
    <>
      {agency ? (
        <Link href={routes.agency(agency.id)} className={style} title={agency.name}>
          <Building2 size={16} aria-hidden />
          Agency
        </Link>
      ) : null}
      {isAdmin ? (
        <Link href={routes.admin()} className={style}>
          <ShieldCheck size={16} aria-hidden />
          Admin
        </Link>
      ) : null}
    </>
  );
}
