import { AuthCard } from "@/features/auth/components/auth-card.client";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata = buildMetadata({
  title: "Create Account",
  description: "Create your eSIMFlys account.",
  path: "/auth/signup",
  index: false,
});

export default function SignUpPage() {
  return (
    <div className="w-full max-w-md">
      <AuthCard mode="signup" />
    </div>
  );
}
