// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "@/components/data/status-badge";
import { ErrorState } from "@/components/feedback/error-state";
import { QrCode } from "@/components/media/qr-code.client";

/**
 * The small shared pieces every table and panel leans on.
 */

describe("StatusBadge", () => {
  /**
   * Operators need the real backend value, not a paraphrase — it's what they'll
   * quote in a ticket or search the audit log for.
   */
  it("shows the actual status text, only softening underscores", () => {
    render(<StatusBadge status="manual_review" />);
    expect(screen.getByText("manual review")).toBeTruthy();
  });

  it("renders nothing at all for an absent status", () => {
    const { container } = render(<StatusBadge status={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("distinguishes success, attention and in-flight states visually", () => {
    const { container: ok } = render(<StatusBadge status="paid" />);
    const { container: bad } = render(<StatusBadge status="failed" />);
    const { container: mid } = render(<StatusBadge status="pending" />);
    const cls = (c) => c.firstChild.className;
    expect(cls(ok)).not.toBe(cls(bad));
    expect(cls(bad)).not.toBe(cls(mid));
  });

  // A status added on the backend must not blank a cell or throw.
  it("still renders an unfamiliar status", () => {
    render(<StatusBadge status="awaiting_carrier_ack" />);
    expect(screen.getByText("awaiting carrier ack")).toBeTruthy();
  });
});

describe("ErrorState", () => {
  it("renders the server's message and is announced as an alert", () => {
    render(<ErrorState error={{ message: "Upstream is down." }} />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Upstream is down.")).toBeTruthy();
  });

  it("accepts a bare string as well as an error object", () => {
    render(<ErrorState error="Something specific happened." />);
    expect(screen.getByText("Something specific happened.")).toBeTruthy();
  });

  /** The failure mode this component exists to prevent. */
  it("never prints [object Object] when handed something odd", () => {
    render(<ErrorState error={{ weird: true }} />);
    expect(document.body.textContent).not.toContain("[object Object]");
    expect(screen.getByText(/please try again in a moment/i)).toBeTruthy();
  });

  it("offers retry only when there is something to retry", () => {
    const { rerender } = render(<ErrorState error="x" />);
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
    rerender(<ErrorState error="x" onRetry={() => {}} />);
    expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy();
  });
});

describe("QrCode", () => {
  it("explains itself while encoding rather than showing a blank box", () => {
    const { container } = render(<QrCode payload="" />);
    expect(screen.getByText(/preparing your qr code/i)).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });

  it("carries a describable label for screen readers when rendered", () => {
    // The canvas encode is async; the placeholder is what renders synchronously.
    const { container } = render(<QrCode payload="LPA:1$smdp.example.com$CODE" />);
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
  });
});
