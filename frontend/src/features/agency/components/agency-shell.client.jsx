"use client";
import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2 } from "lucide-react";
import { useSession } from "@/features/auth/use-session.client";
import { useAgency, findOrganization } from "@/features/agency/use-agency.client";
import { Container } from "@/components/ui/container";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { StatusBadge } from "@/components/data/status-badge";
import { routes } from "@/config/routes";
import { cn } from "@/lib/cn";

const TABS = [
  { slug: "", label: "Dashboard" },
  { slug: "sales", label: "Sales" },
  { slug: "commissions", label: "Commissions" },
  { slug: "payouts", label: "Payouts" },
  { slug: "tracking-codes", label: "Tracking codes" },
  { slug: "reports", label: "Reports" },
  { slug: "staff", label: "Staff" },
  { slug: "profile", label: "Profile" },
  { slug: "activity", label: "Activity" },
];

/**
 * Chrome for every agency screen: tenant resolution, nav, and a tenant switcher
 * when the user belongs to more than one organization.
 *
 * The membership check happens here so a tenant the user has no claim on renders
 * one generic not-found — the backend answers 404 rather than 403 precisely so
 * that the existence of another agency is never confirmed, and this must not leak
 * it either by wording or by rendering a partial page.
 */
export function AgencyShell({ orgId, title, children }) {
  const pathname = usePathname();
  const user = useSession((s) => s.user);
  const sessionError = useSession((s) => s.error);
  const loadSession = useSession((s) => s.load);
  const retrySession = useSession((s) => s.retry);
  const { organizations, load } = useAgency();

  useEffect(() => {
    loadSession();
    load();
  }, [loadSession, load]);

  /*
   * The nav only needs `orgId`, which is known immediately, so the chrome renders
   * on first paint and only the org name and content wait on the fetch. Replacing
   * a single placeholder box with the full header + 9-tab nav was the dominant
   * layout shift on these pages, and it also meant staring at an empty box while
   * two requests resolved.
   */
  const resolving = user === undefined || organizations === undefined;

  // A failed probe is not a signed-out session — offer retry, not a sign-in prompt.
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

  if (!resolving && user === null) {
    return (
      <Container className="py-16">
        <EmptyState
          icon={Building2}
          title="Sign in to your agency"
          body="Agency reporting is available to members of a partner organization."
          action={{ label: "Sign in", href: routes.signin() }}
        />
      </Container>
    );
  }

  const organization = findOrganization(organizations, orgId);

  // Only a resolved membership list can prove a tenant isn't the user's.
  if (!resolving && !organization) {
    return (
      <Container className="py-16">
        <EmptyState
          icon={Building2}
          title="Not found"
          body="We couldn't find that agency. Check the link, or pick one of your organizations."
          action={{ label: "Back to account", href: routes.account() }}
        />
      </Container>
    );
  }

  const base = routes.agency(orgId);

  return (
    <Container className="py-12">
      <header className="mb-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-label-caps uppercase text-muted-foreground">Agency portal</p>
            <h1 className="mt-1 flex min-h-11 flex-wrap items-center gap-3 font-display text-headline-lg uppercase text-foreground">
              {resolving ? (
                <span className="inline-block h-8 w-56 animate-pulse rounded bg-muted" aria-busy="true" />
              ) : (
                <>
                  {organization.name}
                  <StatusBadge status={organization.status} />
                </>
              )}
            </h1>
          </div>
          {!resolving && organizations.length > 1 ? (
            <label className="text-body-sm">
              <span className="mb-1 block text-muted-foreground">Organization</span>
              <select
                value={orgId}
                onChange={(e) => {
                  window.location.href = routes.agency(e.target.value);
                }}
                className="rounded-md border border-border bg-white px-3 py-2 text-body-sm text-foreground"
              >
                {organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        <nav aria-label="Agency sections" className="mt-6 overflow-x-auto">
          <ul className="flex gap-1 border-b border-border">
            {TABS.map((tab) => {
              const href = tab.slug ? `${base}/${tab.slug}` : base;
              const active = tab.slug
                ? pathname.startsWith(href)
                : pathname === base || pathname === `${base}/`;
              return (
                <li key={tab.slug || "dashboard"}>
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
                    {tab.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      {title ? (
        <h2 className="mb-6 font-display text-headline-md text-foreground">{title}</h2>
      ) : null}
      {children}
    </Container>
  );
}
