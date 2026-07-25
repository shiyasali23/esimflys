"use client";
import { useState } from "react";
import Link from "next/link";
import { routes } from "@/config/routes";

/** Enter the 6-digit code + a new password (blueprint §13.12). Demo — handled by the backend. */
export function ResetPasswordForm() {
  const [status, setStatus] = useState("idle"); // idle | loading | done

  function handleSubmit(e) {
    e.preventDefault();
    setStatus("loading");
    setTimeout(() => setStatus("done"), 900);
  }

  return (
    <div className="w-full max-w-md rounded-lg border border-border bg-white p-8 shadow-sm md:p-12">
      <h1 className="mb-2 font-display text-headline-md text-foreground">Reset your password</h1>
      <p className="mb-8 text-body-md text-muted-foreground">
        Enter the 6-digit code we emailed you and choose a new password.
      </p>

      {status === "done" ? (
        <div>
          <p role="status" className="mb-6 rounded-sm bg-success-text/10 p-3 text-body-sm text-success-text">
            Password updated. (Demo — handled by the backend in production.)
          </p>
          <Link href={routes.signin()} className="font-semibold text-primary hover:underline">
            Back to sign in →
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-label-bold text-foreground">6-digit code</span>
            <input
              required
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              name="code"
              placeholder="123456"
              className="w-full rounded-sm border border-border bg-muted px-4 py-3 tracking-widest text-body-md outline-none focus:border-primary"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-label-bold text-foreground">New password</span>
            <input
              required
              type="password"
              name="password"
              placeholder="••••••••"
              className="w-full rounded-sm border border-border bg-muted px-4 py-3 text-body-md outline-none focus:border-primary"
            />
          </label>
          <button
            type="submit"
            disabled={status === "loading"}
            className="w-full rounded-sm bg-primary py-3.5 text-label-bold text-on-primary transition-all hover:bg-primary-container active:scale-[0.98] disabled:opacity-60"
          >
            {status === "loading" ? "…" : "Reset password"}
          </button>
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
