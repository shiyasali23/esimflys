import { buildMetadata } from "@/lib/seo/metadata";
import { EsimDetail } from "@/features/account/components/esim-detail.client";

export const metadata = buildMetadata({
  title: "eSIM details",
  description: "Your eSIM activation details and remaining data.",
  path: "/account/esims",
  index: false, // noindex — returns activation credentials
});

export default async function EsimDetailPage({ params }) {
  const { id } = await params;
  return <EsimDetail esimId={id} />;
}
