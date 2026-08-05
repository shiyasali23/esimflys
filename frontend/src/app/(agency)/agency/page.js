import { buildMetadata } from "@/lib/seo/metadata";
import { AgencySignIn } from "@/features/agency/components/agency-sign-in.client";

export const metadata = buildMetadata({
  title: "Partner sign in",
  description: "eSIMFlys travel-agency partner portal.",
  path: "/agency",
  index: false, // noindex — a private portal, not a marketing page
});

export default function Page() {
  return (
    <div className="px-4 py-16">
      <AgencySignIn />
    </div>
  );
}
