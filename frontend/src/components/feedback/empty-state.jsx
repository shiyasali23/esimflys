import { Button } from "@/components/ui/button";

/**
 * Empty state: icon + one-line reason + a recovery action (RULES §10, §13).
 *
 * `as` exists for exactly one caller. Every other use sits inside a page that already has
 * an h1, so h2 is the correct default — but the 404 page IS this component, and it was
 * shipping with no h1 at all. Rendering a second heading above it would just duplicate the
 * text, so the level is a prop instead.
 *
 * @param {{ icon?: any, title: string, body?: string, as?: "h1" | "h2", action?: { label: string, href: string } }} props
 */
export function EmptyState({ icon: Icon, title, body, action, as: Heading = "h2" }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-border bg-card px-6 py-16 text-center">
      {Icon ? (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon size={28} aria-hidden />
        </div>
      ) : null}
      <Heading className="mb-2 font-display text-headline-md text-foreground">{title}</Heading>
      {body ? <p className="mb-6 max-w-md text-body-md text-muted-foreground">{body}</p> : null}
      {action ? (
        <Button href={action.href} variant="secondary" size="md">
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
