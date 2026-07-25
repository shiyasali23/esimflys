"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

export function HeroSearch({ countries }) {
  const router = useRouter();
  const [q, setQ] = useState(() => countries[0]?.name ?? "");
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    const onDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
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

  const go = (c) => {
    if (c) router.push(`/esim/${c.slug}`);
  };

  const onSubmit = (e) => {
    e.preventDefault();
    const exact = countries.find((c) => c.name.toLowerCase() === q.trim().toLowerCase());
    go(exact || matches[0]);
  };

  return (
    <form ref={boxRef} onSubmit={onSubmit} className="relative w-full max-w-md">
      <div className="flex items-center gap-1 rounded-full bg-white p-1.5 pl-5 shadow-lg">
        <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        <input
          type="text"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search a country…"
          aria-label="Search destinations"
          className="min-w-0 flex-1 bg-transparent px-2 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        <button
          type="submit"
          className="shrink-0 rounded-full bg-cta px-5 py-2.5 text-sm font-semibold text-cta-foreground transition hover:brightness-110"
        >
          Search
        </button>
      </div>
      {open && matches.length ? (
        <ul className="absolute left-0 right-0 z-30 mt-2 max-h-72 overflow-y-auto overscroll-contain rounded-2xl border border-border bg-white py-2 text-foreground shadow-xl">
          {matches.map((c) => (
            <li key={c.slug}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setQ(c.name);
                  setOpen(false);
                  go(c);
                }}
                className="flex w-full items-center gap-3 px-5 py-2.5 text-left text-sm hover:bg-muted"
              >
                <span aria-hidden>{c.flagEmoji}</span>
                <span className="font-medium">{c.name}</span>
                {c.region ? <span className="ml-auto text-xs text-muted-foreground">{c.region}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : open && q.trim() ? (
        <div className="absolute left-0 right-0 z-30 mt-2 rounded-2xl border border-border bg-white px-5 py-4 text-sm text-muted-foreground shadow-xl">
          No countries match “{q.trim()}”.
        </div>
      ) : null}
    </form>
  );
}
