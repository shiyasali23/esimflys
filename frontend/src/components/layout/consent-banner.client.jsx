"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function ConsentBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const has = document.cookie.split("; ").some((c) => c.startsWith("consent="));
    if (!has) setShow(true);
  }, []);

  function choose(value) {
    document.cookie = `consent=${value}; path=/; max-age=31536000; samesite=lax`;
    setShow(false);
  }

  if (!show) return null;

  return (
    <div
      role="region"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-[70] border-t border-border bg-background/95 p-4 backdrop-blur"
    >
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          We use an essential cookie to remember your currency. Analytics stays off unless you accept.
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="ghost" size="sm" onClick={() => choose("declined")}>
            Decline
          </Button>
          <Button variant="cta" size="sm" onClick={() => choose("accepted")}>
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
}
