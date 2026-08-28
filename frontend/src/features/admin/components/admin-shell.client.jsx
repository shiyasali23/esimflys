"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BadgePercent,
  Building2,
  ClipboardList,
  CreditCard,
  FileClock,
  LayoutDashboard,
  Package,
  Percent,
  Search,
  ShieldAlert,
  Smartphone,
  Users,
  Wallet,
  Webhook,
} from "lucide-react";
import { fetchAdminDashboard } from "@/lib/api/admin";
import { useSession } from "@/features/auth/use-session.client";
import { Container } from "@/components/ui/container";
import { AdminSurface } from "@/features/admin/components/admin-surface.client";
import { AdminAccountMenu } from "@/features/admin/components/admin-account-menu.client";
import { EmptyState } from "@/components/feedback/empty-state";
import { AdminSignIn } from "@/features/admin/components/admin-sign-in.client";
import { ErrorState } from "@/components/feedback/error-state";
import { routes } from "@/config/routes";
import { cn } from "@/lib/cn";

/**
 * Grouped rather than a flat list of fourteen.
 *
 * The horizontal tab strip this replaces held all fourteen in one row, which scrolled
 * sideways and hid its own contents past "Catalogue". Grouping is what makes a rail of
 * this length scannable: an operator looking for Webhooks now looks under Operations
 * instead of reading fourteen labels.
 *
 * The order is by how often a shift actually starts there — daily work, then money,
 * then partners, then the things you open when something is wrong.
 */
const GROUPS = [
  {
    label: null,
    items: [
      { slug: "", label: "Dashboard", icon: LayoutDashboard },
      { slug: "search", label: "Search", icon: Search },
    ],
  },
  {
    label: "Commerce",
    items: [
      { slug: "orders", label: "Orders", icon: ClipboardList },
      { slug: "customers", label: "Customers", icon: Users },
      { slug: "esims", label: "eSIMs", icon: Smartphone },
      { slug: "promo-codes", label: "Promo codes", icon: BadgePercent },
      { slug: "catalogue", label: "Catalogue", icon: Package },
    ],
  },
  {
    label: "Money",
    items: [
      { slug: "payments", label: "Payments", icon: CreditCard },
      { slug: "commissions", label: "Commissions", icon: Percent },
      { slug: "payouts", label: "Payouts", icon: Wallet },
    ],
  },
  {
    label: "Partners",
    items: [{ slug: "agencies", label: "Agencies", icon: Building2 }],
  },
  {
    label: "Operations",
    items: [
      { slug: "operations", label: "Operations", icon: Activity },
      { slug: "webhooks", label: "Webhooks", icon: Webhook },
      { slug: "audit", label: "Audit", icon: FileClock },
    ],
  },
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
      <Container className="py-16" data-surface="admin">
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
      <Container className="py-16" data-surface="admin">
        {/* setUser flips `user`, which re-runs the access probe below. */}
        <AdminSignIn />
      </Container>
    );
  }

  if (access === false) {
    return (
      <Container className="py-16" data-surface="admin">
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

  /*
   * Hrefs are built here, once, so the sidebar stays a presentation component with no
   * knowledge of this panel's route shape.
   */
  const groups = GROUPS.map((group) => ({
    label: group.label,
    items: group.items.map((item) => ({
      ...item,
      href: item.slug ? `${base}/${item.slug}` : base,
    })),
  }));

  /*
   * Dashboard is an exact match; everything else is a prefix.
   *
   * `startsWith` on the bare base would mark Dashboard active on every page in the
   * panel, since every route begins with it — the same trap the old tab strip handled
   * and which is easy to lose when nav moves.
   */
  const activeFor = (item, pathname) =>
    item.slug
      ? pathname.startsWith(item.href)
      : pathname === base || pathname === `${base}/`;

  return (
    <AdminSurface
      brand="eSIMFlys"
      groups={groups}
      activeFor={activeFor}
      title={title || "Dashboard"}
      actions={<AdminAccountMenu redirectTo={routes.admin()} />}
    >
      {access === undefined ? (
        <div className="space-y-2" aria-busy="true">
          <div className="h-9 animate-pulse rounded-admin-sm bg-admin-border-subtle" />
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-admin-sm bg-admin-border-subtle" />
          ))}
        </div>
      ) : (
        children
      )}
    </AdminSurface>
  );
}
