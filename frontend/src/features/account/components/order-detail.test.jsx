// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { OrderDetail } from "./order-detail.client";
import { useSession } from "@/features/auth/use-session.client";
import { ORDER } from "@/features/catalog/storefront-fixtures";

/**
 * One order, as a receipt.
 *
 * Activation credentials are deliberately absent — they live on the eSIM route, so
 * a receipt page never exposes a QR or an activation code. Totals are the server's
 * stored figures, never recomputed here: a client-side sum would drift from what
 * was actually charged the moment a discount or tax rule changed.
 */

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const USER = { id: "u1", email: "traveller@example.com" };

const ITEM = {
  id: "item-1",
  product_name: "Saudi Arabia 10 GB — 30 Days",
  country_name: "Saudi Arabia",
  validity_days: 30,
  data_limit_mb: 10000,
  network_names: ["STC 5G"],
  unit_amount_minor: 1699,
  status: "delivered",
};

const FULL_ORDER = { ...ORDER, items: [ITEM] };

function mockApi(order = FULL_ORDER) {
  globalThis.fetch = vi.fn((url) => {
    if (String(url).includes("/account/me/")) return Promise.resolve(jsonResponse(USER));
    return Promise.resolve(order instanceof Response ? order.clone() : jsonResponse(order));
  });
}

const signedIn = () => useSession.setState({ user: USER, error: null, loading: false });

beforeEach(() => {
  document.cookie = "csrftoken=t; path=/";
  useSession.setState({ user: undefined, error: null, loading: false });
});

afterEach(() => vi.restoreAllMocks());

describe("who may see it", () => {
  it("asks a signed-out visitor to sign in", () => {
    useSession.setState({ user: null, error: null, loading: false });
    mockApi();
    render(<OrderDetail orderId="ord-1" />);

    expect(screen.getByText(/sign in to view this order/i)).toBeTruthy();
  });

  it("does not request the order before the session is known", () => {
    mockApi();
    render(<OrderDetail orderId="ord-1" />);

    const calls = globalThis.fetch.mock.calls.filter((c) => String(c[0]).includes("/orders/"));
    expect(calls).toHaveLength(0);
  });

  it("treats another account's order as simply not found", async () => {
    signedIn();
    mockApi(jsonResponse({ detail: "Not found." }, 404));
    render(<OrderDetail orderId="someone-elses" />);

    expect(await screen.findByText(/order not found/i)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/forbidden|not yours|permission/i);
  });

  it("distinguishes a server failure from a missing order", async () => {
    signedIn();
    mockApi(jsonResponse({ error: { code: "internal_error", message: "Upstream down." } }, 500));
    render(<OrderDetail orderId="ord-1" />);

    expect(await screen.findByText(/couldn't load this order/i)).toBeTruthy();
    expect(screen.queryByText(/order not found/i)).toBeNull();
  });
});

describe("the receipt", () => {
  it("shows the order number and both states", async () => {
    signedIn();
    mockApi();
    render(<OrderDetail orderId="ord-1" />);

    const heading = await screen.findByText("ESF-79039D08EF7C");
    // Scoped to the header row: the line item carries its own "delivered" badge.
    const statuses = heading.nextElementSibling;
    expect(within(statuses).getByText(/paid/i)).toBeTruthy();
    expect(within(statuses).getByText(/delivered/i)).toBeTruthy();
  });

  it("describes each line item in the units the customer understands", async () => {
    signedIn();
    mockApi();
    render(<OrderDetail orderId="ord-1" />);

    const item = (await screen.findByText("Saudi Arabia 10 GB — 30 Days")).closest("li");
    // data_limit_mb is MB on the wire; 10000 MB is 10 GB.
    expect(within(item).getByText(/Saudi Arabia · 30 days · 10 GB/)).toBeTruthy();
    expect(within(item).getByText("STC 5G")).toBeTruthy();
  });

  it("counts eSIMs with correct singular and plural", async () => {
    signedIn();
    mockApi();
    render(<OrderDetail orderId="ord-1" />);
    expect(await screen.findByRole("heading", { name: /^1 eSIM$/ })).toBeTruthy();

    vi.restoreAllMocks();
    useSession.setState({ user: USER });
    mockApi({ ...FULL_ORDER, items: [ITEM, { ...ITEM, id: "item-2" }] });
    render(<OrderDetail orderId="ord-2" />);
    expect(await screen.findByRole("heading", { name: /^2 eSIMs$/ })).toBeTruthy();
  });

  /** A receipt must never be a second route to the credentials. */
  it("exposes no activation credentials", async () => {
    signedIn();
    mockApi();
    render(<OrderDetail orderId="ord-1" />);

    await screen.findByText("ESF-79039D08EF7C");
    expect(screen.queryByText(/activation code/i)).toBeNull();
    expect(screen.queryByText(/smdp|sm-dp/i)).toBeNull();
    expect(document.querySelector("canvas, svg[data-qr]")).toBeNull();
  });

  it("offers the way back to the order list", async () => {
    signedIn();
    mockApi();
    render(<OrderDetail orderId="ord-1" />);

    await screen.findByText("ESF-79039D08EF7C");
    expect(screen.getByRole("link", { name: /your orders/i }).getAttribute("href")).toBe(
      "/account/orders",
    );
  });

  it("omits the placed date rather than printing an invalid one", async () => {
    signedIn();
    mockApi({ ...FULL_ORDER, placed_at: null });
    render(<OrderDetail orderId="ord-1" />);

    await screen.findByText("ESF-79039D08EF7C");
    expect(screen.queryByText(/placed/i)).toBeNull();
    expect(document.body.textContent).not.toContain("Invalid Date");
  });
});
