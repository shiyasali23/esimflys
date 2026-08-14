import { AuthCard } from "@/features/auth/components/auth-card.client";
import { GuestCheckoutAside } from "@/features/auth/components/guest-checkout-aside.client";
import { buildMetadata } from "@/lib/seo/metadata";

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
      <GuestCheckoutAside />
    </div>
  );
}
