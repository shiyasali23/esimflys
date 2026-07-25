import { cva } from "class-variance-authority";
import { cn } from "@/lib/cn";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-3 py-1 text-label-caps uppercase tracking-wider",
  {
    variants: {
      tone: {
        highlight: "bg-highlight text-highlight-foreground",
        essential: "bg-cta/10 text-cta",
        neutral: "bg-muted text-muted-foreground",
        success: "bg-success-text/10 text-success-text",
      },
    },
    defaultVariants: { tone: "highlight" },
  },
);

export function Badge({ tone, className, children }) {
  return <span className={cn(badgeVariants({ tone }), className)}>{children}</span>;
}

export { badgeVariants };
