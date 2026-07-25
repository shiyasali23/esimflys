import { Zap } from "lucide-react";
import { AuthCard } from "@/features/auth/components/auth-card.client";
import { Button } from "@/components/ui/button";
import { buildMetadata } from "@/lib/seo/metadata";
import { routes } from "@/config/routes";

export const metadata = buildMetadata({
  title: "Sign In",
  description: "Sign in to eSIMFlys to manage your plans and trips.",
  path: "/auth/signin",
  index: false,
});

export default function SignInPage() {
  return (
    <div className="grid w-full max-w-5xl items-stretch gap-8 md:grid-cols-12">
      <div className="md:col-span-7">
        <AuthCard mode="signin" />
      </div>
      <aside className="flex flex-col justify-between rounded-lg border border-border bg-white p-8 md:col-span-5 md:p-12">
        <div>
          <h2 className="mb-2 font-display text-headline-md text-foreground">
            Prefer not to create an account yet?
          </h2>
          <p className="mb-6 text-body-md text-muted-foreground">
            You can buy and install an eSIM as a guest. We'll send the activation code to your email.
          </p>
          <Button href={routes.destinations()} variant="outline" size="md">
            Continue as guest →
          </Button>
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
    </div>
  );
}
