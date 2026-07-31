"use client";
import { useState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "@/lib/api/session";
import { fieldErrors } from "@/lib/api/errors";
import { routes } from "@/config/routes";

/**
 * Request a password reset.
 *
 * The endpoint always answers 200, even for an address with no account — that is
 * deliberate, so the response can't be used to discover who has an account. The
 * confirmation below therefore never says whether the address was recognised.
 */
export function ForgotPasswordForm() {
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    setErrors({});
    setFormError(null);
    setSubmitting(true);

    const email = String(new FormData(event.currentTarget).get("email") || "").trim();
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (error) {
      const fields = fieldErrors(error);
      if (Object.keys(fields).length) setErrors(fields);
      else if (error?.status === 429) {
        setFormError("Too many requests. Please wait a minute and try again.");
      } else {
        setFormError(error?.message || "We couldn't send that email. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-md rounded-lg border border-border bg-white p-8 shadow-sm md:p-12">
      <span className="mb-4 block text-label-caps uppercase text-primary">Reset password</span>
      <h1 className="mb-2 font-display text-headline-md text-foreground">Forgot your password?</h1>
      <p className="mb-8 text-body-md text-muted-foreground">
        Enter your email address and we&apos;ll send you a link to reset your account access.
      </p>

      {sent ? (
        <div>
          <p role="status" className="mb-6 rounded-sm bg-success-text/10 p-3 text-body-sm text-success-text">
            If that address has an eSIMFlys account, a reset link is on its way. Check your inbox and
            your spam folder.
          </p>
          <Link href={routes.signin()} className="font-semibold text-primary hover:underline">
            Back to sign in →
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          <label className="block">
            <span className="mb-1 block text-label-bold text-foreground">Email address</span>
            <input
              required
              type="email"
              name="email"
              autoComplete="email"
              placeholder="name@company.com"
              aria-invalid={errors.email ? "true" : undefined}
              aria-describedby={errors.email ? "forgot-email-error" : undefined}
              className="w-full rounded-sm border border-border bg-muted px-4 py-3 text-body-md outline-none focus:border-primary"
            />
            {errors.email ? (
              <span id="forgot-email-error" role="alert" className="mt-1 block text-body-sm text-destructive">
                {errors.email}
              </span>
            ) : null}
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-sm bg-primary py-3.5 text-label-bold text-on-primary transition-all hover:bg-primary-container active:scale-[0.98] disabled:opacity-60"
          >
            {submitting ? "Sending…" : "Send reset link"}
          </button>
          {formError ? (
            <p role="alert" className="rounded-sm bg-destructive/10 p-3 text-body-sm text-destructive-text">
              {formError}
            </p>
          ) : null}
        </form>
      )}

      <div className="mt-6 text-center">
        <Link href={routes.signin()} className="text-body-sm text-muted-foreground hover:text-primary">
          ← Back to sign in
        </Link>
      </div>
    </div>
  );
}
