"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GoogleLogo } from "@/components/media/google-logo";
import { EmailOtpVerify } from "./email-otp-verify.client";
import { routes } from "@/config/routes";

export function AuthBento() {
  const router = useRouter();
  const [show, setShow] = useState(false);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="rounded-card border border-border bg-card p-8">
        <h1 className="font-display text-2xl font-bold uppercase">Sign in fast</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Access your eSIMs, orders, and top-ups.
        </p>
        <Button variant="secondary" size="md" className="mt-6 w-full gap-2">
          <GoogleLogo />
          Continue with Google
        </Button>
        <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>
        <form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
          <div>
            <label htmlFor="email" className="text-sm font-medium">Email</label>
            <Input id="email" type="email" placeholder="you@example.com" className="mt-1" />
          </div>
          <div>
            <label htmlFor="password" className="text-sm font-medium">Password</label>
            <div className="relative mt-1">
              <Input id="password" type={show ? "text" : "password"} placeholder="Your password" className="pr-12" />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? "Hide password" : "Show password"}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>
          <Button type="submit" variant="cta" size="md" className="w-full">Sign in</Button>
        </form>
        <p className="mt-4 text-sm text-muted-foreground">
          Need an account?{" "}
          <Link href="/auth/signup" className="font-semibold text-cta hover:underline">Create one</Link>
        </p>
      </div>
      <div className="rounded-card border border-border bg-muted p-8">
        <h2 className="font-display text-2xl font-bold uppercase">Prefer not to create an account yet?</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Check out as a guest — verify your email and we'll send your QR code and order details there.
        </p>
        <div className="mt-6">
          <EmailOtpVerify
            ctaLabel="Continue as guest"
            onVerified={() => router.push(routes.destinations())}
          />
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Demo — real verification codes are sent once the backend is connected.
        </p>
      </div>
    </div>
  );
}
