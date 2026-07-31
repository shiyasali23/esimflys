import { Suspense } from "react";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form.client";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata = buildMetadata({
  title: "Reset Password",
  description: "Set a new password for your eSIMFlys account.",
  path: "/auth/reset-password",
  index: false,
});

/**
 * The form reads `uid` and `token` from the reset link's query string, and
 * `useSearchParams` cannot be prerendered outside a Suspense boundary.
 */
export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full max-w-md animate-pulse rounded-lg border border-border bg-muted p-8 md:p-12">
          <div className="h-48" aria-busy="true" />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
