import Link from "next/link";
import { ChevronRight } from "lucide-react";

/**
 * Breadcrumb trail. The last item is the current page (not a link).
 * @param {{ items: { name: string, href?: string }[] }} props
 */
export function Breadcrumbs({ items }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-2 text-label-bold text-muted-foreground">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={item.name} className="flex items-center gap-2">
              {item.href && !last ? (
                /*
                  `min-h-11` makes the whole row touchable. The text alone renders 20 px
                  tall, which fails even the 24 px WCAG 2.5.8 AA bar, never mind the 44 px
                  guideline the rest of the site now meets.

                  This makes the breadcrumb strip ~44 px instead of ~20 px, directly under
                  the header. That is the visible cost, and it is the reason breadcrumbs
                  were left out of the previous pass — accepted here for consistency with
                  the footer and menu button rather than inventing a second standard.
                */
                <Link href={item.href} className="flex min-h-11 items-center hover:text-primary">
                  {item.name}
                </Link>
              ) : (
                <span className={last ? "text-foreground" : undefined} aria-current={last ? "page" : undefined}>
                  {item.name}
                </span>
              )}
              {!last ? <ChevronRight size={16} aria-hidden className="text-outline" /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
