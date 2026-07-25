"use client";
import { useState } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { routes } from "@/config/routes";

/**
 * Sign-in / sign-up card. The backend owns auth (blueprint §23) — these forms are
 * DEMO stubs that show the interaction; wire them to the Next BFF → :8000 auth
 * routes in production. Google is a redirect to the backend OAuth flow.
 * @param {{ mode: "signin" | "signup" }} props
 */
export function AuthCard({ mode = "signin" }) {
  const isSignup = mode === "signup";
  const [showPw, setShowPw] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | loading | success

  function handleSubmit(e) {
    e.preventDefault();
    setStatus("loading");
    setTimeout(() => setStatus("success"), 900);
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

      <button
        type="button"
        className="mb-6 flex w-full items-center justify-center gap-3 rounded-md border border-border bg-white py-3 font-semibold text-foreground hover:bg-muted"
      >
        Continue with Google
      </button>

      <div className="mb-6 flex items-center gap-4">
        <span className="h-px flex-1 bg-border" />
        <span className="text-label-caps uppercase text-muted-foreground">or use email</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
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
        <label className="block">
          <span className="mb-1 flex items-center justify-between">
            <span className="text-label-bold text-foreground">Password</span>
            {!isSignup ? (
              <Link href={routes.forgotPassword()} className="text-label-bold text-primary hover:underline">
                Forgot password?
              </Link>
            ) : null}
          </span>
          <span className="relative block">
            <input
              required
              type={showPw ? "text" : "password"}
              name="password"
              placeholder="••••••••"
              className="w-full rounded-sm border border-border bg-muted px-4 py-3 pr-11 text-body-md outline-none focus:border-primary"
            />
            <button
              type="button"
              aria-pressed={showPw}
              aria-label={showPw ? "Hide password" : "Show password"}
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary"
            >
              {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </span>
        </label>
        <button
          type="submit"
          disabled={status === "loading"}
          className="w-full rounded-sm bg-primary py-3.5 text-label-bold text-on-primary transition-all hover:bg-primary-container active:scale-[0.98] disabled:opacity-60"
        >
          {status === "loading" ? "…" : isSignup ? "Create account" : "Sign in"}
        </button>
      </form>

      {status === "success" ? (
        <p role="status" className="mt-4 rounded-sm bg-success-text/10 p-3 text-body-sm text-success-text">
          Demo — backend authentication is wired in production. You'd be signed in here.
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
            Don't have an account?{" "}
            <Link href={routes.signup()} className="font-semibold text-primary hover:underline">
              Create one
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
