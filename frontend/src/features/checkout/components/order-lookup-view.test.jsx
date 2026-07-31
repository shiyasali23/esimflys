// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OrderLookupView } from "./order-lookup-view.client";

/**
 * Guest order retrieval — the only way someone without an account reaches their
 * own eSIM.
 *
 * The security-relevant rule: a wrong email returns 404 exactly like an unknown
 * order number, and the UI must not distinguish them. Saying "that order exists,
 * wrong email" would turn this form into an oracle for which order numbers are
 * real. Rate limited to 10/min, which the UI has to explain rather than swallow.
 */

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const CREDENTIALS = {
  iccid: "8944000000000005587",
  smdp_address: "consumer.rsp.example.com",
  activation_code: "K2-9QX-441",
  qr_payload: "LPA:1$consumer.rsp.example.com$K2-9QX-441",
};

const RESULT = {
  order: {
    order_number: "ESF-79039D08EF7C",
    total_minor: 1699,
    currency: "USD",
    payment_status: "paid",
    fulfillment_status: "delivered",
    status: "fulfilled",
  },
  esims: [{ product_name: "Saudi Arabia 10 GB — 30 Days", status: "ready", credentials: CREDENTIALS }],
};

function mockApi(respond) {
  globalThis.fetch = vi.fn(() => Promise.resolve(respond ? respond() : jsonResponse(RESULT)));
}

const posts = () => globalThis.fetch.mock.calls.filter((c) => c[1]?.method === "POST");

async function lookup({ number = "ESF-79039D08EF7C", email = "traveller@example.com" } = {}) {
  if (number) await userEvent.type(screen.getByLabelText(/order number/i), number);
  if (email) await userEvent.type(screen.getByLabelText(/email address/i), email);
  await userEvent.click(screen.getByRole("button", { name: /find my order/i }));
}

beforeEach(() => {
  document.cookie = "csrftoken=t; path=/";
});

afterEach(() => vi.restoreAllMocks());

describe("what gets sent", () => {
  it("posts the order number and email to the guest lookup endpoint", async () => {
    mockApi();
    render(<OrderLookupView />);
    await lookup();

    expect(String(posts()[0][0])).toContain("/orders/lookup/");
    expect(JSON.parse(posts()[0][1].body)).toMatchObject({
      order_number: "ESF-79039D08EF7C",
      email: "traveller@example.com",
    });
  });

  it("trims stray whitespace rather than sending it", async () => {
    mockApi();
    render(<OrderLookupView />);
    await lookup({ number: "  ESF-79039D08EF7C  ", email: "  traveller@example.com  " });

    const body = JSON.parse(posts()[0][1].body);
    expect(body.order_number).toBe("ESF-79039D08EF7C");
    expect(body.email).toBe("traveller@example.com");
  });
});

describe("validation before the request", () => {
  it("asks for the order number instead of sending an empty one", async () => {
    mockApi();
    render(<OrderLookupView />);
    await lookup({ number: "" });

    // Scoped to the field's own error: the page intro also says "Enter your order
    // number and the email you used at checkout".
    const field = await screen.findByLabelText(/order number/i);
    const errorId = field.getAttribute("aria-describedby");
    expect(document.getElementById(errorId).textContent).toMatch(/enter your order number/i);
    expect(posts()).toHaveLength(0);
  });

  it("rejects a malformed email locally", async () => {
    mockApi();
    render(<OrderLookupView />);
    await lookup({ email: "not-an-email" });

    expect(await screen.findByText(/enter the email used at checkout/i)).toBeTruthy();
    expect(posts()).toHaveLength(0);
  });

  it("marks the failing field for assistive tech, not just visually", async () => {
    mockApi();
    render(<OrderLookupView />);
    await lookup({ email: "nope" });

    const field = screen.getByLabelText(/email address/i);
    expect(field.getAttribute("aria-invalid")).toBe("true");
    const describedBy = field.getAttribute("aria-describedby");
    expect(document.getElementById(describedBy).textContent).toMatch(/email used at checkout/i);
  });
});

describe("a lookup that finds nothing", () => {
  /**
   * The server returns 404 for a wrong email AND for an unknown order number.
   * The message must stay identical, or the form reveals which order numbers exist.
   */
  it("does not reveal whether the order number or the email was wrong", async () => {
    mockApi(() => jsonResponse({ detail: "Not found." }, 404));
    render(<OrderLookupView />);
    await lookup();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/couldn't find an order with that number and email/i);
    expect(alert.textContent).not.toMatch(/email (is|was) (wrong|incorrect)|no such order number/i);
  });

  it("explains the rate limit rather than looking broken", async () => {
    mockApi(() => jsonResponse({ detail: "Throttled." }, 429));
    render(<OrderLookupView />);
    await lookup();

    expect(await screen.findByText(/too many attempts/i)).toBeTruthy();
  });

  it("clears a previous result so stale details cannot linger", async () => {
    let call = 0;
    globalThis.fetch = vi.fn(() => {
      call += 1;
      return Promise.resolve(call === 1 ? jsonResponse(RESULT) : jsonResponse({ detail: "Not found." }, 404));
    });
    render(<OrderLookupView />);
    await lookup();
    expect(await screen.findByText("ESF-79039D08EF7C")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: /find my order/i }));

    await screen.findByRole("alert");
    expect(screen.queryByText("ESF-79039D08EF7C")).toBeNull();
    expect(screen.queryByText(CREDENTIALS.activation_code)).toBeNull();
  });
});

describe("a successful lookup", () => {
  it("shows the order and its activation credentials", async () => {
    mockApi();
    render(<OrderLookupView />);
    await lookup();

    expect(await screen.findByText("ESF-79039D08EF7C")).toBeTruthy();
    expect(screen.getByText("$16.99")).toBeTruthy();
    expect(screen.getByText(CREDENTIALS.smdp_address)).toBeTruthy();
    expect(screen.getByText(CREDENTIALS.activation_code)).toBeTruthy();
  });

  /** An eSIM without credentials is mid-provisioning, not broken. */
  it("says an unprovisioned eSIM is still being prepared", async () => {
    mockApi(() =>
      jsonResponse({
        ...RESULT,
        esims: [{ product_name: "Saudi Arabia 10 GB — 30 Days", status: "provisioning", credentials: null }],
      }),
    );
    render(<OrderLookupView />);
    await lookup();

    expect(await screen.findByText(/still being prepared \(provisioning\)/i)).toBeTruthy();
  });

  it("distinguishes a delivered order with no eSIMs from one still in flight", async () => {
    mockApi(() =>
      jsonResponse({
        order: { ...RESULT.order, fulfillment_status: "unfulfilled", payment_status: "pending" },
        esims: [],
      }),
    );
    render(<OrderLookupView />);
    await lookup();

    expect(await screen.findByText(/still being prepared\. check back/i)).toBeTruthy();
  });

  it("reassures that the details were emailed too", async () => {
    mockApi();
    render(<OrderLookupView />);
    await lookup();

    expect(await screen.findByText(/also emailed to you/i)).toBeTruthy();
  });
});

describe("while it is running", () => {
  it("disables the button so a rate-limited endpoint is not hammered", async () => {
    let release;
    globalThis.fetch = vi.fn(() => new Promise((resolve) => { release = () => resolve(jsonResponse(RESULT)); }));
    render(<OrderLookupView />);
    await lookup();

    const button = screen.getByRole("button", { name: /looking up/i });
    expect(button.disabled).toBe(true);
    release();
    expect(await screen.findByText("ESF-79039D08EF7C")).toBeTruthy();
  });
});
