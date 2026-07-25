"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CurrencySelector } from "@/components/currency/currency-selector.client";
import { MobileMenu } from "./mobile-menu.client";
import nav from "@/content/nav.json";
import { cn } from "@/lib/cn";

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const overHero = pathname === "/" && !scrolled;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3">
      <nav
        aria-label="Primary"
        className={cn(
          "mx-auto mt-3 flex h-14 max-w-6xl items-center justify-between rounded-full border px-4 transition-all sm:px-6",
          overHero
            ? "border-transparent bg-transparent"
            : "border-border bg-background/90 shadow-l2 backdrop-blur",
        )}
      >
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/images/logo-mark.png"
            alt=""
            width={128}
            height={96}
            priority
            className="h-8 w-auto"
          />
          <span
            className={cn(
              "font-display text-xl font-bold uppercase tracking-tight",
              overHero ? "text-white" : "text-primary",
            )}
          >
            eSIMFlys
          </span>
        </Link>
        <ul className="hidden items-center gap-7 md:flex">
          {nav.header.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "font-body text-sm font-medium transition-colors",
                  overHero ? "text-white/90 hover:text-white" : "text-foreground/80 hover:text-primary",
                )}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          <CurrencySelector overHero={overHero} className="hidden sm:inline-flex" />
          <Button
            href="/auth"
            variant="outline"
            size="sm"
            className={cn(
              "hidden sm:inline-flex",
              overHero && "border-white/40 bg-white/10 text-white hover:bg-white/20",
            )}
          >
            Sign in
          </Button>
          <MobileMenu items={nav.header} overHero={overHero} />
        </div>
      </nav>
    </header>
  );
}
