"use client";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/cn";

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }) {
  return (
    <TabsPrimitive.List
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-border bg-white p-1",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "min-h-11 rounded-full px-5 py-2 text-sm font-semibold text-muted-foreground transition-colors data-[state=active]:bg-cta data-[state=active]:text-cta-foreground",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Radix renders `present && children`, so an unselected panel ships no HTML. Pass
 * `forceMount` at a call site whose panels hold distinct content that crawlers should
 * see; the `data-[state=inactive]:hidden` class then does the hiding, because
 * forceMount also clears Radix's own `hidden` attribute.
 *
 * Deliberately opt-in, not the default: where two tabs render the same list (the
 * destinations browser does), forcing every panel would duplicate that content in the
 * HTML — worse for SEO than the missing panel it fixes.
 */
export function TabsContent({ className, ...props }) {
  return (
    <TabsPrimitive.Content
      className={cn("mt-8 focus-visible:outline-none data-[state=inactive]:hidden", className)}
      {...props}
    />
  );
}
