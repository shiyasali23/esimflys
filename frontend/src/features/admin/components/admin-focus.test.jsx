// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminRefundPanel } from "./admin-refund-panel.client";
import { AdminAgencies } from "./admin-agencies.client";
import { AdminAgencyDetail } from "./admin-agency-detail.client";
import { AdminEsimDetail } from "./admin-esim-detail.client";
import { fixtureFor, ORDER_DETAIL } from "./admin-fixtures";

/**
 * Focus when a step is revealed.
 *
 * axe cannot see any of this — it inspects a static DOM, and every one of these
 * screens passes it. The failure is dynamic: clicking a control that then unmounts
 * drops focus to `<body>`, silently returning a keyboard user to the top of the
 * document and telling a screen-reader user nothing appeared.
 *
 * Verified as a real defect in the browser before these tests existed:
 * "Review refund" left `document.activeElement === document.body`.
 */

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockApi(post) {
  globalThis.fetch = vi.fn((url, init) => {
    if (init?.method && init.method !== "GET") {
      return Promise.resolve(post ? post() : jsonResponse({}, 200));
    }
    return Promise.resolve(jsonResponse(fixtureFor(url)));
  });
}

beforeEach(() => {
  document.cookie = "csrftoken=t; path=/";
});

afterEach(() => vi.restoreAllMocks());

describe("the refund confirm step", () => {
  it("takes focus instead of dropping it to the body", async () => {
    mockApi();
    render(<AdminRefundPanel order={ORDER_DETAIL} items={ORDER_DETAIL.items} />);

    await userEvent.click(screen.getAllByRole("checkbox")[0]);
    await userEvent.click(screen.getByRole("button", { name: /review refund/i }));

    expect(document.activeElement).not.toBe(document.body);
    const step = screen.getByRole("group");
    expect(step.contains(document.activeElement)).toBe(true);
  });

  /**
   * Focus lands on the container, not on "Confirm refund". Landing on a
   * destructive button means a stray Enter issues the refund.
   */
  it("does not put focus on the destructive button itself", async () => {
    mockApi();
    render(<AdminRefundPanel order={ORDER_DETAIL} items={ORDER_DETAIL.items} />);

    await userEvent.click(screen.getAllByRole("checkbox")[0]);
    await userEvent.click(screen.getByRole("button", { name: /review refund/i }));

    expect(document.activeElement).not.toBe(
      screen.getByRole("button", { name: /confirm refund/i }),
    );
  });

  it("names the step by the question it is asking", async () => {
    mockApi();
    render(<AdminRefundPanel order={ORDER_DETAIL} items={ORDER_DETAIL.items} />);

    await userEvent.click(screen.getAllByRole("checkbox")[0]);
    await userEvent.click(screen.getByRole("button", { name: /review refund/i }));

    expect(screen.getByRole("group").getAttribute("aria-labelledby")).toBeTruthy();
    expect(screen.getByRole("group").textContent).toMatch(/cannot be\s+undone/i);
  });
});

describe("the suspend reason form", () => {
  it("takes focus on the agency detail, so the operator can just type", async () => {
    mockApi();
    render(<AdminAgencyDetail orgId="org-1" />);
    await screen.findByText("Sunrise Travel");

    await userEvent.click(screen.getByRole("button", { name: /^suspend$/i }));

    expect(document.activeElement).toBe(screen.getByLabelText(/reason/i));
  });

  it("takes focus on the agencies list too", async () => {
    mockApi();
    render(<AdminAgencies />);
    await screen.findByText("Sunrise Travel");

    await userEvent.click(screen.getByRole("button", { name: /^suspend$/i }));

    expect(document.activeElement).toBe(screen.getByLabelText(/reason/i));
  });

  // The consequence must be announced with the field, not left as nearby text a
  // screen reader never reaches once focus jumps to the input.
  it("associates the consequence with the field", async () => {
    mockApi();
    render(<AdminAgencyDetail orgId="org-1" />);
    await screen.findByText("Sunrise Travel");

    await userEvent.click(screen.getByRole("button", { name: /^suspend$/i }));

    const input = screen.getByLabelText(/reason/i);
    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy).textContent).toMatch(/audit trail/i);
  });

  it("does not steal focus before the operator asks for it", async () => {
    mockApi();
    render(<AdminAgencyDetail orgId="org-1" />);
    await screen.findByText("Sunrise Travel");

    expect(screen.queryByLabelText(/reason/i)).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });
});

describe("revealed credentials", () => {
  it("move focus to the section rather than appearing silently", async () => {
    mockApi(() =>
      jsonResponse({
        id: "e1",
        status: "ready",
        credentials: {
          iccid: "8944000000000005587",
          smdp_address: "consumer.rsp.example.com",
          activation_code: "K2-9QX-441",
          qr_payload: "LPA:1$consumer.rsp.example.com$K2-9QX-441",
          short_url: "https://esimflys.test/i/abc",
        },
      }),
    );
    render(<AdminEsimDetail esimId="e1" />);
    await screen.findByRole("heading", { name: /albania 10 gb/i });

    await userEvent.click(screen.getByRole("button", { name: /reveal credentials/i }));
    await screen.findByText("8944000000000005587");

    const section = screen.getByText("8944000000000005587").closest("section");
    expect(section.contains(document.activeElement) || section === document.activeElement).toBe(
      true,
    );
    expect(section.getAttribute("aria-labelledby")).toBeTruthy();
  });
});
