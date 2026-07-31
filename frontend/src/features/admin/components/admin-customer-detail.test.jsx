// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { AdminCustomerDetail } from "@/features/admin/components/admin-customer-detail.client";

/**
 * One customer, for support.
 *
 * The payload is `{customer, orders}` and `orders` is a PLAIN ARRAY — the whole
 * history, unpaginated. Reading it as `{results}` renders an empty history for a
 * customer who has spent money, which reads as "no orders" to whoever is on the
 * phone with them.
 */

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const CUSTOMER = {
  id: "cust-1",
  email: "traveller@example.com",
  first_name: "Amira",
  last_name: "Haddad",
  preferred_currency: "USD",
  email_verified_at: "2026-03-02T09:00:00Z",
  is_active: true,
  date_joined: "2026-01-15T09:00:00Z",
  order_count: 2,
};

const ORDERS = [
  {
    id: "o1",
    order_number: "ESF-79039D08EF7C",
    currency: "USD",
    total_minor: 1699,
    status: "fulfilled",
    payment_status: "paid",
    fulfillment_status: "delivered",
    placed_at: "2026-05-01T10:00:00Z",
    item_count: 1,
    referring_organization_name: "Sunrise Travel",
  },
  {
    id: "o2",
    order_number: "ESF-11AA22BB33CC",
    currency: "USD",
    total_minor: 900,
    status: "pending",
    payment_status: "pending",
    fulfillment_status: "unfulfilled",
    placed_at: null,
    item_count: 2,
    referring_organization_name: null,
  },
];

function mockApi(body) {
  globalThis.fetch = vi.fn(() =>
    Promise.resolve(body instanceof Response ? body.clone() : jsonResponse(body)),
  );
}

afterEach(() => vi.restoreAllMocks());

beforeEach(() => {
  document.cookie = "csrftoken=t; path=/";
});

describe("the customer", () => {
  it("leads with the name and keeps the email visible", async () => {
    mockApi({ customer: CUSTOMER, orders: ORDERS });
    render(<AdminCustomerDetail customerId="cust-1" />);

    expect(await screen.findByRole("heading", { name: "Amira Haddad" })).toBeTruthy();
    expect(screen.getByText("traveller@example.com")).toBeTruthy();
  });

  it("falls back to the email when no name is on file", async () => {
    mockApi({ customer: { ...CUSTOMER, first_name: "", last_name: "" }, orders: [] });
    render(<AdminCustomerDetail customerId="cust-1" />);

    expect(await screen.findByRole("heading", { name: "traveller@example.com" })).toBeTruthy();
  });

  it("says an unverified email is unverified rather than showing a blank", async () => {
    mockApi({ customer: { ...CUSTOMER, email_verified_at: null }, orders: [] });
    render(<AdminCustomerDetail customerId="cust-1" />);

    expect(await screen.findByText(/not verified/i)).toBeTruthy();
  });

  /** Only settled money counts — a pending order is not revenue. */
  it("totals paid orders only", async () => {
    mockApi({ customer: CUSTOMER, orders: ORDERS });
    render(<AdminCustomerDetail customerId="cust-1" />);

    await screen.findByRole("heading", { name: "Amira Haddad" });
    const spend = screen.getByText(/paid to date/i).closest("div");
    expect(within(spend).getByText("$16.99")).toBeTruthy();
    expect(within(spend).queryByText("$25.99")).toBeNull();
  });
});

describe("order history", () => {
  it("reads the plain array, not a paginated envelope", async () => {
    mockApi({ customer: CUSTOMER, orders: ORDERS });
    render(<AdminCustomerDetail customerId="cust-1" />);

    expect(await screen.findByRole("heading", { name: /orders \(2\)/i })).toBeTruthy();
    expect(screen.getByText("ESF-79039D08EF7C")).toBeTruthy();
    expect(screen.getByText("ESF-11AA22BB33CC")).toBeTruthy();
  });

  it("links each order to its admin detail", async () => {
    mockApi({ customer: CUSTOMER, orders: ORDERS });
    render(<AdminCustomerDetail customerId="cust-1" />);

    const link = await screen.findByRole("link", { name: "ESF-79039D08EF7C" });
    expect(link.getAttribute("href")).toBe("/admin/orders/o1");
  });

  it("shows payment and fulfilment separately — paid is not delivered", async () => {
    mockApi({ customer: CUSTOMER, orders: [ORDERS[0]] });
    render(<AdminCustomerDetail customerId="cust-1" />);

    const row = (await screen.findByText("ESF-79039D08EF7C")).closest("li");
    expect(within(row).getByText(/paid/i)).toBeTruthy();
    expect(within(row).getByText(/delivered/i)).toBeTruthy();
  });

  it("names the agency that referred the sale", async () => {
    mockApi({ customer: CUSTOMER, orders: [ORDERS[0]] });
    render(<AdminCustomerDetail customerId="cust-1" />);

    expect(await screen.findByText(/via Sunrise Travel/i)).toBeTruthy();
  });

  it("says an unplaced order is unplaced instead of printing an invalid date", async () => {
    mockApi({ customer: CUSTOMER, orders: [ORDERS[1]] });
    render(<AdminCustomerDetail customerId="cust-1" />);

    expect(await screen.findByText(/not placed/i)).toBeTruthy();
    expect(document.body.textContent).not.toContain("Invalid Date");
  });

  it("states an empty history plainly", async () => {
    mockApi({ customer: { ...CUSTOMER, order_count: 0 }, orders: [] });
    render(<AdminCustomerDetail customerId="cust-1" />);

    expect(await screen.findByText(/hasn’t placed an order yet/i)).toBeTruthy();
  });
});

describe("failures", () => {
  it("offers a way back when the customer is gone", async () => {
    mockApi(jsonResponse({ detail: "Not found." }, 404));
    render(<AdminCustomerDetail customerId="cust-1" />);

    expect(await screen.findByText(/customer not found/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /back to customers/i })).toBeTruthy();
  });

  it("reports a server failure as a failure, not as an empty customer", async () => {
    mockApi(jsonResponse({ error: { code: "server_error", message: "Upstream unavailable." } }, 500));
    render(<AdminCustomerDetail customerId="cust-1" />);

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("Upstream unavailable.")).toBeTruthy();
  });
});
