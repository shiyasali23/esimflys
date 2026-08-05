"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CurrencySelector } from "@/components/currency/currency-selector.client";

export function MobileMenu({ items, overHero }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label="Open menu"
          className={`inline-flex h-10 w-10 items-center justify-center rounded-full md:hidden ${overHero ? "text-white" : "text-foreground"}`}
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
                sizes="43px"
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
          <Button
            href="/auth"
            variant="destructive"
            size="lg"
            className="w-full"
            onClick={() => setOpen(false)}
          >
            Sign in
          </Button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
