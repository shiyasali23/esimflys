// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { EsimList } from "@/features/account/components/esim-list.client";
import { useSession } from "@/features/auth/use-session.client";

/**
 * My eSIMs.
 *
 * The list endpoint deliberately omits activation credentials — only the detail
 * route returns them — so nothing secret may render here. Usage arrives in BYTES,
 * while plan allowances elsewhere are MB; mixing the two silently misreports how
 * much data a customer has left.
 */

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const READY = {
  id: "e1",
  status: "ready",
  product_name: "Malaysia 10 GB — 30 Days",
  country_name: "Malaysia",
  country_iso2: "MY",
  plan_type: "fixed",
  validity_days: 30,
  iccid_last4: "2365",
  total_data_bytes: 11000000000,
  remaining_data_bytes: 5500000000,
};

const list = (results) => ({ count: results.length, next: null, previous: null, results });

beforeEach(() => {
  globalThis.fetch = vi.fn(() => new Promise(() => {}));
  document.cookie = "csrftoken=t; path=/";
  useSession.setState({ user: { id: "u1", email: "a@b.com" }, error: null, loading: false });
});

afterEach(() => vi.restoreAllMocks());

describe("signed out", () => {
  it("prompts sign-in and still offers the guest route", async () => {
    useSession.setState({ user: null });
    render(<EsimList />);
    expect(await screen.findByText(/sign in to see your esims/i)).toBeTruthy();
    const lookup = screen.getByRole("link", { name: /find a guest order/i });
    expect(lookup.getAttribute("href")).toBe("/orders/lookup");
  });
});

describe("with eSIMs", () => {
  it("renders usage in bytes, not mistaken for MB", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse(list([READY])));
    render(<EsimList />);
    await screen.findByText("Malaysia 10 GB — 30 Days");
    // 5.5e9 bytes → 5.5 GB remaining of 11 GB
    expect(screen.getByText(/5\.5 GB remaining/i)).toBeTruthy();
    expect(screen.getByText(/of 11 GB/i)).toBeTruthy();
  });

  it("exposes the usage bar to assistive tech with a real value", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse(list([READY])));
    render(<EsimList />);
    await screen.findByText("Malaysia 10 GB — 30 Days");
    const bar = screen.getByRole("progressbar", { name: /data remaining on malaysia/i });
    expect(bar.getAttribute("aria-valuenow")).toBe("50");
  });

  it("links each eSIM to its own detail page", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse(list([READY])));
    render(<EsimList />);
    await screen.findByText("Malaysia 10 GB — 30 Days");
    expect(screen.getByRole("link").getAttribute("href")).toBe("/account/esims/e1");
  });

  /** The whole point of the list/detail split. */
  it("leaks no activation credentials", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse(list([READY])));
    render(<EsimList />);
    await screen.findByText("Malaysia 10 GB — 30 Days");
    expect(document.body.textContent).not.toMatch(/activation code|smdp\.|LPA:/i);
  });

  it("shows only the last four of the ICCID", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse(list([READY])));
    render(<EsimList />);
    await screen.findByText("Malaysia 10 GB — 30 Days");
    expect(screen.getByText(/ICCID ••••2365/)).toBeTruthy();
  });
});

describe("states", () => {
  it("explains an empty account rather than showing a bare list", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse(list([])));
    render(<EsimList />);
    expect(await screen.findByText(/no esims yet/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /browse plans/i })).toBeTruthy();
  });

  it("offers retry on failure, with the server's message", async () => {
    globalThis.fetch.mockResolvedValue(
      jsonResponse({ error: { code: "internal_error", message: "Couldn't reach the supplier." } }, 500),
    );
    render(<EsimList />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("Couldn't reach the supplier.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy();
  });

  it("marks a still-provisioning eSIM as pending", async () => {
    globalThis.fetch.mockResolvedValue(
      jsonResponse(list([{ ...READY, status: "provisioning", total_data_bytes: 0, remaining_data_bytes: 0 }])),
    );
    render(<EsimList />);
    await screen.findByText("Malaysia 10 GB — 30 Days");
    expect(screen.getByText("provisioning")).toBeTruthy();
  });
});
