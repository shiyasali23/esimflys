"use client";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { confirmPasswordReset } from "@/lib/api/session";
import { fieldErrors, GENERIC_MESSAGE } from "@/lib/api/errors";
import { routes } from "@/config/routes";

/**
 * Set a new password from a reset link.
 *
 * The backend takes `{uid, token, new_password}` — Django's signed link flow —
 * so the credentials come from the emailed URL, not from something the user
 * types. (The earlier UI asked for a 6-digit code, which no endpoint accepts.)
 * Password rules are Django's validators; their messages arrive in `fields.password`.
 */
export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const uid = searchParams.get("uid");
  const token = searchParams.get("token");

  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    setErrors({});
    setFormError(null);
    setSubmitting(true);

    const newPassword = String(new FormData(event.currentTarget).get("password") || "");
    try {
      await confirmPasswordReset({ uid, token, newPassword });
      setDone(true);
    } catch (error) {
      const fields = fieldErrors(error);
      // An expired or spent link comes back as `fields.token`, which no input on this
      // form renders — so taking the field branch for it left the page completely
      // silent. Surface it as the form-level error instead, which is what it is.
      const { token: tokenError, ...inputErrors } = fields;
      if (Object.keys(inputErrors).length) setErrors(inputErrors);
      if (tokenError) {
        setFormError(tokenError);
      } else if (!Object.keys(inputErrors).length) {
        // `toApiError` always yields SOME message, so `error.message || fallback`
        // never reached the fallback — a failure here showed the generic "Something
        // went wrong" when the overwhelmingly likely cause is a spent link. Prefer
        // the server's wording only when it actually said something specific.
        const specific = error?.message && error.message !== GENERIC_MESSAGE ? error.message : null;
        setFormError(specific || "That reset link is no longer valid. Request a new one.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const linkIsUsable = Boolean(uid && token);

  return (
    <div className="w-full max-w-md rounded-lg border border-border bg-white p-8 shadow-sm md:p-12">
      <h1 className="mb-2 font-display text-headline-md text-foreground">Reset your password</h1>

      {done ? (
        <div className="mt-8">
          <p role="status" className="mb-6 rounded-sm bg-success-text/10 p-3 text-body-sm text-success-text">
            Your password has been updated. You can sign in with it now.
          </p>
          <Link href={routes.signin()} className="font-semibold text-primary hover:underline">
            Back to sign in →
          </Link>
        </div>
      ) : !linkIsUsable ? (
        <div className="mt-8">
          <p role="alert" className="mb-6 rounded-sm bg-destructive/10 p-3 text-body-sm text-destructive-text">
            This page needs the link from your reset email — open that link directly, or request a
            new one.
          </p>
          <Link href={routes.forgotPassword()} className="font-semibold text-primary hover:underline">
            Request a new link →
          </Link>
        </div>
      ) : (
        <>
          <p className="mb-8 text-body-md text-muted-foreground">
            Choose a new password for your account.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <label className="block">
              <span className="mb-1 block text-label-bold text-foreground">New password</span>
              <input
                required
                type="password"
                name="password"
                autoComplete="new-password"
                placeholder="••••••••"
                aria-invalid={errors.password || errors.new_password ? "true" : undefined}
                aria-describedby={errors.password || errors.new_password ? "reset-password-error" : undefined}
                className="w-full rounded-sm border border-border bg-muted px-4 py-3 text-body-md outline-none focus:border-primary"
              />
              {errors.password || errors.new_password ? (
                <span id="reset-password-error" role="alert" className="mt-1 block text-body-sm text-destructive">
                  {errors.password || errors.new_password}
                </span>
              ) : null}
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-sm bg-primary py-3.5 text-label-bold text-on-primary transition-all hover:bg-primary-container active:scale-[0.98] disabled:opacity-60"
            >
              {submitting ? "Updating…" : "Reset password"}
            </button>
            {formError ? (
              <p role="alert" className="rounded-sm bg-destructive/10 p-3 text-body-sm text-destructive-text">
                {formError}
              </p>
            ) : null}
          </form>
        </>
      )}

      <div className="mt-6 text-center">
        <Link href={routes.signin()} className="text-body-sm text-muted-foreground hover:text-primary">
          ← Back to sign in
        </Link>
      </div>
    </div>
  );
}
