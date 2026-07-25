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
                <Link href={item.href} className="hover:text-primary">
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
