"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { GoogleLogo } from "@/components/media/google-logo";
import { login, register, GOOGLE_LOGIN_PATH } from "@/lib/api/session";
import { useSession } from "@/features/auth/use-session.client";
import { fieldErrors } from "@/lib/api/errors";
import { routes } from "@/config/routes";

/**
 * Sign-in / sign-up against the real session endpoints. On success the browser
 * holds an HttpOnly session cookie — there is no token to store here.
 *
 * Google is a full-page navigation, not a fetch: the OAuth handshake needs real
 * redirects, and allauth returns the browser to /account when it completes.
 */
export function AuthCard({ mode = "signin" }) {
  const isSignup = mode === "signup";
  const router = useRouter();
  const setUser = useSession((s) => s.setUser);

  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    setErrors({});
    setFormError(null);
    setSubmitting(true);

    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") || "").trim();
    const password = String(data.get("password") || "");

    try {
      const user = isSignup
        ? await register({ email, password })
        : await login({ email, password });
      setUser(user);
      router.push(routes.account());
      router.refresh();
    } catch (error) {
      const fields = fieldErrors(error);
      if (Object.keys(fields).length) setErrors(fields);
      else if (error?.code === "invalid_credentials") {
        setFormError("That email and password don't match an account.");
      } else if (error?.status === 429) {
        setFormError("Too many attempts. Please wait a minute and try again.");
      } else {
        setFormError(error?.message || "We couldn't sign you in. Please try again.");
      }
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full rounded-lg border border-border bg-white p-8 shadow-sm md:p-12">
      <h1 className="mb-2 font-display text-headline-md text-foreground">
        {isSignup ? "Create your account" : "Sign in"}
      </h1>
      <p className="mb-8 text-body-md text-muted-foreground">
        {isSignup
          ? "Join eSIMFlys to manage your plans and trips."
          : "Access your global data plans and trip history."}
      </p>

      {/*
        The logo was missing entirely — this rendered bare text while already carrying
        `gap-3`, i.e. spacing reserved for an icon that was never added. `GoogleLogo`
        already existed and was already in use on the plan page, so it was an omission
        here rather than anything absent from the codebase. Google's branding guidelines
        require the mark on a "Continue with Google" button, so it is a compliance point
        as well as a visual one.

        Radius aligned to `rounded-lg`. This was `rounded-md` while the inputs and submit
        button were `rounded-sm` — three different radii in one card is the kind of
        mismatch that reads as unfinished without the viewer being able to name why.

        `focus-visible:ring` added: the whole form previously signalled focus only by
        changing a 1px border colour, which is easy to miss and thin for WCAG 2.4.11.
      */}
      <a
        href={GOOGLE_LOGIN_PATH}
        className="mb-6 flex w-full items-center justify-center gap-3 rounded-lg border border-border bg-white py-3.5 font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        <GoogleLogo />
        Continue with Google
      </a>

      <div className="mb-6 flex items-center gap-4">
        <span className="h-px flex-1 bg-border" />
        <span className="text-label-caps uppercase text-muted-foreground">or use email</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <label className="block">
          <span className="mb-1 block text-label-bold text-foreground">Email address</span>
          <input
            required
            type="email"
            name="email"
            autoComplete="email"
            placeholder="name@company.com"
            aria-invalid={errors.email ? "true" : undefined}
            aria-describedby={errors.email ? "auth-email-error" : undefined}
            className="w-full rounded-lg border border-border bg-muted px-4 py-3 text-body-md outline-none transition-colors focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
          />
          {errors.email ? (
            <span id="auth-email-error" role="alert" className="mt-1 block text-body-sm text-destructive">
              {errors.email}
            </span>
          ) : null}
        </label>

        {/* Associated by id rather than wrapping. A <label> around this field would
            swallow the "Forgot password?" link and the reveal button into the
            field's accessible name — it announced as "PasswordForgot password?" —
            and nested interactive content makes clicking the label ambiguous. */}
        <div className="block">
          <span className="mb-1 flex items-center justify-between">
            <label htmlFor="auth-password" className="text-label-bold text-foreground">
              Password
            </label>
            {!isSignup ? (
              <Link href={routes.forgotPassword()} className="text-label-bold text-primary hover:underline">
                Forgot password?
              </Link>
            ) : null}
          </span>
          <span className="relative block">
            <input
              id="auth-password"
              required
              type={showPw ? "text" : "password"}
              name="password"
              autoComplete={isSignup ? "new-password" : "current-password"}
              placeholder="Your password"
              aria-invalid={errors.password ? "true" : undefined}
              aria-describedby={errors.password ? "auth-password-error" : undefined}
              className="w-full rounded-lg border border-border bg-muted px-4 py-3 pr-11 text-body-md outline-none transition-colors focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
            />
            <button
              type="button"
              aria-pressed={showPw}
              aria-label={showPw ? "Hide password" : "Show password"}
              onClick={() => setShowPw((v) => !v)}
              /* sized to meet the WCAG 2.2 minimum touch target, not just the icon */
              className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:text-primary"
            >
              {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </span>
          {errors.password ? (
            <span id="auth-password-error" role="alert" className="mt-1 block text-body-sm text-destructive">
              {errors.password}
            </span>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-primary py-3.5 text-label-bold text-on-primary transition-all hover:bg-primary-container active:scale-[0.98] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          {submitting ? "Please wait…" : isSignup ? "Create account" : "Sign in"}
        </button>
      </form>

      {formError ? (
        <p role="alert" className="mt-4 rounded-sm bg-destructive/10 p-3 text-body-sm text-destructive-text">
          {formError}
        </p>
      ) : null}

      <p className="mt-6 text-body-sm text-muted-foreground">
        {isSignup ? (
          <>
            Already have an account?{" "}
            <Link href={routes.signin()} className="font-semibold text-primary hover:underline">
              Sign in
            </Link>
          </>
        ) : (
          <>
            Don&apos;t have an account?{" "}
            <Link href={routes.signup()} className="font-semibold text-primary hover:underline">
              Create one
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
