"use client";
import { useState } from "react";
import Link from "next/link";
import { routes } from "@/config/routes";

/** Request a reset code (blueprint §13.6). Demo — the backend sends the email in production. */
export function ForgotPasswordForm() {
  const [status, setStatus] = useState("idle"); // idle | loading | sent

  function handleSubmit(e) {
    e.preventDefault();
    setStatus("loading");
    setTimeout(() => setStatus("sent"), 900);
  }

  return (
    <div className="w-full max-w-md rounded-lg border border-border bg-white p-8 shadow-sm md:p-12">
      <span className="mb-4 block text-label-caps uppercase text-primary">Reset password</span>
      <h1 className="mb-2 font-display text-headline-md text-foreground">Forgot your password?</h1>
      <p className="mb-8 text-body-md text-muted-foreground">
        Enter your email address and we'll send you a 6-digit code to reset your account access.
      </p>

      {status === "sent" ? (
        <div>
          <p role="status" className="mb-6 rounded-sm bg-success-text/10 p-3 text-body-sm text-success-text">
            Check your inbox for the reset code. (Demo — the email is sent by the backend in production.)
          </p>
          <Link href={routes.resetPassword()} className="font-semibold text-primary hover:underline">
            Enter your code →
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <label className="block">
            <span className="mb-1 block text-label-bold text-foreground">Email address</span>
            <input
              required
              type="email"
              name="email"
              placeholder="name@company.com"
              className="w-full rounded-sm border border-border bg-muted px-4 py-3 text-body-md outline-none focus:border-primary"
            />
          </label>
          <button
            type="submit"
            disabled={status === "loading"}
            className="w-full rounded-sm bg-primary py-3.5 text-label-bold text-on-primary transition-all hover:bg-primary-container active:scale-[0.98] disabled:opacity-60"
          >
            {status === "loading" ? "Sending…" : "Send code"}
          </button>
        </form>
      )}

      <div className="mt-6 text-center">
        <Link href={routes.signin()} className="text-body-sm text-muted-foreground hover:text-primary">
          ← Back to sign in
        </Link>
      </div>
      <p className="mt-8 text-center text-[10px] uppercase tracking-widest text-muted-foreground/60">
        Secure 256-bit encrypted authentication
      </p>
    </div>
  );
}
