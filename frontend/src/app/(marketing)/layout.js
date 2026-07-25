import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";

/** Marketing/support/content shell: global Header + Footer. */
export default function MarketingLayout({ children }) {
  return (
    <>
      <Header />
      <main id="main-content" className="pt-20">
        {children}
      </main>
      <Footer />
    </>
  );
}
