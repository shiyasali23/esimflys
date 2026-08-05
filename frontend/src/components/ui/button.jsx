import Link from "next/link";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-body font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary-container",
        cta: "bg-cta text-cta-foreground hover:brightness-110",
        secondary: "border border-border bg-white text-foreground hover:bg-muted",
        accent: "bg-highlight text-highlight-foreground hover:brightness-95",
        outline: "border border-border bg-transparent text-foreground hover:bg-muted",
        ghost: "text-foreground hover:bg-muted",
        destructive: "bg-destructive text-destructive-foreground hover:brightness-110",
      },
      size: {
        sm: "h-11 px-4 text-sm",
        md: "h-12 px-6 text-sm",
        lg: "h-12 px-8 text-base",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export function Button({ variant, size, href, className, children, ...props }) {
  const cls = cn(buttonVariants({ variant, size }), className);
  if (href) {
    return (
      <Link href={href} className={cls} {...props}>
        {children}
      </Link>
    );
  }
  return (
    <button className={cls} {...props}>
      {children}
    </button>
  );
}

export { buttonVariants };
