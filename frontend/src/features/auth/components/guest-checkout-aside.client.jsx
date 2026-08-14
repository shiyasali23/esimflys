"use client";
import { useRouter } from "next/navigation";
import { Zap } from "lucide-react";
import { EmailOtpVerify } from "./email-otp-verify.client";
import { routes } from "@/config/routes";

export function GuestCheckoutAside() {
  const router = useRouter();

  return (
    <aside className="flex flex-col justify-between rounded-lg border border-border bg-card p-8 md:col-span-5 md:p-12">
      <div>
        <h2 className="mb-2 font-display text-headline-md text-foreground">
          Prefer not to create an account yet?
        </h2>
        <p className="mb-6 text-body-md text-muted-foreground">
          Verify your name and email and we'll send your activation code and order details there.
        </p>
        <EmailOtpVerify
          ctaLabel="Continue as guest"
          ctaVariant="outline"
          onVerified={() => router.push(routes.destinations())}
        />
      </div>
      <div className="mt-12 flex items-center gap-3 border-t border-border pt-8">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container">
          <Zap size={18} aria-hidden />
        </span>
        <div>
          <p className="font-semibold text-foreground">Instant activation</p>
          <p className="text-body-sm text-muted-foreground">Guest orders are ready in seconds.</p>
        </div>
      </div>
    </aside>
  );
}
