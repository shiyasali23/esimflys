"use client";
import { useEffect } from "react";

import { captureReferralFromUrl } from "./use-referral.client";

/**
 * Records an agency referral on whatever page the customer lands on.
 *
 * Mounted in the ROOT layout rather than the marketing one because the deep-link form
 * (`/r/{code}/{country-slug}`) lands on a country page, and a traveller who is sent
 * straight to checkout by an agency must attribute too.
 *
 * Renders nothing and blocks nothing: it runs in an effect after paint, so a customer
 * never waits on attribution, and `captureReferralFromUrl` swallows every failure.
 */
export function ReferralCapture() {
  useEffect(() => {
    captureReferralFromUrl();
  }, []);
  return null;
}
