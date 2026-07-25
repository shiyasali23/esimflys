import { ResetPasswordForm } from "@/features/auth/components/reset-password-form.client";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata = buildMetadata({
  title: "Reset Password",
  description: "Set a new password for your eSIMFlys account.",
  path: "/auth/reset-password",
  index: false,
});

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
