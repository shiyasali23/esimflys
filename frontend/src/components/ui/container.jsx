import { cn } from "@/lib/cn";

/**
 * Centered max-width page container with standard gutters.
 *
 * `max-w-6xl` is the site grid, not a preference: the storefront header, the footer and
 * the agency chrome are all `max-w-6xl`, and the marketing pages lay their own sections
 * out at the same width. This used to be `max-w-7xl`, so every page built on it —
 * checkout, payment, confirmation, the account screens, legal — sat 128px wider than
 * the header floating above it, and the cards visibly overhung the nav rail.
 *
 * Pass `max-w-*` in `className` to override; twMerge lets the later class win.
 */
export function Container({ as: Tag = "div", className, children, ...props }) {
  return (
    <Tag className={cn("mx-auto w-full max-w-6xl px-6", className)} {...props}>
      {children}
    </Tag>
  );
}
