import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";

export default function AdminLayout({ children }) {
  return (
    <>
      <Header />
      <main id="main-content" className="pt-20">{children}</main>
      <Footer />
    </>
  );
}
