"use client";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/cn";

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }) {
  return (
    <TabsPrimitive.List
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border bg-card p-1",
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
        // min-h-11 (44px), not py-2 (36px). These are the segmented controls on the home
        // page and the device checker, i.e. the only way to switch what a section shows,
        // and they were 8px under the guideline on every phone.
        "inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold text-muted-foreground transition-colors data-[state=active]:bg-cta data-[state=active]:text-cta-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }) {
  return (
    <TabsPrimitive.Content
      className={cn("mt-6 focus-visible:outline-none md:mt-8", className)}
      {...props}
    />
  );
}
