"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The panel's primary navigation.
 *
 * Replaces a horizontal tab strip that had grown to fourteen items and scrolled
 * sideways — at which point the nav stopped being scannable and started hiding its own
 * contents. A vertical rail holds fourteen items comfortably, groups them, and costs
 * 240px of width that the old layout was giving away to empty gutters anyway.
 *
 * ITEMS ARE PASSED IN, not derived. The shell that renders this already knows whether
 * it is the platform panel or an agency portal; re-deriving that here would mean a
 * second source of truth about who sees what, and permission logic has exactly one
 * home in this codebase.
 *
 * Collapse state is owned by the parent so the content region can react to it in the
 * same render — a sidebar that animates independently of the region beside it is what
 * produces the one-frame gap you see in cheaper panels.
 */
export function AdminSidebar({ groups, brand, collapsed, onToggle, activeFor }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      data-collapsed={collapsed ? "" : undefined}
      className={cn(
        "flex shrink-0 flex-col border-r border-admin-border bg-admin-surface transition-[width] duration-150",
        collapsed ? "w-sidebar-collapsed" : "w-sidebar",
      )}
    >
      <div
        className={cn(
          "flex h-topbar shrink-0 items-center border-b border-admin-border",
          collapsed ? "justify-center px-2" : "gap-2 px-3",
        )}
      >
        <span
          aria-hidden
          className="grid h-7 w-7 shrink-0 place-items-center rounded-admin-sm bg-admin-accent text-[13px] font-bold text-white"
        >
          e
        </span>
        {collapsed ? null : (
          <span className="truncate text-admin-section text-admin-text">{brand}</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden py-2">
        {groups.map((group, index) => (
          <div key={group.label || index} className={index ? "mt-3" : undefined}>
            {/*
              The group label is hidden rather than dropped when collapsed: removing it
              would reflow every item below and make the collapse animation jump.
            */}
            {group.label && !collapsed ? (
              <p className="px-3 pb-1 pt-2 text-admin-caps uppercase text-admin-text-muted">
                {group.label}
              </p>
            ) : null}
            {group.label && collapsed ? (
              <div className="mx-3 my-2 border-t border-admin-border-subtle" aria-hidden />
            ) : null}
            <ul className="px-2">
              {group.items.map((item) => {
                const active = activeFor(item, pathname);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "relative mb-0.5 flex h-9 items-center gap-2.5 rounded-admin-sm px-2.5 text-admin-body transition-colors",
                        collapsed && "justify-center px-0",
                        active
                          ? "bg-admin-accent-tint font-medium text-admin-accent-ink"
                          : "text-admin-text-secondary hover:bg-admin-hover hover:text-admin-text",
                      )}
                    >
                      {/*
                        The accent bar is the unambiguous active signal. A tint alone is
                        easy to mistake for hover, which is the failure mode of every
                        sidebar where you cannot tell where you are at a glance.
                      */}
                      {active ? (
                        <span
                          aria-hidden
                          className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-admin-accent"
                        />
                      ) : null}
                      <item.icon size={16} strokeWidth={2} aria-hidden className="shrink-0" />
                      {collapsed ? (
                        <span className="sr-only">{item.label}</span>
                      ) : (
                        <span className="truncate">{item.label}</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="shrink-0 border-t border-admin-border p-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          className={cn(
            "flex h-9 w-full items-center gap-2.5 rounded-admin-sm px-2.5 text-admin-body text-admin-text-muted transition-colors hover:bg-admin-hover hover:text-admin-text",
            collapsed && "justify-center px-0",
          )}
        >
          {collapsed ? (
            <PanelLeftOpen size={16} aria-hidden />
          ) : (
            <PanelLeftClose size={16} aria-hidden />
          )}
          <span className={collapsed ? "sr-only" : undefined}>Collapse</span>
        </button>
      </div>
    </nav>
  );
}
