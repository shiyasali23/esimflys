"use client";
import { useEffect, useState } from "react";
import { ChevronDown, Globe } from "lucide-react";
import { CURRENCY_CODES } from "@/config/currencies";
import { cn } from "@/lib/cn";

export function CurrencySelector({ className, overHero = false }) {
  const [cur, setCur] = useState("USD");

  useEffect(() => {
    const m = document.cookie.match(/(?:^|;)\s*cur=([A-Z]{3})/);
    const active = m ? m[1] : document.documentElement.getAttribute("data-currency");
    if (active) setCur(active);
  }, []);

  function handleChange(e) {
    const next = e.target.value;
    setCur(next);
    document.documentElement.setAttribute("data-currency", next);
    document.cookie = `cur=${next};path=/;max-age=31536000;samesite=lax`;
  }

  return (
    <div
      className={cn(
        "relative inline-flex h-9 items-center rounded-full border font-body text-sm font-semibold transition-colors focus-within:ring-2 focus-within:ring-ring",
        overHero
          ? "border-white/40 bg-white/10 text-white hover:bg-white/20"
          : "border-border bg-transparent text-foreground hover:bg-muted",
        className,
      )}
    >
      <Globe className="pointer-events-none absolute left-3 h-4 w-4 opacity-80" aria-hidden />
      <select
        value={cur}
        onChange={handleChange}
        aria-label="Display currency"
        className="h-full cursor-pointer appearance-none bg-transparent pl-9 pr-9 text-inherit focus:outline-none focus-visible:outline-none"
      >
        {CURRENCY_CODES.map((code) => (
          <option key={code} value={code} className="bg-white font-medium text-foreground">
            {code}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 opacity-80" aria-hidden />
    </div>
  );
}
