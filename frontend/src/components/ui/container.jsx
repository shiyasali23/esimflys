import { cn } from "@/lib/cn";

/** Centered max-width page container with standard gutters. */
export function Container({ as: Tag = "div", className, children, ...props }) {
  return (
    <Tag className={cn("mx-auto w-full max-w-7xl px-6", className)} {...props}>
      {children}
    </Tag>
  );
}
