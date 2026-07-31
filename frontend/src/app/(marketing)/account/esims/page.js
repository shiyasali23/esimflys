import { buildMetadata } from "@/lib/seo/metadata";
import { EsimList } from "@/features/account/components/esim-list.client";

export const metadata = buildMetadata({
  title: "My eSIMs",
  description: "Manage your eSIMFlys eSIMs and top-ups.",
  path: "/account/esims",
  index: false, // noindex — authenticated, personal
});

export default function MyEsimsPage() {
  return <EsimList />;
}
