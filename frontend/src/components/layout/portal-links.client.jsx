"use client";
import { useEffect } from "react";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { useSession } from "@/features/auth/use-session.client";
import { usePortals } from "@/features/auth/use-portals.client";
import { cn } from "@/lib/cn";
import { routes } from "@/config/routes";

/**
 * A link back to the agency portal, for a partner who wandered onto the storefront.
 *
 * There is deliberately NO admin link. Advertising the admin panel in the public
 * header buys nothing — staff know the URL — while putting its location in front of
 * every customer who happens to be signed in.
 *
 * Membership is probed server-side rather than guessed from the account payload, so
 * nothing renders for a customer and no link is ever shown that would land on
 * "no access".
 */
export function PortalLinks({ overHero = false }) {
  const user = useSession((s) => s.user);
  const { organizations, load } = usePortals();

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  if (!user || organizations === undefined) return null;

  const agency = organizations?.[0];
  if (!agency) return null;

  const style = cn(
    "hidden items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-semibold transition-colors lg:inline-flex",
    overHero
      ? "border-white/40 bg-white/10 text-white hover:bg-white/20"
      : "border-border text-foreground hover:bg-muted",
  );

  return (
    <Link href={routes.agency(agency.id)} className={style} title={agency.name}>
      <Building2 size={16} aria-hidden />
      Agency
    </Link>
  );
}
