// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { expectNoAxeViolations } from "@/test/axe";
import { COUNTRY, COUNTRIES, PLANS, ORDER, ESIM, page } from "./storefront-fixtures";

import { Hero } from "@/features/home/components/hero";
import { HeroSearch } from "@/features/home/components/hero-search.client";
import { WhereTravelersGo } from "@/features/home/components/where-travelers-go.client";
import { TripQuiz } from "@/features/home/components/trip-quiz.client";
import { HowItWorks } from "@/features/home/components/how-it-works";
import { WhatIsEsim } from "@/features/home/components/what-is-esim";
import { WhyPick } from "@/features/home/components/why-pick";
import { StatsBand } from "@/features/home/components/stats-band";
import { CtaBand } from "@/features/home/components/cta-band";
import { AppCta } from "@/features/home/components/app-cta";
import { Faq } from "@/features/home/components/faq";
import { DestinationsBrowser } from "@/features/catalog/components/destinations-browser.client";
import { PlanSelector } from "@/features/catalog/components/plan-selector.client";
import { CountryFaq } from "@/features/catalog/components/country-faq";
import { RelatedCountries } from "@/features/catalog/components/related-countries";
import { AuthCard } from "@/features/auth/components/auth-card.client";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form.client";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form.client";
import { CheckoutView } from "@/features/checkout/components/checkout-view.client";
import { OrderLookupView } from "@/features/checkout/components/order-lookup-view.client";
import { EsimList } from "@/features/account/components/esim-list.client";
import { OrderList } from "@/features/account/components/order-list.client";
import { ProfileView } from "@/features/account/components/profile-view.client";

/**
 * WCAG 2.2 AA across the public storefront — the surface customers and Lighthouse
 * actually see, and where the project's a11y gates apply.
 *
 * Colour contrast is NOT asserted here: jsdom has no layout or paint, so the rule
 * can only return "incomplete". It is covered by `theme-contrast.test.js`, which
 * computes the token pairs arithmetically — that split exists because a real AA
 * failure (white/80 on the indigo hero, 3.82:1) survived a clean axe run for
 * exactly this reason.
 */

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockApi(route) {
  globalThis.fetch = vi.fn((url) => {
    const path = String(url);
    if (route) {
      const custom = route(path);
      if (custom !== undefined) return Promise.resolve(jsonResponse(custom));
    }
    if (path.includes("/account/me/")) return Promise.resolve(jsonResponse({ id: "u1", email: "traveller@example.com" }));
    if (path.includes("/esims")) return Promise.resolve(jsonResponse(page([ESIM])));
    if (path.includes("/orders")) return Promise.resolve(jsonResponse(page([ORDER])));
    return Promise.resolve(jsonResponse(page([])));
  });
}

beforeEach(() => {
  document.cookie = "csrftoken=t; path=/";
});

afterEach(() => vi.restoreAllMocks());

const settle = async (container) => {
  await waitFor(() => expect(container.querySelector("[aria-busy='true']")).toBeNull());
};

describe("home", () => {
  const SECTIONS = [
    ["hero", () => <Hero chips={COUNTRIES.slice(0, 3)} countries={COUNTRIES} />],
    ["hero search", () => <HeroSearch countries={COUNTRIES} />],
    ["where travellers go", () => <WhereTravelersGo destinations={COUNTRIES} />],
    ["trip quiz", () => <TripQuiz />],
    ["how it works", () => <HowItWorks />],
    ["what is an eSIM", () => <WhatIsEsim />],
    ["why pick us", () => <WhyPick />],
    ["stats band", () => <StatsBand />],
    ["cta band", () => <CtaBand />],
    ["app cta", () => <AppCta />],
    ["faq", () => <Faq />],
  ];

  for (const [name, renderSection] of SECTIONS) {
    it(name, async () => {
      mockApi();
      const { container } = render(renderSection());
      await settle(container);
      await expectNoAxeViolations(container);
    });
  }
});

describe("catalogue", () => {
  it("destinations browser", async () => {
    mockApi();
    const { container } = render(<DestinationsBrowser countries={COUNTRIES} />);
    await screen.findByText("Saudi Arabia");
    await expectNoAxeViolations(container);
  });

  it("plan selector", async () => {
    mockApi();
    const { container } = render(<PlanSelector country={COUNTRY} plans={PLANS} />);
    await settle(container);
    await expectNoAxeViolations(container);
  });

  it("country FAQ", async () => {
    mockApi();
    const { container } = render(<CountryFaq country={COUNTRY} faqs={null} />);
    await expectNoAxeViolations(container);
  });

  it("related countries", async () => {
    mockApi();
    const { container } = render(<RelatedCountries countries={COUNTRIES.slice(1)} />);
    await expectNoAxeViolations(container);
  });

  // A country with no active plans renders a different tree: no price, no plans.
  it("a country with nothing to sell", async () => {
    mockApi();
    const { container } = render(<PlanSelector country={COUNTRIES[3]} plans={[]} />);
    await settle(container);
    await expectNoAxeViolations(container);
  });
});

describe("auth", () => {
  it("sign in", async () => {
    mockApi();
    const { container } = render(<AuthCard mode="signin" />);
    await settle(container);
    await expectNoAxeViolations(container);
  });

  it("sign up", async () => {
    mockApi();
    const { container } = render(<AuthCard mode="signup" />);
    await settle(container);
    await expectNoAxeViolations(container);
  });

  it("forgot password", async () => {
    mockApi();
    const { container } = render(<ForgotPasswordForm />);
    await expectNoAxeViolations(container);
  });

  it("reset password", async () => {
    mockApi();
    const { container } = render(<ResetPasswordForm />);
    await expectNoAxeViolations(container);
  });
});

describe("checkout and account", () => {
  it("checkout", async () => {
    mockApi();
    const { container } = render(<CheckoutView />);
    await settle(container);
    await expectNoAxeViolations(container);
  });

  it("order lookup", async () => {
    mockApi();
    const { container } = render(<OrderLookupView />);
    await settle(container);
    await expectNoAxeViolations(container);
  });

  it("eSIM list", async () => {
    mockApi();
    const { container } = render(<EsimList />);
    await settle(container);
    await expectNoAxeViolations(container);
  });

  it("order list", async () => {
    mockApi();
    const { container } = render(<OrderList />);
    await settle(container);
    await expectNoAxeViolations(container);
  });

  it("profile", async () => {
    mockApi();
    const { container } = render(<ProfileView />);
    await settle(container);
    await expectNoAxeViolations(container);
  });

  it("an empty eSIM list", async () => {
    mockApi(() => page([]));
    const { container } = render(<EsimList />);
    await settle(container);
    await expectNoAxeViolations(container);
  });
});
