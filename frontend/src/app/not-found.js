import { Compass } from "lucide-react";
import { Header } from "@/components/layout/header";
import { TrustBand } from "@/components/layout/trust-band";
import { Footer } from "@/components/layout/footer";
import { Container } from "@/components/ui/container";
import { EmptyState } from "@/components/feedback/empty-state";

/*
  Without this the 404 inherited the root layout's default title — the home page's — so every
  missing URL rendered a tab reading "Instant Travel eSIM Data for 60+ Countries". Harmless
  for indexing (the Worker returns a genuine 404 status, verified in production), but wrong
  for anyone who lands here and for analytics that group by title.
*/
export const metadata = { title: "Page not found" };

/** Real 404 (blueprint §18) — returns HTTP 404 with full chrome. */
export default function NotFound() {
  return (
    <>
      <Header />
      <main id="main-content" className="pt-16 sm:pt-20">
        <Container className="py-24">
          <EmptyState
            as="h1"
            icon={Compass}
            title="Page not found"
            body="The page you're looking for doesn't exist or has moved."
            action={{ label: "Browse destinations", href: "/destinations" }}
          />
        </Container>
      </main>
      <TrustBand />
      <Footer />
    </>
  );
}
