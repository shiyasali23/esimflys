import { Compass } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Container } from "@/components/ui/container";
import { EmptyState } from "@/components/feedback/empty-state";

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
