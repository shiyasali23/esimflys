"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { CountryFlag } from "@/components/media/country-flag";

export function HeroSearch({ countries }) {
  const router = useRouter();
  const [q, setQ] = useState(() => countries[0]?.name ?? "");
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    // `pointerdown`, not `mousedown`. A touch only produces a synthetic mouse event
    // after the gesture finishes, and not at all if the browser treats the tap as a
    // scroll — so on a phone the suggestion list stayed open behind whatever was
    // tapped next. `pointerdown` fires on the first contact on both input types.
    const onDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  const matches = useMemo(() => {
    const query = q.trim().toLowerCase();
    const list = query
      ? countries.filter(
          (c) => c.name.toLowerCase().includes(query) || c.iso2.toLowerCase().includes(query),
        )
      : countries;
    return list.slice(0, 6);
  }, [q, countries]);

  /**
   * The country submitting would actually navigate to. An exact name beats the first
   * suggestion, so typing "Oman" does not land on Romania — which contains "oman".
   * `null` for an empty box or a query nothing matches, so neither the flag nor a
   * submit invents a destination.
   */
  const resolved = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return null;
    return countries.find((c) => c.name.toLowerCase() === query) || matches[0] || null;
  }, [q, countries, matches]);

  const go = (c) => {
    if (c) router.push(`/esim/${c.slug}`);
  };

  const onSubmit = (e) => {
    e.preventDefault();
    go(resolved);
  };

  return (
    <form ref={boxRef} onSubmit={onSubmit} className="relative w-full max-w-md">
      <div className="flex items-center gap-1 rounded-full border border-border bg-card p-1.5 pl-4 shadow-xl min-[360px]:pl-5">
        {/*
          The flag of the destination this box would take you to. Fixed 5x5 box so
          swapping between an emoji and the icon never shifts the input beside it,
          and `aria-hidden` because it only mirrors the country name already in the
          field. Falls back to the magnifier for an empty box, a query nothing
          matches, or a country the catalogue has no flag for — otherwise the
          affordance would silently disappear.
        */}
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center"
          aria-hidden="true"
        >
          {resolved?.flagEmoji ? (
            <CountryFlag country={resolved} className="text-xl" />
          ) : (
            <Search className="h-5 w-5 text-muted-foreground" />
          )}
        </span>
        {/*
          `size={1}` overrides the HTML default of 20 characters. That default is this
          input's intrinsic width, and it propagated all the way out to the hero's grid
          column as a ~200px minimum that `min-w-0` alone could not clear — see the note
          on the column in hero.jsx. Flex still stretches the box to fill the row, so
          nothing about the rendered size changes; only the floor does.

          `text-base` is explicit: iOS Safari zooms the page in on focus for any field
          under 16px, and a zoomed hero does not zoom back out on blur.
        */}
        <input
          type="text"
          size={1}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search a country…"
          aria-label="Search destinations"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          className="h-11 min-w-0 flex-1 bg-transparent px-2 text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        <button
          type="submit"
          // h-11 (44px), not py-2.5 (40px). This is the hero's only submit control and
          // it sat under the guideline; the pill around it has 6px of padding to spare,
          // so the extra 4px costs nothing in the layout.
          className="flex h-11 shrink-0 items-center rounded-full bg-cta px-4 text-base font-semibold text-cta-foreground transition hover:brightness-110 min-[360px]:px-5"
        >
          Search
        </button>
      </div>
      {open && matches.length ? (
        <ul className="absolute left-0 right-0 z-30 mt-2 max-h-72 overflow-y-auto overscroll-contain rounded-2xl border border-border bg-card py-2 text-foreground shadow-xl">
          {matches.map((c) => (
            <li key={c.slug}>
              <button
                type="button"
                // `onPointerDown` for the same reason the outside-click listener uses it:
                // a tap may never produce a mousedown. `preventDefault` keeps focus in
                // the input so the list does not flicker shut before navigation starts.
                onPointerDown={(e) => {
                  e.preventDefault();
                  setQ(c.name);
                  setOpen(false);
                  go(c);
                }}
                className="flex min-h-11 w-full items-center gap-3 px-5 py-2.5 text-left text-sm hover:bg-muted"
              >
                <span aria-hidden>{c.flagEmoji}</span>
                <span className="font-medium">{c.name}</span>
                {c.region ? <span className="ml-auto text-xs text-muted-foreground">{c.region}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : open && q.trim() ? (
        <div className="absolute left-0 right-0 z-30 mt-2 rounded-2xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground shadow-xl">
          No countries match “{q.trim()}”.
        </div>
      ) : null}
    </form>
  );
}
