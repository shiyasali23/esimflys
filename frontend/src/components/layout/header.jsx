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
    <header className="fixed inset-x-0 top-0 z-50 px-2 sm:px-3">
      <nav
        aria-label="Primary"
        /*
          `bg-background`, not `bg-background/90`. The nav is a fixed pill floating over
          the page, so at 90% every heading and price it passed showed through it —
          "Add another destination" and a plan chip were both legible straight through
          the logo on real phone screenshots. There is no `backdrop-filter` alternative:
          it is banned on fixed elements here because it promotes them to their own
          composited layer, which is what caused the iPhone scroll stalls.
        */
        className="mx-auto mt-2 flex h-12 max-w-6xl items-center justify-between rounded-full border border-border bg-background px-3 shadow-l2 transition-all sm:mt-3 sm:h-14 sm:px-6"
      >
        {/* `-my-2` + `py-2`: the anchor grows to the full 44px guideline without moving
            the logo, which stays optically centred in the 56px bar. */}
        <Link href="/" className="-my-2 flex min-h-11 items-center gap-2 py-2 sm:gap-2.5">
          <Image
            src="/images/logo-mark.webp"
            alt=""
            width={128}
            height={96}
            priority
            className="h-7 w-auto sm:h-8"
          />
          <span className="font-display text-lg font-bold uppercase tracking-tight text-primary sm:text-xl">
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
          {/*
            Visible on a phone now, where it used to be `hidden sm:inline-flex`.

            Currency was reachable on mobile ONLY by opening the hamburger, which is a
            place nobody looks for a price control — the header showed EUR prices with no
            visible way to change them.

            It takes the slot "Sign in" used to hold. Nothing is lost: MobileMenu already
            renders AccountNav in the sheet, so signing in is still one tap away, and a
            price switch earns the scarce header space more than a second sign-in entry
            point does. Measured: all four items together overflow a 320px bar.
          */}
          <CurrencySelector className="sm:inline-flex" />
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
          <AccountNav className="hidden sm:flex" />
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
