import Link from "next/link";
import nav from "@/content/nav.json";
import site from "@/content/site.json";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-5">
          <div className="col-span-2 md:col-span-1">
            <div className="font-display text-2xl font-bold uppercase text-primary">{site.brand}</div>
            <p className="mt-3 max-w-xs text-body-sm text-muted-foreground">{site.tagline}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {site.appStores.map((a) => (
                <span
                  key={a.label}
                  className="rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground"
                >
                  {a.label} · soon
                </span>
              ))}
            </div>
          </div>
          {nav.footer.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h2 className="mb-4 text-label-caps uppercase text-muted-foreground">{col.title}</h2>
              <ul className="flex flex-col gap-3">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="text-body-sm text-muted-foreground transition-colors hover:text-primary"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-6 text-body-sm text-muted-foreground md:flex-row">
          <p>© {year} {site.brand}. All rights reserved.</p>
          {site.social.length > 0 ? (
            <div className="flex gap-4">
              {site.social.map((s) => (
                <a key={s.label} href={s.href} className="hover:text-primary">
                  {s.label}
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
