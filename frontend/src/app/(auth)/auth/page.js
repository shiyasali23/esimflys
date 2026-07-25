import { AuthBento } from "@/features/auth/components/auth-bento.client";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata = buildMetadata({
  title: "Sign in",
  description: "Sign in to eSIMFlys or continue as a guest to check out.",
  path: "/auth",
  index: false,
});

export default function AuthPage() {
  return (
    <div className="w-full max-w-4xl">
      <AuthBento />
    </div>
  );
}
