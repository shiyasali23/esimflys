/** Skip link — first focusable element; jumps keyboard users to main content (WCAG 2.2). */
export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only rounded-sm bg-primary px-4 py-2 text-label-bold text-on-primary focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60]"
    >
      Skip to main content
    </a>
  );
}
