import { Compass } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Container } from "@/components/ui/container";
import { EmptyState } from "@/components/feedback/empty-state";
import { buildMetadata } from "@/lib/seo/metadata";

/**
 * Without this the 404 inherited the root layout's title, description and
 * `robots: { index: true }` — advertising itself to crawlers as the homepage.
 */
export const metadata = buildMetadata({
  title: "Page not found",
  description: "The page you're looking for doesn't exist or has moved.",
  path: "/404",
  index: false,
});

/** Real 404 (blueprint §18) — returns HTTP 404 with full chrome. */
export default function NotFound() {
  return (
    <>
      <Header />
      <main id="main-content" className="pt-20">
        <Container className="py-24">
          <EmptyState
            icon={Compass}
            title="Page not found"
            body="The page you're looking for doesn't exist or has moved."
            action={{ label: "Browse destinations", href: "/destinations" }}
          />
        </Container>
      </main>
      <Footer />
    </>
  );
}
