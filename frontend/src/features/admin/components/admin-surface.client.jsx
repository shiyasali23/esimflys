"use client";
import { createContext, useCallback, useEffect, useState } from "react";
import { AdminSidebar } from "@/features/admin/components/admin-sidebar.client";

/**
 * The top bar lends its right-hand side to whatever view is mounted.
 *
 * A list view's filters were costing 44px of vertical space in their own row — and that
 * row sat between the top bar and the table, pushing the first data row down on every
 * screen an operator uses all day. The reference puts its controls in the header row for
 * the same reason: the bar is already there and already 48px tall.
 *
 * A DOM node rather than a render prop, so a view deep in the tree can fill the slot
 * without every page component having to thread a `toolbar` prop through the shell.
 */
export const AdminToolbarSlot = createContext(null);

const COLLAPSE_KEY = "esimflys.admin.sidebar-collapsed";

/**
 * The chrome every admin and agency screen sits inside.
 *
 * WHAT THIS REPLACES. Both panels rendered inside the storefront's `Container`
 * (`max-w-6xl px-6`) under the customer `Header`, with `py-12` on top. Measured on
 * production at 1496px wide: the content region was 1104px — 73.8% of the viewport,
 * with 426px of chrome stacked above the first row of a table, and five of twenty-four
 * rows visible. An operator was reading a spreadsheet through a letterbox.
 *
 * The customer header is REMOVED from this tree, not hidden. It is a different route
 * group with a different layout; nothing in the admin subtree imports it, so there is
 * no CSS rule keeping it out that someone can later delete by accident.
 *
 * Three regions, and only three: a fixed sidebar, a 48px top bar, and everything else.
 * The content region is fluid with 16px gutters — no max-width, no centring. A
 * centred column inside an operational panel is the specific thing being removed here.
 */
export function AdminSurface({ brand, groups, activeFor, title, actions, children }) {
  const [collapsed, setCollapsed] = useState(false);
  /*
   * State, not a bare ref: the portal cannot render until the node exists, and a ref
   * assignment alone would not tell the subtree to try again. Costs exactly one extra
   * render on mount, client-side, with no request attached.
   */
  const [toolbarNode, setToolbarNode] = useState(null);

  /*
   * Read AFTER mount, never during render.
   *
   * This is a static export: the HTML is built once and served to everyone, so reading
   * localStorage during render makes the first client render disagree with the shipped
   * markup and React throws a hydration mismatch. The one-frame flash of an expanded
   * sidebar is the correct trade — the alternative is a blocking inline script for a
   * preference, which is what the currency and consent no-flash scripts exist for, and
   * neither of those is warranted by a sidebar width.
   */
  useEffect(() => {
    try {
      if (window.localStorage.getItem(COLLAPSE_KEY) === "1") setCollapsed(true);
    } catch {
      // Private mode and blocked storage both throw. The default is expanded.
    }
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((previous) => {
      const next = !previous;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // Preference is lost on reload; the panel still works.
      }
      return next;
    });
  }, []);

  return (
    <div data-surface="admin" className="flex h-screen overflow-hidden bg-admin-bg">
      <AdminSidebar
        brand={brand}
        groups={groups}
        activeFor={activeFor}
        collapsed={collapsed}
        onToggle={toggle}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/*
          48px, the cap in the brief, and it earns the height: it is the only thing on
          screen naming where you are. Actions live here rather than above the content
          so that no page-level header pushes the first data row down again.
        */}
        <header className="flex h-topbar shrink-0 items-center justify-between gap-3 border-b border-admin-border bg-admin-surface px-4">
          <h1 className="min-w-0 shrink-0 truncate text-admin-title text-admin-text">{title}</h1>
          {/* Filled by whichever view is mounted; empty and zero-width otherwise. */}
          <div ref={setToolbarNode} className="flex min-w-0 flex-1 items-center gap-2" />
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>

        {/*
          The scroll container is HERE, not on the document. The sidebar and top bar must
          stay put while a long table moves; scrolling the page instead would carry them
          off screen and cost the operator their navigation on exactly the screens that
          are long enough to need it.
        */}
        <main id="main-content" className="min-w-0 flex-1 overflow-auto p-3">
          <AdminToolbarSlot.Provider value={toolbarNode}>{children}</AdminToolbarSlot.Provider>
        </main>
      </div>
    </div>
  );
}
