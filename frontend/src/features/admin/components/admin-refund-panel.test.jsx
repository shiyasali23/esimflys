// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminRefundPanel } from "@/features/admin/components/admin-refund-panel.client";

/**
 * Issuing a refund.
 *
 * Money leaves the business here, so three things must hold:
 *  - dollars typed by the operator become integer MINOR units in the request;
 *  - no request is sent until the operator has seen the total and confirmed;
 *  - the server is the ONLY authority on what is still refundable — the API
 *    exposes no remaining balance, so a 409 `refund_limit_exceeded` must be shown
 *    as written rather than pre-empted with a guess.
 */

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const ITEMS = [
  {
    id: "item-1",
    product_name: "Albania 10 GB — 30 Days",
    product_code: "AL-10GB-30D-V1",
    unit_amount_minor: 1699,
    status: "delivered",
  },
  {
    id: "item-2",
    product_name: "Turkey 5 GB — 15 Days",
    product_code: "TR-5GB-15D-V1",
    unit_amount_minor: 900,
    status: "delivered",
  },
];

const paidOrder = (overrides) => ({
  id: "order-1",
  order_number: "ESF-79039D08EF7C",
  payment_status: "paid",
  payments: [{ id: "pay-1", status: "succeeded", amount_minor: 2599 }],
  ...overrides,
});

function mockApi(post) {
  globalThis.fetch = vi.fn(() =>
    Promise.resolve(post ? post() : jsonResponse({ id: "ref-1", amount_minor: 1699, status: "succeeded" }, 201)),
  );
}

const posts = () => globalThis.fetch.mock.calls.filter((c) => c[1]?.method === "POST");

async function pick(name) {
  const row = screen.getByText(name).closest("li");
  await userEvent.click(within(row).getByRole("checkbox"));
  return row;
}

beforeEach(() => {
  document.cookie = "csrftoken=t; path=/";
});

afterEach(() => vi.restoreAllMocks());

describe("eligibility", () => {
  it("refuses to offer a refund with no settled payment, and says why", () => {
    mockApi();
    render(<AdminRefundPanel order={paidOrder({ payments: [] })} items={ITEMS} />);

    expect(screen.getByText(/no settled payment to refund/i)).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  // `pending` is not money in the bank; only a succeeded payment can be reversed.
  it("treats a pending payment as unsettled", () => {
    mockApi();
    render(
      <AdminRefundPanel
        order={paidOrder({ payments: [{ id: "pay-1", status: "pending", amount_minor: 2599 }] })}
        items={ITEMS}
      />,
    );

    expect(screen.getByText(/no settled payment to refund/i)).toBeTruthy();
  });

  it("is honest that it cannot show what is still refundable", () => {
    mockApi();
    render(<AdminRefundPanel order={paidOrder()} items={ITEMS} />);

    expect(screen.getByText(/less anything already refunded/i)).toBeTruthy();
  });
});

describe("the per-item ceiling", () => {
  /**
   * The server caps each allocation at that item's `unit_amount_minor`, and that
   * figure IS in the payload — so it bounds the input. Prior refunds are not
   * exposed, so this is an upper bound, not the true remainder.
   */
  it("bounds the amount input at what the item was paid", async () => {
    mockApi();
    render(<AdminRefundPanel order={paidOrder()} items={ITEMS} />);

    await pick("Albania 10 GB — 30 Days");
    expect(screen.getByLabelText(/refund amount for Albania/i).getAttribute("max")).toBe("16.99");
  });
});

describe("building the allocation", () => {
  it("won't review an empty selection", () => {
    mockApi();
    render(<AdminRefundPanel order={paidOrder()} items={ITEMS} />);

    expect(screen.getByRole("button", { name: /review refund/i }).disabled).toBe(true);
    expect(screen.getByText(/select at least one item/i)).toBeTruthy();
  });

  it("prefills the amount paid for the item, so the common case is one click", async () => {
    mockApi();
    render(<AdminRefundPanel order={paidOrder()} items={ITEMS} />);

    await pick("Albania 10 GB — 30 Days");
    expect(screen.getByLabelText(/refund amount for Albania/i).value).toBe("16.99");
  });

  it("totals the selected items", async () => {
    mockApi();
    render(<AdminRefundPanel order={paidOrder()} items={ITEMS} />);

    await pick("Albania 10 GB — 30 Days");
    await pick("Turkey 5 GB — 15 Days");
    expect(screen.getByText("$25.99")).toBeTruthy();
  });

  it("drops an item's amount when it is unselected", async () => {
    mockApi();
    render(<AdminRefundPanel order={paidOrder()} items={ITEMS} />);

    const row = await pick("Albania 10 GB — 30 Days");
    await userEvent.click(within(row).getByRole("checkbox"));

    expect(screen.queryByLabelText(/refund amount for Albania/i)).toBeNull();
    expect(screen.getByRole("button", { name: /review refund/i }).disabled).toBe(true);
  });
});

describe("confirmation", () => {
  it("sends nothing until the operator confirms the total", async () => {
    mockApi();
    render(<AdminRefundPanel order={paidOrder()} items={ITEMS} />);

    await pick("Albania 10 GB — 30 Days");
    await userEvent.click(screen.getByRole("button", { name: /review refund/i }));

    expect(posts()).toHaveLength(0);
    expect(screen.getByText(/cannot be\s+undone here/i)).toBeTruthy();
  });

  it("can be abandoned without sending anything", async () => {
    mockApi();
    render(<AdminRefundPanel order={paidOrder()} items={ITEMS} />);

    await pick("Albania 10 GB — 30 Days");
    await userEvent.click(screen.getByRole("button", { name: /review refund/i }));
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(posts()).toHaveLength(0);
    expect(screen.getByRole("button", { name: /review refund/i })).toBeTruthy();
  });
});

describe("the request", () => {
  /** Dollars on screen, integer minor units on the wire — 16.99 must not become 1698. */
  it("converts each amount to minor units", async () => {
    mockApi();
    render(<AdminRefundPanel order={paidOrder()} items={ITEMS} />);

    await pick("Albania 10 GB — 30 Days");
    await pick("Turkey 5 GB — 15 Days");
    await userEvent.click(screen.getByRole("button", { name: /review refund/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm refund/i }));

    const [href, init] = posts()[0];
    expect(String(href)).toContain("/admin/orders/order-1/refunds/");
    expect(JSON.parse(init.body).allocations).toEqual([
      { order_item_id: "item-1", amount_minor: 1699 },
      { order_item_id: "item-2", amount_minor: 900 },
    ]);
  });

  it("sends a partial amount when the operator overrides it", async () => {
    mockApi();
    render(<AdminRefundPanel order={paidOrder()} items={ITEMS} />);

    await pick("Albania 10 GB — 30 Days");
    const amount = screen.getByLabelText(/refund amount for Albania/i);
    await userEvent.clear(amount);
    await userEvent.type(amount, "5.50");
    await userEvent.click(screen.getByRole("button", { name: /review refund/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm refund/i }));

    expect(JSON.parse(posts()[0][1].body).allocations).toEqual([
      { order_item_id: "item-1", amount_minor: 550 },
    ]);
  });

  it("omits an empty reason rather than sending a blank string", async () => {
    mockApi();
    render(<AdminRefundPanel order={paidOrder()} items={ITEMS} />);

    await pick("Albania 10 GB — 30 Days");
    await userEvent.click(screen.getByRole("button", { name: /review refund/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm refund/i }));

    expect(Object.hasOwn(JSON.parse(posts()[0][1].body), "reason")).toBe(false);
  });

  it("sends the reason when one is given", async () => {
    mockApi();
    render(<AdminRefundPanel order={paidOrder()} items={ITEMS} />);

    await pick("Albania 10 GB — 30 Days");
    await userEvent.type(screen.getByLabelText(/reason/i), "could not install before travel");
    await userEvent.click(screen.getByRole("button", { name: /review refund/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm refund/i }));

    expect(JSON.parse(posts()[0][1].body).reason).toBe("could not install before travel");
  });

  it("confirms what was actually refunded", async () => {
    mockApi();
    render(<AdminRefundPanel order={paidOrder()} items={ITEMS} />);

    await pick("Albania 10 GB — 30 Days");
    await userEvent.click(screen.getByRole("button", { name: /review refund/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm refund/i }));

    const status = await screen.findByRole("status");
    expect(status.textContent).toMatch(/refunded \$16\.99/i);
    expect(screen.getByRole("button", { name: /review refund/i }).disabled).toBe(true);
  });
});

describe("refusals", () => {
  /**
   * There is no client-side ceiling to check against — the balance is not exposed.
   * The 409 IS the answer, so it is shown as written.
   */
  it("shows the over-refund refusal verbatim", async () => {
    mockApi(() =>
      jsonResponse(
        {
          error: {
            code: "refund_limit_exceeded",
            message: "This refund exceeds the refundable balance.",
            fields: {},
          },
        },
        409,
      ),
    );
    render(<AdminRefundPanel order={paidOrder()} items={ITEMS} />);

    await pick("Albania 10 GB — 30 Days");
    await userEvent.click(screen.getByRole("button", { name: /review refund/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm refund/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("This refund exceeds the refundable balance.");
  });

  /** `fields.allocations` is an array of per-item objects — the flat helper can't read it. */
  it("attaches a per-allocation validation error to the item it belongs to", async () => {
    mockApi(() =>
      jsonResponse(
        {
          error: {
            code: "validation_error",
            message: "The request could not be processed.",
            fields: {
              allocations: [{}, { amount_minor: ["Ensure this value is greater than or equal to 1."] }],
            },
          },
        },
        400,
      ),
    );
    render(<AdminRefundPanel order={paidOrder()} items={ITEMS} />);

    await pick("Albania 10 GB — 30 Days");
    await pick("Turkey 5 GB — 15 Days");
    await userEvent.click(screen.getByRole("button", { name: /review refund/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm refund/i }));

    const turkeyRow = screen.getByText("Turkey 5 GB — 15 Days").closest("li");
    expect(
      within(turkeyRow).getByText(/greater than or equal to 1/i),
    ).toBeTruthy();
    const albaniaRow = screen.getByText("Albania 10 GB — 30 Days").closest("li");
    expect(within(albaniaRow).queryByText(/greater than or equal to 1/i)).toBeNull();
  });

  it("names the capability on a 403 instead of showing a bare denial", async () => {
    mockApi(() => jsonResponse({ detail: "Permission denied." }, 403));
    render(<AdminRefundPanel order={paidOrder()} items={ITEMS} />);

    await pick("Albania 10 GB — 30 Days");
    await userEvent.click(screen.getByRole("button", { name: /review refund/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm refund/i }));

    expect(await screen.findByText(/your role can't issue refunds/i)).toBeTruthy();
  });

  it("returns to the form after a refusal so the operator can correct it", async () => {
    mockApi(() =>
      jsonResponse(
        { error: { code: "refund_limit_exceeded", message: "This refund exceeds the refundable balance." } },
        409,
      ),
    );
    render(<AdminRefundPanel order={paidOrder()} items={ITEMS} />);

    await pick("Albania 10 GB — 30 Days");
    await userEvent.click(screen.getByRole("button", { name: /review refund/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm refund/i }));

    await screen.findByRole("alert");
    expect(screen.getByLabelText(/refund amount for Albania/i).value).toBe("16.99");
    expect(screen.getByRole("button", { name: /review refund/i })).toBeTruthy();
  });
});
