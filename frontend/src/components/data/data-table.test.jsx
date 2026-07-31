// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataTable } from "@/components/data/data-table";

/**
 * The table four admin/agency screens render through. Its job is to absorb the
 * API's inconsistencies — two list shapes, derived page numbers — so no screen
 * has to.
 */

const COLUMNS = [
  { key: "order_number", header: "Order" },
  { key: "total", header: "Total", align: "right", render: (row) => `$${row.total}` },
];

const paginated = (overrides = {}) => ({
  count: 57,
  next: "http://localhost:3000/api/v1/admin/orders/?page=3",
  previous: "http://localhost:3000/api/v1/admin/orders/?page=1",
  results: [{ id: "a", order_number: "ESF-A", total: "10.00" }],
  ...overrides,
});

const base = { columns: COLUMNS, caption: "Orders" };

describe("rendering rows", () => {
  it("renders a row per result, using the column renderer", () => {
    render(<DataTable {...base} list={paginated()} />);
    expect(screen.getByText("ESF-A")).toBeTruthy();
    expect(screen.getByText("$10.00")).toBeTruthy();
  });

  it("carries an accessible caption for screen readers", () => {
    render(<DataTable {...base} list={paginated()} />);
    expect(screen.getByRole("table", { name: "Orders" })).toBeTruthy();
  });

  it("keeps real column headers so row/column relationships survive", () => {
    render(<DataTable {...base} list={paginated()} />);
    const headers = screen.getAllByRole("columnheader").map((th) => th.textContent);
    expect(headers).toEqual(["Order", "Total"]);
  });

  it("falls back to an em dash rather than printing undefined", () => {
    render(
      <DataTable
        {...base}
        columns={[{ key: "missing", header: "Missing" }]}
        list={paginated({ results: [{ id: "a" }] })}
      />,
    );
    expect(screen.getByText("—")).toBeTruthy();
  });
});

describe("states", () => {
  it("shows a busy placeholder before the first response", () => {
    const { container } = render(<DataTable {...base} list={null} loading />);
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows the empty state, not an empty table", () => {
    render(
      <DataTable {...base} list={paginated({ results: [], count: 0 })} empty={{ title: "No orders" }} />,
    );
    expect(screen.getByText("No orders")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  // A raw object on screen is the failure mode ErrorState exists to prevent.
  it("renders the server's message on error, never [object Object]", () => {
    render(<DataTable {...base} list={null} error={{ message: "Upstream is down." }} />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Upstream is down.")).toBeTruthy();
    expect(document.body.textContent).not.toContain("[object Object]");
  });

  it("offers retry when a handler is supplied", async () => {
    const onRetry = vi.fn();
    render(<DataTable {...base} list={null} error={{ message: "Nope" }} onRetry={onRetry} />);
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("prefers the error state over stale rows", () => {
    render(<DataTable {...base} list={paginated()} error={{ message: "Boom" }} />);
    expect(screen.queryByText("ESF-A")).toBeNull();
  });
});

describe("pagination", () => {
  /**
   * The envelope never states the current page — it is derived from `previous`,
   * and page 1's URL carries no `page` param. Getting this wrong silently
   * mislabels every page.
   */
  it("derives the current page and total from the envelope", () => {
    render(<DataTable {...base} list={paginated()} onPageChange={vi.fn()} />);
    expect(screen.getByText("Page 2 of 3")).toBeTruthy();
  });

  it("reports the range of rows actually on screen", () => {
    render(
      <DataTable
        {...base}
        list={paginated({ count: 57, results: new Array(24).fill(0).map((_, i) => ({ id: i, order_number: `E${i}`, total: "1" })) })}
        onPageChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Showing 25–48 of 57")).toBeTruthy();
  });

  it("disables Previous on the first page", () => {
    render(
      <DataTable {...base} list={paginated({ previous: null })} onPageChange={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: /previous/i }).disabled).toBe(true);
  });

  it("disables Next on the last page", () => {
    render(<DataTable {...base} list={paginated({ next: null })} onPageChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /^next/i }).disabled).toBe(true);
  });

  it("asks for the adjacent page by number", async () => {
    const onPageChange = vi.fn();
    render(<DataTable {...base} list={paginated()} onPageChange={onPageChange} />);
    await userEvent.click(screen.getByRole("button", { name: /^next/i }));
    expect(onPageChange).toHaveBeenCalledWith(3);
    await userEvent.click(screen.getByRole("button", { name: /previous/i }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it("hides pagination entirely when everything fits on one page", () => {
    render(
      <DataTable
        {...base}
        list={paginated({ count: 1, next: null, previous: null })}
        onPageChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole("navigation", { name: /pagination/i })).toBeNull();
  });

  it("announces the range politely as pages change", () => {
    const { container } = render(
      <DataTable {...base} list={paginated()} onPageChange={vi.fn()} />,
    );
    expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
  });
});

describe("row identity", () => {
  it("accepts a custom key for rows without an id", () => {
    const list = paginated({
      results: [
        { code: "X", order_number: "ESF-X", total: "1" },
        { code: "Y", order_number: "ESF-Y", total: "2" },
      ],
    });
    render(<DataTable {...base} list={list} rowKey={(r) => r.code} />);
    const rows = screen.getAllByRole("row");
    // one header row plus two data rows
    expect(rows.length).toBe(3);
    expect(within(rows[1]).getByText("ESF-X")).toBeTruthy();
  });
});
