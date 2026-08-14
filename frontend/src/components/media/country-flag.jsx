import { cn } from "@/lib/cn";

/**
 * @param {boolean} [decorative] Hide from assistive tech. Use wherever the country is
 *   already named in the same breath — in a heading that reads "eSIM Albania", the
 *   labelled flag makes a screen reader announce "eSIM Albania, Albania flag".
 */
export function CountryFlag({ country, className, decorative = false }) {
  if (!country?.flagEmoji) return null;

  return (
    <span
      {...(decorative
        ? { "aria-hidden": true }
        : {
            role: "img",
            "aria-label": country.name ? `${country.name} flag` : "country flag",
          })}
      className={cn("leading-none", className)}
    >
      {country.flagEmoji}
    </span>
  );
}
