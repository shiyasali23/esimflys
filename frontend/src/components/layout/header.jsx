"use client";
import Link from "next/link";
import Image from "next/image";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CurrencySelector } from "@/components/currency/currency-selector.client";
import { AccountNav } from "./account-nav.client";
import { MobileMenu } from "./mobile-menu.client";
import nav from "@/content/nav.json";

export function Header() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3">
      <nav
        aria-label="Primary"
        className="mx-auto mt-3 flex h-14 max-w-6xl items-center justify-between rounded-full border border-border bg-background/90 px-4 shadow-l2 transition-all sm:px-6"
      >
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/images/logo-mark.webp"
            alt=""
            width={128}
            height={96}
            priority
            className="h-8 w-auto"
          />
          <span className="font-display text-xl font-bold uppercase tracking-tight text-primary">
            eSIMFlys
          </span>
        </Link>
        <ul className="hidden items-center gap-7 md:flex">
          {nav.header.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="font-body text-sm font-medium text-foreground/80 transition-colors hover:text-primary"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          <CurrencySelector className="hidden sm:inline-flex" />
          {/*
            AccountNav, not a hard-coded "Sign in".

            This button used to be a literal <Button href={routes.signin()}>Sign in</Button>
            that never consulted the session, so the header said "Sign in" to people who
            were already signed in — on every page, forever. Clicking it sent them to
            /auth/signin, Google re-authenticated them silently, and they landed back on
            /account exactly where they started, which reads as a login that will not stick.

            AccountNav already existed and was written for precisely this, probe guard and
            all; it was simply never wired in here. Its signed-out branch renders this same
            button with the same variant, size and classes, so nothing changes visually for
            anonymous visitors.
          */}
          <AccountNav />
          <Button href="/destinations" variant="cta" size="sm" className="hidden gap-1.5 lg:inline-flex">
            <Zap className="h-3.5 w-3.5" aria-hidden />
            Get eSIM Now
          </Button>
          <MobileMenu items={nav.header} />
        </div>
      </nav>
    </header>
  );
}
