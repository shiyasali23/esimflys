import { Button } from "@/components/ui/button";

/**
 * Empty state: icon + one-line reason + a recovery action (RULES §10, §13).
 * @param {{ icon?: any, title: string, body?: string, action?: { label: string, href: string } }} props
 */
export function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-border bg-white px-6 py-16 text-center">
      {Icon ? (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon size={28} aria-hidden />
        </div>
      ) : null}
      <h2 className="mb-2 font-display text-headline-md text-foreground">{title}</h2>
      {body ? <p className="mb-6 max-w-md text-body-md text-muted-foreground">{body}</p> : null}
      {action ? (
        <Button href={action.href} variant="secondary" size="md">
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
