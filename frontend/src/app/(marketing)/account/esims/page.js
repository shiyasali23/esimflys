import { Button } from "@/components/ui/button";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata = buildMetadata({
  title: "My eSIMs",
  description: "Manage your eSIMFlys eSIMs and top-ups.",
  path: "/account/esims",
  index: false,
});

export default function MyEsimsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 text-center">
      <h1 className="font-display text-4xl font-bold uppercase md:text-5xl">My eSIMs</h1>
      <p className="mt-4 text-muted-foreground">
        Your purchased eSIMs and top-ups will appear here.
      </p>
      <div className="mt-10 rounded-card border border-dashed border-border p-12">
        <p className="text-muted-foreground">You don't have any eSIMs yet.</p>
        <div className="mt-6">
          <Button href="/destinations" variant="cta" size="lg">Browse plans</Button>
        </div>
      </div>
      <p className="mt-6 text-xs text-muted-foreground">
        Sign in to sync eSIMs across devices — account features connect to the backend once wired.
      </p>
    </div>
  );
}
