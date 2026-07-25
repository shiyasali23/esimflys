import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/** Minimal auth shell (blueprint §12.2 auth-minimal): back link + centered logo, minimal footer. */
export default function AuthLayout({ children }) {
  const year = new Date().getFullYear();
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-body-sm text-muted-foreground hover:text-primary"
          >
            <ArrowLeft size={16} aria-hidden /> Back
          </Link>
          <Link href="/" className="font-display text-headline-md font-bold tracking-tight text-primary">
            eSIMFlys
          </Link>
          <span className="w-16" aria-hidden />
        </div>
      </header>
      <main id="main-content" className="flex flex-1 items-center justify-center px-6 py-12">
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
