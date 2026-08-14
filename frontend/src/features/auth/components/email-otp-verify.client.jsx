"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * Name + email capture, then a 6-digit code step before the caller's CTA fires.
 * Demo stub — no real email is sent; any 6-digit code is accepted (blueprint's
 * auth forms note the backend owns real verification once wired).
 */
export function EmailOtpVerify({ ctaLabel = "Continue", ctaVariant = "primary", onVerified }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [stage, setStage] = useState("form"); // form | sent
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");

  function sendCode(e) {
    e.preventDefault();
    setError("");
    setSending(true);
    setTimeout(() => {
      setSending(false);
      setStage("sent");
    }, 700);
  }

  function verifyAndContinue(e) {
    e.preventDefault();
    if (otp.trim().length !== 6) {
      setError("Enter the 6-digit code we sent you.");
      return;
    }
    setError("");
    setVerifying(true);
    setTimeout(() => {
      setVerifying(false);
      onVerified?.({ name, email });
    }, 500);
  }

  if (stage === "sent") {
    return (
      <form onSubmit={verifyAndContinue} className="space-y-3">
        <p className="text-body-sm text-muted-foreground">
          Enter the 6-digit code we sent to{" "}
          <span className="font-semibold text-foreground">{email}</span>.
        </p>
        <label className="block">
          <span className="mb-1 block text-label-bold text-foreground">Verification code</span>
          <Input
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
          />
        </label>
        {error ? <p className="text-body-sm text-destructive">{error}</p> : null}
        <Button type="submit" variant={ctaVariant} size="md" className="w-full" disabled={verifying}>
          {verifying ? "Verifying…" : ctaLabel}
        </Button>
        <div className="flex items-center justify-between text-body-sm">
          <button
            type="button"
            onClick={() => {
              setStage("form");
              setOtp("");
            }}
            className="text-muted-foreground hover:text-primary"
          >
            Change email
          </button>
          <button type="button" onClick={sendCode} className="font-semibold text-primary hover:underline">
            Resend code
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={sendCode} className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-label-bold text-foreground">Full name</span>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jordan Lee" required />
      </label>
      <label className="block">
        <span className="mb-1 block text-label-bold text-foreground">Email address</span>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
        />
      </label>
      <Button type="submit" variant="outline" size="md" className="w-full" disabled={sending}>
        {sending ? "Sending code…" : "Send verification code"}
      </Button>
    </form>
  );
}
