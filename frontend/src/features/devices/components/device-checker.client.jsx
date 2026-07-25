"use client";
import { useState } from "react";
import { Check, HelpCircle, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import devices from "@/content/devices.json";

export function DeviceChecker() {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const result = !query
    ? null
    : devices.checker.compatible.some((m) => query.includes(m))
      ? "yes"
      : "unknown";

  return (
    <div>
      <label htmlFor="device" className="block text-sm font-medium text-white">
        {devices.checker.label}
      </label>
      <div className="relative mt-3">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id="device"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={devices.checker.placeholder}
          className="h-12 pl-12 shadow-lg focus-visible:ring-cta"
        />
      </div>
      <div aria-live="polite">
        {result === "yes" ? (
          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-success-text">
            <Check className="h-5 w-5" aria-hidden />
            {devices.checker.resultYes}
          </div>
        ) : result === "unknown" ? (
          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-medium text-muted-foreground">
            <HelpCircle className="h-5 w-5" aria-hidden />
            {devices.checker.resultUnknown}
          </div>
        ) : null}
      </div>
    </div>
  );
}
