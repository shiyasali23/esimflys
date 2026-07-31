// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TopupPanel } from "./topup-panel.client";
import { readOrderContext, clearOrderContext } from "@/features/checkout/order-context";
import { routerMock } from "../../../../vitest.setup";

/**
 * Buying more data for an eSIM already in use.
 *
 * A top-up is an ordinary order, so this must hand off to the same payment flow as
 * a first purchase rather than reimplementing it — and the eSIM's balance changes
 * only when the worker fulfils the order, never on this click.
 *
 * Two normal states get mistaken for errors: a supplier that offers no top-up at
 * all, and a profile that has not finished provisioning yet.
 */

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const PRODUCT = {
  product_code: "SA-TU-5GB",
  name: "5 GB top-up",
  data_amount_mb: 5000,
  validity_days: 30,
  retail_amount_minor: 899,
};

const ORDER = {
  id: "ord-topup-1",
  order_number: "ESF-TOPUP0001",
  customer_email: "traveller@example.com",
  total_minor: 899,
};

const body = (over = {}) => ({ available: [PRODUCT], history: [], ...over });

function mockApi({ list = body(), post } = {}) {
  globalThis.fetch = vi.fn((url, init) => {
    if (init?.method === "POST") {
      return Promise.resolve(post ? post() : jsonResponse(ORDER, 201));
    }
    return Promise.resolve(list instanceof Response ? list.clone() : jsonResponse(list));
  });
}

const posts = () => globalThis.fetch.mock.calls.filter((c) => c[1]?.method === "POST");

beforeEach(() => {
  document.cookie = "csrftoken=t; path=/";
  clearOrderContext();
});

afterEach(() => vi.restoreAllMocks());

describe("what is on offer", () => {
  it("shows the allowance in GB from an MB payload", async () => {
    mockApi();
    render(<TopupPanel esimId="e1" esimReady />);

    // Scoped to the allowance line: the product NAME is also "5 GB top-up".
    // Allowances are MB on the wire; 1 GB is 1000 MB, not 1024.
    const line = await screen.findByText(/valid 30 days/i);
    expect(line.textContent).toMatch(/^5 GB · valid 30 days$/);
  });

  it("prices from minor units", async () => {
    mockApi();
    render(<TopupPanel esimId="e1" esimReady />);
    expect(await screen.findByText("$8.99")).toBeTruthy();
  });

  /** No top-ups is a normal supplier state, not a failure. */
  it("says plainly when the plan offers none, and suggests the alternative", async () => {
    mockApi({ list: body({ available: [] }) });
    render(<TopupPanel esimId="e1" esimReady />);

    expect(await screen.findByText(/no top-ups are offered for this plan/i)).toBeTruthy();
    expect(screen.getByText(/buy another eSIM for the same destination/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /buy top-up/i })).toBeNull();
  });

  it("explains that an unprovisioned eSIM cannot be topped up yet", async () => {
    mockApi();
    render(<TopupPanel esimId="e1" esimReady={false} />);

    expect(await screen.findByText(/once this eSIM has finished provisioning/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /buy top-up/i })).toBeNull();
  });

  it("lists previous top-ups when there are any", async () => {
    mockApi({
      list: body({
        history: [
          { id: "t1", product_name: "5 GB top-up", status: "completed", completed_at: "2026-07-01T10:00:00Z" },
        ],
      }),
    });
    render(<TopupPanel esimId="e1" esimReady />);

    const section = (await screen.findByText(/previous top-ups/i)).closest("div");
    expect(within(section).getByText("5 GB top-up")).toBeTruthy();
  });
});

describe("buying one", () => {
  it("posts the chosen product code to that eSIM's top-up endpoint", async () => {
    mockApi();
    render(<TopupPanel esimId="e1" esimReady />);
    await userEvent.click(await screen.findByRole("button", { name: /buy top-up/i }));

    expect(String(posts()[0][0])).toContain("/esims/e1/topups/");
    expect(JSON.parse(posts()[0][1].body)).toEqual({ topup_product_code: "SA-TU-5GB" });
  });

  /**
   * The handoff goes through sessionStorage because a guest's email must never
   * travel in a URL — the same contract the first-purchase flow uses.
   */
  it("stores the order context and sends the user to payment", async () => {
    mockApi();
    render(<TopupPanel esimId="e1" esimReady />);
    await userEvent.click(await screen.findByRole("button", { name: /buy top-up/i }));

    expect(readOrderContext()).toMatchObject({
      orderId: "ord-topup-1",
      orderNumber: "ESF-TOPUP0001",
    });
    expect(routerMock.push).toHaveBeenCalledWith("/checkout/payment?order=ord-topup-1");
  });

  it("never claims the data has been added", async () => {
    mockApi();
    render(<TopupPanel esimId="e1" esimReady />);
    await userEvent.click(await screen.findByRole("button", { name: /buy top-up/i }));

    expect(document.body.textContent).not.toMatch(/data added|top-up (complete|applied|successful)/i);
  });

  it("explains a plan that cannot be topped up at all", async () => {
    mockApi({
      post: () =>
        jsonResponse(
          { error: { code: "topup_not_supported", message: "Top-up not supported." } },
          409,
        ),
    });
    render(<TopupPanel esimId="e1" esimReady />);
    await userEvent.click(await screen.findByRole("button", { name: /buy top-up/i }));

    expect(await screen.findByText(/can't be topped up/i)).toBeTruthy();
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it("re-enables the button after a failure", async () => {
    mockApi({ post: () => jsonResponse({ detail: "Server error" }, 500) });
    render(<TopupPanel esimId="e1" esimReady />);
    await userEvent.click(await screen.findByRole("button", { name: /buy top-up/i }));

    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: /buy top-up/i }).disabled).toBe(false);
  });

  it("blocks a second purchase while one is starting", async () => {
    let release;
    globalThis.fetch = vi.fn((url, init) => {
      if (init?.method === "POST") return new Promise((r) => { release = () => r(jsonResponse(ORDER, 201)); });
      return Promise.resolve(jsonResponse(body({ available: [PRODUCT, { ...PRODUCT, product_code: "SA-TU-10GB", name: "10 GB top-up" }] })));
    });
    render(<TopupPanel esimId="e1" esimReady />);
    await userEvent.click((await screen.findAllByRole("button", { name: /buy top-up/i }))[0]);

    for (const b of screen.getAllByRole("button", { name: /buy top-up|starting/i })) {
      expect(b.disabled).toBe(true);
    }
    release();
  });
});

describe("when the list cannot be loaded", () => {
  it("reports a failure instead of an empty offer", async () => {
    mockApi({ list: jsonResponse({ error: { code: "internal_error", message: "Upstream down." } }, 500) });
    render(<TopupPanel esimId="e1" esimReady />);

    expect(await screen.findByText(/couldn't load top-ups/i)).toBeTruthy();
    expect(screen.queryByText(/no top-ups are offered/i)).toBeNull();
  });
});
