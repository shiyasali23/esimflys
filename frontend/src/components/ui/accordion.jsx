import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Native <details>/<summary>, not Radix.
 *
 * This was `@radix-ui/react-accordion`, and the swap is a crawlability fix rather than a
 * preference. Radix does not mount `AccordionContent` while an item is closed: it emits
 * `<div hidden></div>` with ZERO characters inside, and the answer text survives only in
 * the RSC hydration payload (`self.__next_f.push(...)`) — i.e. inside a <script>.
 *
 * [MEASURED] production /help/installation, real Chrome, AFTER full hydration. Every leaf
 * element containing the answer string "Open Settings":
 *
 *     hits:                 [{ tag: "SCRIPT", display: "none" }]
 *     nonScriptLeafMatches: 0
 *     body.innerText words: 133
 *
 * So the text was in no rendered element at all. That is not merely an AI-crawler problem —
 * Googlebot executes JavaScript and still had nothing to index, because nothing ever
 * entered the DOM. 63 question/answer pairs across the home page, the eight /help/* pages
 * and the ten country pages were invisible to every engine.
 *
 * <details> puts the answer in the server HTML unconditionally. It also removes this file
 * from the client bundle entirely — the disclosure behaviour is the browser's, so there is
 * no "use client", no JS, and no hydration for any FAQ on the site.
 *
 * `name` gives the one-open-at-a-time behaviour that `type="single" collapsible` used to.
 * It is the native exclusive-accordion attribute; where it is unsupported the panels simply
 * all stay openable, which is a harmless degradation.
 *
 * Nothing visual is lost: there were no accordion animations to preserve — the Radix
 * `data-[state]` animation CSS was never written, so the panels always snapped.
 */
export function Accordion({ className, children, ...props }) {
  return (
    <div className={className} {...props}>
      {children}
    </div>
  );
}

export function AccordionItem({ className, ...props }) {
  return (
    <details
      className={cn(
        "group mb-3 overflow-hidden rounded-card border border-border bg-card transition-colors last:mb-0 hover:border-primary/30",
        className,
      )}
      {...props}
    />
  );
}

export function AccordionTrigger({ className, children, ...props }) {
  return (
    <summary
      className={cn(
        // `list-none` + the webkit pseudo-element remove the default disclosure triangle in
        // Firefox/Chrome and Safari respectively; the chevron below replaces it.
        "flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 transition-colors hover:text-primary [&::-webkit-details-marker]:hidden",
        className,
      )}
      {...props}
    >
      {/*
        The question stays a heading. Radix used to emit it as an h3 (under an h1, so the
        level skipped), and the first pass at this conversion dropped it to bare <summary>
        text — which fixed the skip by removing the questions from the document outline
        altogether. That is the wrong trade: the question strings are the part that matches
        what people actually search, and an outline of them is exactly what an answer engine
        reads to find the pair it wants.

        `<summary>` explicitly permits heading content, and each caller puts an h2 above the
        list, so the run is h1 -> h2 -> h3 with nothing skipped.
      */}
      <h3 className="text-left font-display text-lg font-semibold uppercase">{children}</h3>
      <ChevronDown
        className="h-5 w-5 shrink-0 text-primary transition-transform group-open:rotate-180"
        aria-hidden
      />
    </summary>
  );
}

export function AccordionContent({ className, children, ...props }) {
  return (
    <div
      className={cn(
        "border-t border-border px-6 pb-6 pt-4 text-body-md text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
