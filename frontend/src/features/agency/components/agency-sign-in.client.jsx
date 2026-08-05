"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Eye, EyeOff } from "lucide-react";
import { login } from "@/lib/api/session";
import { useSession } from "@/features/auth/use-session.client";
import { useAgency } from "@/features/agency/use-agency.client";
import { EmptyState } from "@/components/feedback/empty-state";
import { fieldErrors } from "@/lib/api/errors";
import { routes } from "@/config/routes";

/**
 * The partner portal door at /agency — the single link handed to a travel agency.
 *
 * Deliberately NOT the storefront auth card. An agency account cannot sign itself
 * up, cannot use Google, and cannot reset its own password: the backend refuses all
 * three, and a reset request for an agency address returns the normal success
 * message while silently doing nothing. Showing those controls would send a partner
 * down a path that cannot work and looks like our bug. Credentials are issued by the
 * platform, so the only recovery route is asking us.
 *
 * It also resolves where to go, so the agency never has to know its own id:
 *   signed out            -> this form
 *   signed in, has agency -> straight into that agency's dashboard
 *   signed in, no agency  -> a dead end that does not hint that other agencies exist
 */
export function AgencySignIn() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const loadSession = useSession((s) => s.load);
  const setUser = useSession((s) => s.setUser);
  const organizations = useAgency((s) => s.organizations);
  const loadAgencies = useAgency((s) => s.load);

  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // Memberships only mean anything once there is a session to attach them to.
  useEffect(() => {
    if (user) loadAgencies();
  }, [user, loadAgencies]);

  const organization = organizations?.[0] || null;

  /**
   * Only an ACTIVE agency may enter. The backend 404s every agency endpoint unless
   * the organization is active, so redirecting a suspended partner lands them on
   * "We couldn't load your dashboard — Not found." — which reads as a broken site
   * rather than a suspension, and produces a support email instead of a payment.
   */
  const isActive = organization?.status === "active";
  const target = user && isActive ? routes.agency(organization.id) : null;

  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);

  async function handleSubmit(event) {
    event.preventDefault();
    setErrors({});
    setFormError(null);
    setSubmitting(true);

    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") || "").trim();
    const password = String(data.get("password") || "");

    try {
      const signedIn = await login({ email, password });
      setUser(signedIn);
      // The previous visitor's membership list must not survive a new sign-in.
      useAgency.getState().reset();
      await loadAgencies();
    } catch (error) {
      const fields = fieldErrors(error);
      if (Object.keys(fields).length) setErrors(fields);
      else if (error?.code === "invalid_credentials") {
        setFormError("That username and password don't match an agency account.");
      } else if (error?.status === 429) {
        setFormError("Too many attempts. Please wait a minute and try again.");
      } else {
        setFormError(error?.message || "We couldn't sign you in. Please try again.");
      }
      setSubmitting(false);
    }
  }

  if (user === undefined || target || (user && organizations === undefined)) {
    return (
      <div
        className="mx-auto h-64 w-full max-w-md animate-pulse rounded-lg bg-muted"
        aria-busy="true"
      />
    );
  }

  /**
   * A real agency whose account is not active. Named plainly rather than dressed as
   * "not found": they know they have a portal, and telling them it doesn't exist
   * sends them chasing a bug instead of contacting us.
   */
  if (user && organization && !isActive) {
    return (
      <div className="mx-auto max-w-md">
        <EmptyState
          icon={Building2}
          title={`${organization.name} is ${organization.status}`}
          body={
            organization.status === "pending"
              ? "This partner account hasn't been approved yet. We'll be in touch once it is — no action needed from you."
              : "This partner account is not active, so the portal is closed. Your past sales are safe. Contact eSIMFlys to discuss reactivating it."
          }
          action={{ label: "Go to the store", href: routes.home() }}
        />
      </div>
    );
  }

  if (user) {
    return (
      <div className="mx-auto max-w-md">
        <EmptyState
          icon={Building2}
          title="This account has no partner portal"
          body="You're signed in, but this login isn't linked to a travel agency. If you're an eSIMFlys partner, use the credentials your account manager issued."
          action={{ label: "Go to the store", href: routes.home() }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-lg border border-border bg-white p-8 shadow-sm md:p-10">
      <p className="text-label-caps uppercase text-muted-foreground">eSIMFlys partners</p>
      <h1 className="mb-2 mt-1 font-display text-headline-md uppercase text-foreground">
        Agency sign in
      </h1>
      <p className="mb-8 text-body-md text-muted-foreground">
        Use the username and password issued to your agency.
      </p>

      {formError ? (
        <p
          role="alert"
          className="mb-6 rounded-sm border border-destructive/30 bg-destructive/5 px-4 py-3 text-body-sm text-destructive"
        >
          {formError}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <label className="block">
          <span className="mb-1 block text-label-bold text-foreground">Username</span>
          <input
            required
            type="email"
            name="email"
            autoComplete="username"
            placeholder="agency@example.com"
            aria-invalid={errors.email ? "true" : undefined}
            aria-describedby={errors.email ? "agency-email-error" : undefined}
            className="w-full rounded-sm border border-border bg-muted px-4 py-3 text-body-md outline-none focus:border-primary"
          />
          {errors.email ? (
            <span
              id="agency-email-error"
              role="alert"
              className="mt-1 block text-body-sm text-destructive"
            >
              {errors.email}
            </span>
          ) : null}
        </label>

        <div className="block">
          <label htmlFor="agency-password" className="mb-1 block text-label-bold text-foreground">
            Password
          </label>
          <div className="relative">
            <input
              required
              id="agency-password"
              type={showPw ? "text" : "password"}
              name="password"
              autoComplete="current-password"
              aria-invalid={errors.password ? "true" : undefined}
              aria-describedby={errors.password ? "agency-password-error" : undefined}
              className="w-full rounded-sm border border-border bg-muted px-4 py-3 pr-12 text-body-md outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted-foreground hover:text-foreground"
            >
              {showPw ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
            </button>
          </div>
          {errors.password ? (
            <span
              id="agency-password-error"
              role="alert"
              className="mt-1 block text-body-sm text-destructive"
            >
              {errors.password}
            </span>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-full bg-primary py-3 font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="mt-8 border-t border-border pt-6 text-body-sm text-muted-foreground">
        Your agency login is created by eSIMFlys. If you've lost it or need it changed,
        contact your eSIMFlys account manager.
      </p>
    </div>
  );
}
