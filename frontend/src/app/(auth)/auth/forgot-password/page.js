import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form.client";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata = buildMetadata({
  title: "Forgot Password",
  description: "Reset your eSIMFlys account password.",
  path: "/auth/forgot-password",
  index: false,
});

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
