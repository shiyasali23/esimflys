import { Header } from "@/components/layout/header";
import { TrustBand } from "@/components/layout/trust-band";
import { Footer } from "@/components/layout/footer";

/** Support shell — global chrome; routes here are public + indexable. */
export default function SupportLayout({ children }) {
  return (
    <>
      <Header activeNav="support" />
      <main id="main-content" className="pt-16 sm:pt-20">
        {children}
      </main>
      <TrustBand />
      <Footer />
    </>
  );
}
