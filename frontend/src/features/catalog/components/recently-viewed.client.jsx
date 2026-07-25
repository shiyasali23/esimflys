"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

export function RecentlyViewed({ current }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    let list = [];
    try {
      list = JSON.parse(localStorage.getItem("recentCountries") || "[]");
    } catch {
      list = [];
    }
    const next = [current, ...list.filter((c) => c.slug !== current.slug)].slice(0, 6);
    localStorage.setItem("recentCountries", JSON.stringify(next));
    setItems(next.filter((c) => c.slug !== current.slug));
  }, [current]);

  if (!items.length) return null;

  return (
    <section className="mt-16">
      <h2 className="font-display text-xl font-semibold uppercase">Recently viewed</h2>
      <div className="mt-4 flex flex-wrap gap-2">
        {items.map((c) => (
          <Link
            key={c.slug}
            href={`/esim/${c.slug}`}
            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm transition-colors hover:border-primary/40"
          >
            <span aria-hidden>{c.flagEmoji}</span>
            {c.name}
          </Link>
        ))}
      </div>
    </section>
  );
}
