"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { CountryFlag } from "@/components/media/country-flag";

export function HeroSearch({ countries }) {
  const router = useRouter();
  /*
   * Starts EMPTY. It used to start on `countries[0].name` — Saudi Arabia, the first entry
   * in the catalogue file — and that one line caused the bug reported from a phone:
   * "select Germany, press Search, land on Saudi Arabia".
   *
   * [MEASURED] on the live site at 375x812 with touch emulation:
   *   - Tapping the field opened a suggestion list containing exactly ONE row, Saudi
   *     Arabia, because `matches` filters by `q` and `q` was "Saudi Arabia". There was no
   *     country list to browse.
   *   - Reaching "Germany" meant backspacing 12 characters, and every intermediate state
   *     resolved to Saudi Arabia: "Saudi" / "Sau" / "Sa" / "S" / "a" all did. Pressing
   *     Search at any of them navigated to /esim/saudi-arabia — confirmed end to end.
   *   - Typing without clearing first ("Saudi Arabiagermany") matched nothing, and Search
   *     then did nothing at all, silently.
   *
   * Desktop escaped it because the dropdown is fully visible there, so people click a row
   * — which calls `go(c)` with the country object and never consults the resolver. On a
   * phone the keyboard covers the list, so the Search button is used instead, and that is
   * the path that was broken.
   */
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const inputRef = useRef(null);

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

  /**
   * Ranked, not filtered in catalogue order.
   *
   * The old version kept the catalogue's own order, so the first suggestion for a partial
   * query was whichever country happened to sit highest in the file. Typing g-e-r-m-a-n-y
   * one key at a time walked the target through Singapore ("g"), then Georgia ("ge"),
   * before reaching Germany — so pressing Search a keystroke early landed on Georgia.
   *
   * Exact name or ISO2 first, then names that START with the query, then names that merely
   * contain it. `sort` is stable, so catalogue order still breaks ties within a rank.
   */
  const matches = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return countries.slice(0, 6);
    const ranked = [];
    for (const c of countries) {
      const name = c.name.toLowerCase();
      const iso = c.iso2.toLowerCase();
      let rank;
      if (name === query || iso === query) rank = 0;
      else if (name.startsWith(query)) rank = 1;
      else if (name.includes(query)) rank = 2;
      else continue;
      ranked.push({ c, rank });
    }
    ranked.sort((a, b) => a.rank - b.rank);
    return ranked.slice(0, 6).map((r) => r.c);
  }, [q, countries]);

  /**
   * The country a submit would navigate to, or `null` when the box does not identify one
   * UNIQUELY.
   *
   * This used to fall back to `matches[0]` — the best guess. A guess is fine for ordering
   * a list and wrong for a destination: it is what sent "ge" to Georgia and every partial
   * deletion of the old default to Saudi Arabia. Now it resolves only when the answer is
   * unambiguous: an exact name, an exact ISO2 code, or a query that narrowed the
   * catalogue to exactly one country ("icel" -> Iceland). Anything else is not a
   * destination, it is a choice, and `onSubmit` opens the list to let it be made.
   *
   * The flag beside the box reads from this too, so it shows a country only when Search
   * would actually go there, instead of advertising a guess.
   *
   * An exact ISO2 code is deliberately NOT a shortcut here, though it still ranks first in
   * the list. Two-letter codes collide with two-letter name prefixes, and the collisions
   * are exactly the dangerous ones: "ge" is Georgia's code and also the first two letters
   * of Germany, so treating the code as decisive would send someone typing "germany" to
   * Georgia — the same class of wrong-destination bug this change exists to remove. A code
   * still navigates when it leaves only one country standing, which is the case that
   * matters ("AE" -> United Arab Emirates); it just goes through the same uniqueness test
   * as everything else.
   */
  const target = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return null;
    const exact = countries.find((c) => c.name.toLowerCase() === query);
    if (exact) return exact;
    return matches.length === 1 ? matches[0] : null;
  }, [q, countries, matches]);

  const go = (c) => {
    if (c) router.push(`/esim/${c.slug}`);
  };

  /*
   * Submitting without a unique target opens the suggestions rather than navigating or —
   * as it did before — doing nothing at all. An empty box shows the whole list, a partial
   * query shows what it narrowed to, and a query nothing matches falls through to the
   * "No countries match" panel below. Every press of Search now produces a visible result.
   */
  const onSubmit = (e) => {
    e.preventDefault();
    if (target) {
      setOpen(false);
      go(target);
      return;
    }
    setOpen(true);
    inputRef.current?.focus();
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
          {target?.flagEmoji ? (
            <CountryFlag country={target} className="text-xl" />
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
          ref={inputRef}
          type="text"
          size={1}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          /*
            Selects whatever is already in the box on focus, so a tap REPLACES the last
            search instead of dropping a caret into the middle of it. On a phone that was
            the difference between typing "germany" and typing "Saudi Arabiagermany" —
            which matched nothing and made Search a no-op. Guarded on a non-empty value:
            calling select() on an empty field fights the browser's own caret placement
            for no benefit.
          */
          onFocus={(e) => {
            if (e.target.value) e.target.select();
            setOpen(true);
          }}
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
