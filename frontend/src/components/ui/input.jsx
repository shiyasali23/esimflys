import { cn } from "@/lib/cn";

/**
 * `text-base sm:text-sm` — 16px on a phone, the designed 14px from `sm` up.
 *
 * iOS Safari zooms the whole page in when a field with a font under 16px takes focus,
 * and it does not zoom back out on blur: the visitor is left on a page scrolled sideways,
 * having to pinch out mid-form. Every field on the site inherits from here, so the floor
 * belongs here rather than on each caller. Nothing changes above `sm`, where no browser
 * does this.
 */
export function Input({ className, type = "text", ...props }) {
  return (
    <input
      type={type}
      className={cn(
        "h-11 w-full rounded-full border border-input bg-card px-5 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm",
        className,
      )}
      {...props}
    />
  );
}
