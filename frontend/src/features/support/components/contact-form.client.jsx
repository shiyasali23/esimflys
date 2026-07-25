"use client";
import { useState } from "react";

/** Contact form — DEMO. Wire the submit to your support inbox/ticketing before launch. */
export function ContactForm() {
  const [sent, setSent] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    setSent(true);
  }

  if (sent) {
    return (
      <div
        role="status"
        className="rounded-md border border-success-text/20 bg-success-text/10 p-6 text-body-md text-success-text"
      >
        Thanks — we'll be in touch. (Demo: this form isn't yet connected to a support inbox.)
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-label-bold text-foreground">Email</span>
        <input
          required
          type="email"
          name="email"
          className="w-full rounded-md border border-border bg-muted px-4 py-3 text-body-md outline-none focus:border-primary"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-label-bold text-foreground">Message</span>
        <textarea
          required
          name="message"
          rows={5}
          className="w-full rounded-md border border-border bg-muted px-4 py-3 text-body-md outline-none focus:border-primary"
        />
      </label>
      <button
        type="submit"
        className="rounded-sm bg-primary px-6 py-3 text-label-bold text-on-primary transition-all hover:bg-primary-container active:scale-95"
      >
        Send message
      </button>
    </form>
  );
}
