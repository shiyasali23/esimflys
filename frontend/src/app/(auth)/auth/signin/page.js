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
  /*
   `items-start`, not `items-stretch`. Stretch existed to make the two cards equal
   height; the aside is no longer a card, so stretching it would only strand its
   closing row at the bottom of an empty column.
   */
  return (
    <div className="grid w-full max-w-5xl items-start gap-8 md:grid-cols-12">
      <div className="md:col-span-8">
        <AuthCard mode="signin" />
      </div>
      <GuestCheckoutAside />
    </div>
  );
}
