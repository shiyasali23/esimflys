"use client";
import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, LayoutDashboard, Percent, ShoppingBag, Wallet } from "lucide-react";
import { useSession } from "@/features/auth/use-session.client";
import { useAgency, findOrganization } from "@/features/agency/use-agency.client";
import { Container } from "@/components/ui/container";
import { AdminSurface } from "@/features/admin/components/admin-surface.client";
import { AdminAccountMenu } from "@/features/admin/components/admin-account-menu.client";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { StatusBadge } from "@/components/data/status-badge";
import { routes } from "@/config/routes";
import { cn } from "@/lib/cn";

/**
 * The portal is read-only by design: an agency sees what its referral code sold and
 * what it earned, nothing else. Staff, profile and referral codes are all issued and
 * changed by the platform, so there are no screens for them here.
 */
const TABS = [
  { slug: "", label: "Dashboard", icon: LayoutDashboard },
  { slug: "sales", label: "Sales", icon: ShoppingBag },
  { slug: "commissions", label: "Commissions", icon: Percent },
  { slug: "payouts", label: "Payouts", icon: Wallet },
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
      <Container className="py-16" data-surface="admin">
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
      <Container className="py-16" data-surface="admin">
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
      <Container className="py-16" data-surface="admin">
        <EmptyState
          icon={Building2}
          title="Not found"
          body="We couldn't find that agency. Check the link, or pick one of your organizations."
          action={{ label: "Back to account", href: routes.account() }}
        />
      </Container>
    );
  }

  /*
   * Tabs are sibling static pages carrying `?org=`, not path segments under the org id,
   * so the active check compares the PATHNAME only. `href` carries a query string and
   * would never equal a bare pathname — the same trap the tab strip handled, preserved
   * here verbatim because losing it silently un-highlights the whole nav.
   */
  const groups = [
    {
      label: null,
      items: TABS.map((tab) => ({
        ...tab,
        href: routes.agencyTab(orgId, tab.slug),
        path: routes.agencyTabPath(tab.slug),
      })),
    },
  ];
  const activeFor = (item, pathname) =>
    pathname === item.path || pathname === `${item.path}/`;

  return (
    <AdminSurface
      brand="eSIMFlys Partners"
      groups={groups}
      activeFor={activeFor}
      title={title || (resolving ? "Agency" : organization.name)}
      actions={
        <>
          {!resolving && organizations.length > 1 ? (
          <label className="flex items-center gap-2">
            <span className="text-admin-label text-admin-text-muted">Organization</span>
            <select
              value={orgId}
              onChange={(e) => {
                window.location.href = routes.agency(e.target.value);
              }}
              className="h-8 rounded-admin-sm border border-admin-border bg-admin-surface px-2 text-admin-body text-admin-text"
            >
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          ) : !resolving ? (
            <>
              {organization.is_demo ? (
                <span className="rounded-full bg-admin-accent-tint px-1.5 py-0.5 text-admin-caps uppercase text-admin-accent-ink">
                  Demo
                </span>
              ) : null}
              <StatusBadge status={organization.status} />
            </>
          ) : null}
          {/* Clearing the membership cache is part of signing out, not a side effect of
              the next sign-in: the next account on this browser must not inherit it. */}
          <AdminAccountMenu
            onSignedOut={() => useAgency.getState().reset()}
            redirectTo="/agency"
          />
        </>
      }
    >
      {resolving ? (
        <div className="space-y-2" aria-busy="true">
          <div className="h-9 animate-pulse rounded-admin-sm bg-admin-border-subtle" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-admin-sm bg-admin-border-subtle" />
          ))}
        </div>
      ) : (
        children
      )}
    </AdminSurface>
  );
}
