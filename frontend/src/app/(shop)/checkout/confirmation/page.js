import { buildMetadata } from "@/lib/seo/metadata";
import { ConfirmationView } from "@/features/checkout/components/confirmation-view.client";

export const metadata = buildMetadata({
  title: "Order confirmed",
  description: "Your eSIM order is confirmed.",
  path: "/checkout/confirmation",
  index: false, // noindex — order page (blueprint §11)
});

export default function ConfirmationPage() {
  return <ConfirmationView />;
}
