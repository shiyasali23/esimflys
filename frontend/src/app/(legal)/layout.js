import { Header } from "@/components/layout/header";
import { TrustBand } from "@/components/layout/trust-band";
import { Footer } from "@/components/layout/footer";

export default function LegalLayout({ children }) {
  return (
    <>
      <Header />
      <main id="main-content" className="pt-16 sm:pt-20">
        {children}
      </main>
      <TrustBand />
      <Footer />
    </>
  );
}
