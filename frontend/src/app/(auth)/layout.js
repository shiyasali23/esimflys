import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";

/** Minimal auth shell (blueprint §12.2 auth-minimal): back link + centered logo, minimal footer. */
export default function AuthLayout({ children }) {
  const year = new Date().getFullYear();
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="fixed inset-x-0 top-0 z-50 px-3">
        <div className="mx-auto mt-3 flex h-14 max-w-6xl items-center justify-between rounded-full border border-border bg-background/90 px-4 shadow-l2 backdrop-blur sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/images/logo-mark.webp"
              alt=""
              width={128}
              height={96}
              className="h-7 w-auto"
            />
            <span className="font-display text-xl font-bold uppercase tracking-tight text-primary">
              eSIMFlys
            </span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-body-sm font-medium text-foreground/80 transition-colors hover:text-primary"
          >
            <ArrowLeft size={16} aria-hidden /> Back
          </Link>
        </div>
      </header>
      <main id="main-content" className="flex flex-1 items-center justify-center px-6 pb-12 pt-24">
        {children}
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-6 py-6 text-body-sm text-muted-foreground sm:flex-row">
          <p>© {year} eSIMFlys Global.</p>
          <div className="flex gap-6">
            <Link href="/legal/privacy" className="hover:text-primary">Privacy</Link>
            <Link href="/legal/terms" className="hover:text-primary">Terms</Link>
            <Link href="/contact" className="hover:text-primary">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
