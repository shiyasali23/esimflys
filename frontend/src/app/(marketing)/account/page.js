import { buildMetadata } from "@/lib/seo/metadata";
import { ProfileView } from "@/features/account/components/profile-view.client";

export const metadata = buildMetadata({
  title: "Your account",
  description: "Manage your eSIMFlys account details.",
  path: "/account",
  index: false, // noindex — authenticated, personal
});

export default function AccountPage() {
  return <ProfileView />;
}
