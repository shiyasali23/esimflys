// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorState } from "./error-state";
import { ApiError } from "@/lib/api/errors";

/**
 * The failure panel.
 *
 * Two jobs: never put a raw object or stack on screen, and never lose the
 * `correlation_id` a 500 carries — that id is the key to the server log
 * (contract §3.2), and a user who can quote it turns an unreproducible report
 * into a single lookup.
 */

describe("what it shows", () => {
  it("renders the server's own message", () => {
    render(<ErrorState error={new ApiError({ message: "Upstream is down.", status: 500 })} />);
    expect(screen.getByText("Upstream is down.")).toBeTruthy();
  });

  it("accepts a plain string too", () => {
    render(<ErrorState error="Something specific went wrong." />);
    expect(screen.getByText("Something specific went wrong.")).toBeTruthy();
  });

  /** The whole reason this component exists. */
  it("never renders an object as text", () => {
    render(<ErrorState error={{}} />);
    expect(document.body.textContent).not.toContain("[object Object]");
    expect(screen.getByText(/try again in a moment/i)).toBeTruthy();
  });

  it("is announced as an alert", () => {
    render(<ErrorState error="Boom." />);
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});

describe("the correlation id", () => {
  const withId = () =>
    new ApiError({
      code: "internal_error",
      message: "Something failed.",
      status: 500,
      correlationId: "7f3c1a9e-2b44",
    });

  it("is shown so the user can quote it to support", () => {
    render(<ErrorState error={withId()} />);
    expect(screen.getByText("7f3c1a9e-2b44")).toBeTruthy();
    expect(screen.getByText(/quote this to support/i)).toBeTruthy();
  });

  /** Selecting a 12-character id by hand is exactly where people mistype. */
  it("is selectable in one click", () => {
    render(<ErrorState error={withId()} />);
    expect(screen.getByText("7f3c1a9e-2b44").className).toMatch(/select-all/);
  });

  it("shows no empty label when the server sent none", () => {
    render(<ErrorState error={new ApiError({ message: "Bad input.", status: 400 })} />);
    expect(screen.queryByText(/quote this to support/i)).toBeNull();
  });

  it("does not break on a plain-string error", () => {
    render(<ErrorState error="Offline." />);
    expect(screen.queryByText(/quote this to support/i)).toBeNull();
  });
});
