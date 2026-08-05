"use client";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export const Accordion = AccordionPrimitive.Root;

export function AccordionItem({ className, ...props }) {
  return (
    <AccordionPrimitive.Item className={cn("border-b border-border", className)} {...props} />
  );
}

export function AccordionTrigger({ className, children, ...props }) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        className={cn(
          "flex flex-1 items-center justify-between gap-4 py-5 text-left font-display text-lg font-semibold uppercase transition-colors hover:text-primary [&[data-state=open]>svg]:rotate-180",
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDown className="h-5 w-5 shrink-0 text-primary transition-transform" aria-hidden />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

/**
 * `forceMount` keeps the answer in the server-rendered HTML. Without it Radix
 * renders `isOpen && children` (react-collapsible), so a closed panel ships an
 * empty div and every FAQ answer exists only in the RSC flight payload — invisible
 * to crawlers that read HTML rather than execute JavaScript.
 * Visibility is handed to CSS instead: Radix still sets `data-state` correctly.
 */
export function AccordionContent({ className, children, ...props }) {
  return (
    <AccordionPrimitive.Content
      forceMount
      className={cn(
        "overflow-hidden pb-5 text-body-md text-muted-foreground data-[state=closed]:hidden",
        className,
      )}
      {...props}
    >
      {children}
    </AccordionPrimitive.Content>
  );
}
