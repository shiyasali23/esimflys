import { cn } from "@/lib/cn";

/**
 * Country flag — single swap point for flag rendering.
 * TODO(perf): replace the emoji with a LOCAL inline SVG keyed by ISO-2
 * (blueprint decision: inline SVG, not emoji, not a PNG folder — zero requests,
 * consistent cross-platform). Emoji is a Phase-0 placeholder only.
 * @param {{ country: { name: string, iso2: string, flagEmoji: string }, className?: string }} props
 */
export function CountryFlag({ country, className }) {
  return (
    <span
      role="img"
      aria-label={`${country.name} flag`}
      className={cn("inline-block leading-none", className)}
    >
      {country.flagEmoji}
    </span>
  );
}
