import { buildMetadata } from "@/lib/seo/metadata";
import { PaymentView } from "@/features/checkout/components/payment-view.client";

export const metadata = buildMetadata({
  title: "Payment",
  description: "Secure payment.",
  path: "/checkout/payment",
  index: false,
});

export default function PaymentPage() {
  return <PaymentView />;
}
