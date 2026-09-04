"use client";
import { useState } from "react";
import devices from "@/content/devices.json";
import { cn } from "@/lib/cn";

/**
 * All six category panels are in the server HTML; the tabs only toggle which one is shown.
 *
 * This used to be a Radix Tabs that mounted one panel at a time, so the watch, tablet,
 * laptop, router and car lists existed only in the hydration payload. [MEASURED] the
 * crawlable text of /supported-devices held the Smartphones list and nothing else, and
 * the page's ItemList schema could honestly describe only the six category names.
 * Rendering every panel and hiding the inactive ones with `hidden` keeps the same UI and
 * puts the models in the document.
 */
export function CategoryTabs() {
  const [active, setActive] = useState(devices.categories[0].name);
  return (
    <div>
      <div role="tablist" aria-label="Device categories" className="flex flex-wrap gap-2">
        {devices.categories.map((c) => {
          const isActive = c.name === active;
          return (
            <button
              key={c.name}
              type="button"
              role="tab"
              id={`tab-${slugify(c.name)}`}
              aria-selected={isActive}
              aria-controls={`panel-${slugify(c.name)}`}
              onClick={() => setActive(c.name)}
              className={cn(
                "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-card text-foreground hover:border-primary/50",
              )}
            >
              {c.name}
            </button>
          );
        })}
      </div>
      {devices.categories.map((c) => (
        <div
          key={c.name}
          role="tabpanel"
          id={`panel-${slugify(c.name)}`}
          aria-labelledby={`tab-${slugify(c.name)}`}
          hidden={c.name !== active}
          className="mt-6"
        >
          <h3 className="sr-only">{c.name}</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {c.brands.map((b) => (
              <div key={b.brand} className="rounded-card border border-border bg-card p-5">
                <h4 className="font-display text-lg font-semibold uppercase">{b.brand}</h4>
                <p className="mt-1 text-sm text-muted-foreground">{b.examples}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
