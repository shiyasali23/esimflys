import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";

/** Minimal auth shell (blueprint §12.2 auth-minimal): back link + centered logo, minimal footer. */
export default function AuthLayout({ children }) {
  const year = new Date().getFullYear();
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/*
        A second header, separate from `components/layout/header.jsx` by design (this shell
        deliberately has no nav), but it has to match it on the things that are not design
        choices — it drifted on all three.

        `bg-background`, not `bg-background/90`: this is a fixed pill floating over the
        page, so at 90% the content scrolled visibly through it. `backdrop-filter` is not
        an option here — it is banned on fixed elements in this codebase because it
        promotes them to their own composited layer, which is what caused the iPhone
        scroll stalls. `h-8` logo and a 44px "Back" target for the same reason the main
        header carries them.
      */}
      <header className="fixed inset-x-0 top-0 z-50 px-3">
        <div className="mx-auto mt-3 flex h-14 max-w-6xl items-center justify-between rounded-full border border-border bg-background px-4 shadow-l2 sm:px-6">
          <Link href="/" className="-my-2 flex min-h-11 items-center gap-2.5 py-2">
            <Image
              src="/images/logo-mark.webp"
              alt=""
              width={128}
              height={96}
              className="h-8 w-auto"
            />
            <span className="font-display text-xl font-bold uppercase tracking-tight text-primary">
              eSIMFlys
            </span>
          </Link>
          <Link
            href="/"
            className="-mr-2 inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-body-sm font-medium text-foreground/80 transition-colors hover:text-primary"
          >
            <ArrowLeft size={16} aria-hidden /> Back
          </Link>
        </div>
      </header>
      <main id="main-content" className="flex flex-1 items-center justify-center px-6 pb-12 pt-24">
        {children}
      </main>
      {/*
        `max-w-6xl`, matching the header above it and every other shell. At `max-w-7xl`
        this footer sat 128px wider than the nav pill on a desktop — the same overhang
        `components/ui/container.jsx` documents fixing everywhere else. The links carry
        44px targets like the main footer's.
      */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-1 px-6 py-4 text-body-sm text-muted-foreground sm:flex-row sm:gap-3 sm:py-6">
          <p className="py-2 sm:py-0">© {year} eSIMFlys Global.</p>
          <div className="-my-2 flex gap-2">
            <Link href="/legal/privacy" className="inline-flex min-h-11 items-center px-2 hover:text-primary">Privacy</Link>
            <Link href="/legal/terms" className="inline-flex min-h-11 items-center px-2 hover:text-primary">Terms</Link>
            <Link href="/contact" className="inline-flex min-h-11 items-center px-2 hover:text-primary">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
