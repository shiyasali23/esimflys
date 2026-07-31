// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { expectNoAxeViolations } from "@/test/axe";
import { fixtureFor, ORDER_DETAIL, PLAN_NO_PRICING, page } from "./admin-fixtures";

import { AdminDashboard } from "./admin-dashboard.client";
import { AdminOrders } from "./admin-orders.client";
import { AdminOrderDetail } from "./admin-order-detail.client";
import { AdminCustomers } from "./admin-customers.client";
import { AdminCustomerDetail } from "./admin-customer-detail.client";
import { AdminEsims } from "./admin-esims.client";
import { AdminEsimDetail } from "./admin-esim-detail.client";
import { AdminAgencies } from "./admin-agencies.client";
import { AdminAgencyDetail } from "./admin-agency-detail.client";
import { AdminCommissions } from "./admin-commissions.client";
import { AdminCatalogue } from "./admin-catalogue.client";
import { AdminPayments } from "./admin-payments.client";
import { AdminOperations } from "./admin-operations.client";
import { AdminAudit } from "./admin-audit.client";
import { AdminRefundPanel } from "./admin-refund-panel.client";

/**
 * WCAG 2.2 AA over every admin screen (CLAUDE.md §2).
 *
 * Each screen is rendered against payloads captured verbatim from the running
 * backend, then axe is run on the settled DOM — asserting on a loading skeleton
 * would pass while the real screen fails.
 *
 * Colour contrast is excluded: jsdom cannot compute it. It is checked in the real
 * browser separately.
 */

function mockApi(override) {
  globalThis.fetch = vi.fn((url) =>
    Promise.resolve(
      new Response(JSON.stringify(override ? override(String(url)) : fixtureFor(url)), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
}

beforeEach(() => {
  document.cookie = "csrftoken=t; path=/";
});

afterEach(() => vi.restoreAllMocks());

const SCREENS = [
  ["dashboard", () => <AdminDashboard />, /revenue/i],
  ["orders", () => <AdminOrders />, /ESF-DEVFIXTURE01/],
  ["order detail", () => <AdminOrderDetail orderId="o1" />, /ESF-DEVFIXTURE01/],
  ["customers", () => <AdminCustomers />, /traveller@example\.com/],
  ["customer detail", () => <AdminCustomerDetail customerId="c1" />, /Amira Haddad/],
  ["esims", () => <AdminEsims />, /Albania 10 GB/],
  ["esim detail", () => <AdminEsimDetail esimId="e1" />, /Albania 10 GB/],
  ["agencies", () => <AdminAgencies />, /Sunrise Travel/],
  ["agency detail", () => <AdminAgencyDetail orgId="org1" />, /Sunrise Travel/],
  ["commissions", () => <AdminCommissions />, /Sunrise Travel/],
  ["catalogue", () => <AdminCatalogue />, /Albania 10 GB/],
  ["payments", () => <AdminPayments />, /stripe/i],
  ["operations", () => <AdminOperations />, null],
  // The screen humanises the action: `esim.credentials_revealed` renders with the
  // dots and underscores replaced by spaces.
  ["audit", () => <AdminAudit />, /esim credentials revealed/],
];

describe("admin screens meet WCAG 2.2 AA", () => {
  for (const [name, renderScreen, settledOn] of SCREENS) {
    it(name, async () => {
      mockApi();
      const { container } = render(renderScreen());

      if (settledOn) await screen.findByText(settledOn);
      else await waitFor(() => expect(container.querySelector("[aria-busy]")).toBeNull());

      await expectNoAxeViolations(container);
    });
  }
});

describe("states other than the happy path", () => {
  it("a table's empty state is accessible", async () => {
    mockApi(() => page([]));
    const { container } = render(<AdminOrders />);
    await screen.findByText(/no orders/i);
    await expectNoAxeViolations(container);
  });

  it("a table's error state is accessible", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: { code: "internal_error", message: "Upstream is down." } }), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const { container } = render(<AdminOrders />);
    await screen.findByRole("alert");
    await expectNoAxeViolations(container);
  });

  // The pricing columns are absent for support/finance — a narrower table must
  // still pair every header with its cells.
  it("the catalogue without pricing columns is accessible", async () => {
    mockApi(() => page([PLAN_NO_PRICING]));
    const { container } = render(<AdminCatalogue />);
    await screen.findByText(/Albania 10 GB/);
    await expectNoAxeViolations(container);
  });

  it("the refund panel is accessible", async () => {
    mockApi();
    const { container } = render(
      <AdminRefundPanel order={ORDER_DETAIL} items={ORDER_DETAIL.items} />,
    );
    await expectNoAxeViolations(container);
  });
});
