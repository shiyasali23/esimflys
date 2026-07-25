import { cn } from "@/lib/cn";

/** A page section with vertical rhythm. Server component. */
export function Section({ as: Tag = "section", id, className, children, ...props }) {
  return (
    <Tag id={id} className={cn("py-16 md:py-24", className)} {...props}>
      {children}
    </Tag>
  );
}

/** Section eyebrow + heading block. */
export function SectionHeading({ eyebrow, title, className }) {
  return (
    <div className={cn("mb-12", className)}>
      {eyebrow ? (
        <span className="mb-3 block text-label-caps uppercase text-primary">{eyebrow}</span>
      ) : null}
      <h2 className="font-display text-headline-lg text-foreground">{title}</h2>
    </div>
  );
}
