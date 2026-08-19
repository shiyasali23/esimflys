"use client";
import { useRouter } from "next/navigation";
import { Zap } from "lucide-react";
import { EmailOtpVerify } from "./email-otp-verify.client";
import { routes } from "@/config/routes";

export function GuestCheckoutAside() {
  const router = useRouter();

  /*
   Deliberately NOT a card. This used to carry the same `rounded-lg border bg-card p-12`
   as the sign-in panel beside it, so the two read as equal siblings and nothing told
   the eye which was the primary path — on a checkout funnel that is a conversion
   problem, not a cosmetic one.

   It keeps every affordance: the heading, the form, and the reassurance line are all
   still here and still reachable. Only the visual weight drops — no border, no raised
   surface, sits on the page background instead of above it. The sign-in card is now
   the single "object" on the page and reads as the default action.

   Narrowed 5 -> 4 columns for the same reason; the remaining column becomes breathing
   room around the primary card rather than a second panel competing with it.
   */
  return (
    <aside className="flex flex-col px-2 py-4 md:col-span-4 md:px-4 md:py-6">
      <div>
        <h2 className="mb-2 font-display text-body-lg font-semibold text-foreground">
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
      <div className="mt-8 flex items-center gap-3 border-t border-border pt-6">
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
