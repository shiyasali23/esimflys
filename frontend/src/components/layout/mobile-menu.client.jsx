"use client";
import { useEffect, useState } from "react";
import { useSession, hasSessionHint } from "@/features/auth/use-session.client";
import { routes } from "@/config/routes";
import Link from "next/link";
import Image from "next/image";
import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CurrencySelector } from "@/components/currency/currency-selector.client";

export function MobileMenu({ items, overHero }) {
  const [open, setOpen] = useState(false);
  const user = useSession((s) => s.user);
  const load = useSession((s) => s.load);

  // Probe only when the browser has signed in before. An unconditional call would make
  // every anonymous visitor take a 403 on /account/me/ from every page that renders the
  // header — the exact problem AccountNav documents.
  useEffect(() => {
    if (hasSessionHint()) load();
  }, [load]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label="Open menu"
          // 44 px, not 40. This is the only way into navigation on a phone, so it is the
          // last control that should be under the guideline. The header is flex, so the
          // extra 4 px absorbs without moving anything around it.
          className={`inline-flex h-11 w-11 items-center justify-center rounded-full md:hidden ${overHero ? "text-white" : "text-foreground"}`}
        >
          <Menu className="h-6 w-6" aria-hidden />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-background" />
        <Dialog.Content className="fixed inset-0 z-[80] flex flex-col bg-background p-6">
          <Dialog.Title className="sr-only">Menu</Dialog.Title>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2.5">
              <Image
                src="/images/logo-mark.webp"
                alt=""
                width={128}
                height={96}
                className="h-8 w-auto"
              />
              <span className="font-display text-xl font-bold uppercase text-primary">eSIMFlys</span>
            </span>
            <Dialog.Close
              aria-label="Close menu"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-foreground"
            >
              <X className="h-6 w-6" aria-hidden />
            </Dialog.Close>
          </div>
          <nav aria-label="Mobile" className="mt-10 flex flex-1 flex-col gap-6">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="font-display text-3xl font-semibold uppercase text-foreground transition-colors hover:text-primary"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mb-5 flex items-center justify-between border-t border-border pt-6">
            <span className="text-sm font-medium text-muted-foreground">Display currency</span>
            <CurrencySelector />
          </div>
          {/*
            Same defect the desktop header had: a hard-coded "Sign in" that never consulted
            the session, so someone already signed in was told to sign in again. Tapping it
            sent them to /auth/signin, Google silently re-authenticated them, and they
            landed back where they started — a login that appears not to stick.

            Not AccountNav here: that component is `hidden sm:inline-flex` by design, so it
            renders nothing inside this menu. The session is read directly instead and the
            same full-width Button is reused for both states, keeping the sheet's layout
            identical either way.

            `user` is undefined until the probe answers. Showing "Sign in" during that gap
            would flash the wrong label at someone who IS signed in, so the account label is
            shown the moment a session hint exists and the probe only confirms it.
          */}
          <Button
            href={user ? routes.account() : routes.signin()}
            variant="destructive"
            size="lg"
            className="w-full"
            onClick={() => setOpen(false)}
          >
            {user ? user.first_name || "Your account" : "Sign in"}
          </Button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
