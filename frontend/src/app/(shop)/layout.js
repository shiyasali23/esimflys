import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";

/**
 * Shop shell (checkout). Header as everywhere, but a compact footer: these routes exist
 * to complete one purchase, and the full sitemap is both a distraction and the reason
 * the page did not fit on a laptop screen. Routes here are noindex via per-page metadata.
 */
export default function ShopLayout({ children }) {
  return (
    <>
      <Header />
      <main id="main-content" className="pt-16 sm:pt-20">
        {children}
      </main>
      <Footer compact />
    </>
  );
}
