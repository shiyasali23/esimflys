import { Zap } from "lucide-react";
import site from "@/content/site.json";

export function TrustTicker() {
  const items = [...site.ticker, ...site.ticker];

  return (
    <div className="pause-on-hover overflow-hidden bg-ticker text-ticker-foreground">
      <div className="flex w-max animate-marquee items-center whitespace-nowrap py-2.5">
        {items.map((text, i) => (
          <span key={i} className="flex items-center gap-2 px-6 text-sm font-medium">
            <Zap className="h-4 w-4" aria-hidden />
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}
