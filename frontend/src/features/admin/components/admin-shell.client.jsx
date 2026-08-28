"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { fetchAdminDashboard } from "@/lib/api/admin";
import { useSession } from "@/features/auth/use-session.client";
import { Container } from "@/components/ui/container";
import { EmptyState } from "@/components/feedback/empty-state";
import { AdminSignIn } from "@/features/admin/components/admin-sign-in.client";
import { ErrorState } from "@/components/feedback/error-state";
import { routes } from "@/config/routes";
import { cn } from "@/lib/cn";

const SECTIONS = [
  { slug: "", label: "Dashboard" },
  { slug: "orders", label: "Orders" },
  { slug: "customers", label: "Customers" },
  { slug: "esims", label: "eSIMs" },
  { slug: "promo-codes", label: "Promo codes" },
  { slug: "agencies", label: "Agencies" },
  { slug: "commissions", label: "Commissions" },
  { slug: "payouts", label: "Payouts" },
  { slug: "catalogue", label: "Catalogue" },
  { slug: "payments", label: "Payments" },
  { slug: "operations", label: "Operations" },
  { slug: "webhooks", label: "Webhooks" },
  { slug: "audit", label: "Audit" },
];

/**
 * Chrome for the platform admin panel.
 *
 * Access is probed by calling the dashboard: `is_staff` alone grants nothing here
 * — API access requires membership of a platform role group — so the only honest
 * way to know whether this user may use the panel is to ask the API. A 403 renders
 * a plain "no access" rather than an empty shell.
 *
 * The nav renders immediately; only the content waits on the probe, so the panel
 * does not jump as it resolves.
 */
export function AdminShell({ title, children }) {
  const pathname = usePathname();
  const user = useSession((s) => s.user);
  const sessionError = useSession((s) => s.error);
  const loadSession = useSession((s) => s.load);
  const retrySession = useSession((s) => s.retry);
  const [access, setAccess] = useState(undefined);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (user === undefined) return;
    if (user === null) {
      setAccess(false);
      return;
    }
    let active = true;
    fetchAdminDashboard()
      .then(() => active && setAccess(true))
      .catch((error) => active && setAccess(error?.status === 403 ? false : true));
    return () => {
      active = false;
    };
  }, [user]);

  /*
   * A failed probe is NOT a signed-out session. Showing a sign-in prompt here
   * because the server hiccuped would tell a signed-in admin they'd been logged
   * out, with nothing to act on.
   */
  if (sessionError) {
    return (
      <Container className="py-16">
        <ErrorState
          error={sessionError}
          title="We couldn't verify your session"
          onRetry={retrySession}
        />
      </Container>
    );
  }

  /**
   * Staff sign in HERE, not on the storefront page. Bouncing an admin to
   * /auth/signin offered them Google, a sign-up link and a password reset — three
   * routes that cannot create or recover a staff account — and lost whichever
   * admin page they were trying to reach.
   */
  if (user === null) {
    return (
      <Container className="py-16">
        {/* setUser flips `user`, which re-runs the access probe below. */}
        <AdminSignIn />
      </Container>
    );
  }

  if (access === false) {
    return (
      <Container className="py-16">
        <EmptyState
          icon={ShieldAlert}
          title="No access"
          body="Your account doesn't have platform admin permissions. Ask an owner to grant them."
          action={{ label: "Back to account", href: routes.account() }}
        />
      </Container>
    );
  }

  const base = routes.admin();

  return (
    <Container className="py-12">
      <header className="mb-8">
        <p className="text-label-caps uppercase text-muted-foreground">Platform admin</p>
        <h1 className="mt-1 font-display text-headline-lg uppercase text-foreground">
          {title || "Dashboard"}
        </h1>
        <nav aria-label="Admin sections" className="mt-6 overflow-x-auto">
          <ul className="flex gap-1 border-b border-border">
            {SECTIONS.map((section) => {
              const href = section.slug ? `${base}/${section.slug}` : base;
              const active = section.slug
                ? pathname.startsWith(href)
                : pathname === base || pathname === `${base}/`;
              return (
                <li key={section.slug || "dashboard"}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "-mb-px inline-block whitespace-nowrap border-b-2 px-4 py-3 text-label-bold transition-colors",
                      active
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {section.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      {access === undefined ? (
        <div className="min-h-[22rem] space-y-2" aria-busy="true">
          <div className="h-12 animate-pulse rounded-md bg-muted/70" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ) : (
        children
      )}
    </Container>
  );
}
