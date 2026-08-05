"use client";
import { useState } from "react";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { login } from "@/lib/api/session";
import { useSession } from "@/features/auth/use-session.client";
import { fieldErrors } from "@/lib/api/errors";

/**
 * Sign-in for platform staff, shown in place at /admin.
 *
 * Deliberately not the storefront auth card. Staff accounts are created with
 * `createsuperuser` or granted a platform role group — they are never registered
 * through the site — so a sign-up link, a Google button and a self-service reset
 * all point at things that cannot help an admin get in.
 *
 * Rendered inline rather than behind a redirect so a deep link like
 * /admin/orders/{id} survives an expired session: sign in and the page you asked
 * for is already there, with no `?next=` round-trip to get wrong.
 */
export function AdminSignIn({ onSignedIn }) {
  const setUser = useSession((s) => s.setUser);
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setErrors({});
    setFormError(null);
    setSubmitting(true);

    try {
      const user = await login({
        email: String(data.get("email") || "").trim(),
        password: String(data.get("password") || ""),
      });
      setUser(user);
      onSignedIn?.();
    } catch (error) {
      const fields = fieldErrors(error);
      if (Object.keys(fields).length) setErrors(fields);
      else if (error?.code === "invalid_credentials" || error?.status === 401) {
        // Never say which half was wrong — this form is reachable by anyone.
        setFormError("That username and password don't match a staff account.");
      } else if (error?.status === 429) {
        setFormError("Too many attempts. Please wait a minute and try again.");
      } else {
        setFormError(error?.message || "We couldn't sign you in. Please try again.");
      }
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-lg border border-border bg-white p-8 shadow-sm md:p-10">
      <p className="text-label-caps uppercase text-muted-foreground">eSIMFlys platform</p>
      <h1 className="mb-2 mt-1 flex items-center gap-2 font-display text-headline-md uppercase text-foreground">
        <ShieldCheck size={22} aria-hidden /> Staff sign in
      </h1>
      <p className="mb-8 text-body-md text-muted-foreground">
        This area is for platform staff. Use the account created for you on the server.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <label className="block">
          <span className="mb-1 block text-label-bold text-foreground">Username</span>
          <input
            required
            type="email"
            name="email"
            autoComplete="username"
            placeholder="you@esimflys.com"
            aria-invalid={errors.email ? "true" : undefined}
            aria-describedby={errors.email ? "admin-email-error" : undefined}
            className="w-full rounded-sm border border-border bg-muted px-4 py-3 text-body-md outline-none focus:border-primary"
          />
          {errors.email ? (
            <span id="admin-email-error" role="alert" className="mt-1 block text-body-sm text-destructive-text">
              {errors.email}
            </span>
          ) : null}
        </label>

        <div className="block">
          <label htmlFor="admin-password" className="mb-1 block text-label-bold text-foreground">
            Password
          </label>
          <span className="relative block">
            <input
              id="admin-password"
              required
              type={showPw ? "text" : "password"}
              name="password"
              autoComplete="current-password"
              placeholder="••••••••"
              aria-invalid={errors.password ? "true" : undefined}
              aria-describedby={errors.password ? "admin-password-error" : undefined}
              className="w-full rounded-sm border border-border bg-muted px-4 py-3 pr-11 text-body-md outline-none focus:border-primary"
            />
            <button
              type="button"
              aria-pressed={showPw}
              aria-label={showPw ? "Hide password" : "Show password"}
              onClick={() => setShowPw((v) => !v)}
              /* sized to the WCAG 2.2 minimum touch target, not just the icon */
              className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:text-primary"
            >
              {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </span>
          {errors.password ? (
            <span id="admin-password-error" role="alert" className="mt-1 block text-body-sm text-destructive-text">
              {errors.password}
            </span>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-sm bg-primary py-3.5 text-label-bold text-on-primary transition-all hover:bg-primary-container disabled:opacity-60"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>

        {formError ? (
          <p role="alert" className="rounded-sm bg-destructive/10 p-3 text-body-sm text-destructive-text">
            {formError}
          </p>
        ) : null}
      </form>

      {/* No reset link: staff credentials are managed on the server, not here. */}
      <p className="mt-8 border-t border-border pt-6 text-body-sm text-muted-foreground">
        Locked out? Staff passwords are reset on the server, not from this page.
      </p>
    </div>
  );
}
