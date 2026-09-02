"use client";
import { useEffect, useState } from "react";
import { Check, Copy, Smartphone } from "lucide-react";

import { QrCode } from "@/components/media/qr-code.client";

/**
 * The LPA string an eSIM QR encodes: `LPA:1$<smdp-host>$<matching-id>`.
 *
 * Validated rather than trusted. The one-tap install URL below is only built when the
 * payload really is an LPA string, because a malformed one produces a link that opens
 * iOS's installer with nothing in it — a dead end that looks like a broken product,
 * where showing the QR and a copy button would have worked.
 */
const LPA_PATTERN = /^LPA:1\$[^$\s]+\$[^$\s]+$/;

/**
 * Apple's universal link for eSIM installation, iOS 17.4 and later.
 *
 * The base URL must be lowercase; the activation code keeps its own casing. The LPA
 * string is appended RAW rather than percent-encoded — every published example does it
 * that way, and an LPA payload contains no character that needs encoding (no spaces,
 * no `&`, no `?`), so encoding would only risk a handler that parses naively.
 *
 * `esimsetup.apple.com` has no A record. That is not a mistake: iOS intercepts the
 * domain in the OS and never resolves it. The corollary is what makes the gating below
 * load-bearing — on anything that is NOT iOS 17.4+, the same link reaches DNS and dies
 * as "Server Not Found", which is worse than the copy button it would have replaced.
 */
function installUrl(payload) {
  if (!payload || !LPA_PATTERN.test(payload)) return null;
  return `https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=${payload}`;
}

/**
 * Whether this device can actually use the universal link.
 *
 * Deliberately conservative: anything it cannot positively identify as iOS 17.4+ gets
 * the QR and the copy buttons, which work everywhere. A false negative costs one tap;
 * a false positive sends someone to a "Server Not Found" page holding the eSIM they
 * just paid for.
 *
 * iPadOS 13+ reports itself as "Macintosh", so a Mac UA with touch points is an iPad.
 */
function useSupportsUniversalLink() {
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent || "";
    const isIpadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
    if (!/iPhone|iPad|iPod/.test(ua) && !isIpadOS) return;

    // "iPhone OS 17_4" / "CPU OS 17_4" / "Version/17.4"
    const m = ua.match(/(?:iPhone )?OS (\d+)[_.](\d+)/) || ua.match(/Version\/(\d+)\.(\d+)/);
    if (!m) return;
    const major = Number(m[1]);
    const minor = Number(m[2]);
    setSupported(major > 17 || (major === 17 && minor >= 4));
  }, []);

  return supported;
}

function CopyRow({ label, value }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked outside a secure context and in some in-app browsers.
      // The value stays selectable on screen, so this degrades to what it was before.
    }
  }

  if (!value) return null;
  return (
    <div className="rounded-lg border border-border bg-muted/50 p-3 text-left">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-body-sm text-muted-foreground">{label}</p>
          <p className="mt-0.5 break-all font-mono text-body-sm font-medium text-foreground">
            {value}
          </p>
        </div>
        <button
          type="button"
          onClick={copy}
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-label-bold text-foreground transition-colors hover:bg-muted"
          aria-label={copied ? `${label} copied` : `Copy ${label}`}
        >
          {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

/**
 * Everything a customer needs to get the eSIM onto a phone, in one place.
 *
 * This existed three times over — the confirmation page, the order lookup and the
 * account detail each rendered their own `<QrCode>` and `<dl>` of the same fields, and
 * they had already drifted (only one of them showed the ICCID). None offered a copy
 * button, so on the phone someone had just bought from, the QR was useless — you cannot
 * scan your own screen — and the only route left was retyping
 * `LPA:1$rsp.redtea.io$CDB21D069D3B452F98B3426578A5FD11` by hand into Settings.
 *
 * Order of affordances is deliberate, most direct first:
 *   1. one tap, where the OS supports it;
 *   2. copy, which works on every device;
 *   3. the QR, for scanning from a SECOND device.
 */
export function EsimInstall({ credentials, showIccid = false }) {
  const supportsUniversalLink = useSupportsUniversalLink();
  const payload = credentials?.qr_payload;
  const url = installUrl(payload);
  const oneTap = supportsUniversalLink && url;

  if (!credentials) return null;

  return (
    <div className="space-y-4">
      {oneTap ? (
        <div>
          <a
            href={url}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-cta px-6 text-label-bold text-cta-foreground shadow-l2 transition hover:brightness-110"
          >
            <Smartphone size={18} aria-hidden />
            Install this eSIM
          </a>
          <p className="mt-2 text-center text-body-sm text-muted-foreground">
            Opens your iPhone&apos;s eSIM setup with the details filled in.
          </p>
        </div>
      ) : null}

      <div className="space-y-2">
        <CopyRow label="Activation code" value={credentials.activation_code} />
        <CopyRow label="SM-DP+ address" value={credentials.smdp_address} />
        {showIccid ? <CopyRow label="ICCID" value={credentials.iccid} /> : null}
      </div>

      <details className="rounded-lg border border-border bg-card p-3">
        <summary className="cursor-pointer text-label-bold text-foreground">
          {oneTap ? "Installing on another phone? Scan this" : "Scan with another device"}
        </summary>
        <div className="mt-3 text-center">
          <QrCode payload={payload} />
          <p className="mt-2 text-body-sm text-muted-foreground">
            Scan this from a second device — you can&apos;t scan your own screen.
          </p>
        </div>
      </details>
    </div>
  );
}
