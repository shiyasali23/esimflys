"use client";
import { useContext } from "react";
import { createPortal } from "react-dom";
import { AdminToolbarSlot } from "@/features/admin/components/admin-surface.client";
import { cn } from "@/lib/cn";

/**
 * The filter row above a table.
 *
 * A fixed 36px so it costs a known amount of vertical space. Every list view previously
 * grew its own `<form>` with stacked label-above-input pairs, which measured ~76px and
 * pushed the first data row 426px down the viewport — measured on production.
 *
 * The whole chrome stack above the first data row is now a fixed, countable budget:
 * 48 top bar + 12 gutter + 36 toolbar + 8 gap + 28 column header.
 *
 * Labels sit INSIDE the controls as placeholders rather than above them. That is a real
 * accessibility trade and it is paid for: every control carries an `aria-label`, so the
 * name is announced even though it is not drawn. Without that this would be the usual
 * placeholder-as-label mistake.
 */
export function AdminToolbar({ children, className }) {
  const slot = useContext(AdminToolbarSlot);

  /*
   * Rendered into the 48px top bar, which already exists, so filters cost NO vertical
   * space at all. Before this they sat in their own row and, with the gutter and gap
   * around it, put 44px between the top bar and the column headers on every list screen.
   *
   * The fallback is a real row, not nothing: a view rendered outside the shell — a test,
   * or a future embed — must still show its own filters rather than silently drop them.
   */
  const content = (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-2", className)}>{children}</div>
  );
  if (!slot) return <div className="mb-2">{content}</div>;
  return createPortal(content, slot);
}

const FIELD =
  "h-8 rounded-admin-sm border border-admin-border bg-admin-surface px-2.5 text-admin-body text-admin-text placeholder:text-admin-text-muted";

export function ToolbarSearch({ label, value, onChange, onSubmit, placeholder }) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="flex items-center gap-2"
    >
      <input
        type="search"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={cn(FIELD, "w-64")}
      />
      <button
        type="submit"
        className="h-8 rounded-admin-sm border border-admin-border px-3 text-admin-label text-admin-text transition-colors hover:bg-admin-hover"
      >
        Apply
      </button>
    </form>
  );
}

export function ToolbarSelect({ label, value, onChange, options }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={FIELD}
    >
      {options.map((option) => (
        <option key={option.value || "all"} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
