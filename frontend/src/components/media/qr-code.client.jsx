"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * Renders an eSIM activation payload (`LPA:1$<smdp>$<code>`) as a scannable QR.
 *
 * This is the product itself, so it is encoded by a real library rather than
 * drawn — a decorative grid would look right and install nothing. Manual entry
 * details are always shown alongside, because some devices cannot scan and every
 * carrier profile can be added by hand.
 */
export function QrCode({ payload, size = 200, label = "eSIM activation QR code" }) {
  const [dataUrl, setDataUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!payload) return;
    let active = true;
    QRCode.toDataURL(payload, {
      width: size * 2,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#0a0a0a", light: "#ffffff" },
    })
      .then((url) => active && setDataUrl(url))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [payload, size]);

  if (!payload || failed) {
    return (
      <div
        className="mx-auto mb-4 flex items-center justify-center rounded-md border border-border bg-muted p-4 text-center text-body-sm text-muted-foreground"
        style={{ width: size, height: size }}
      >
        {failed ? "QR couldn't be rendered — use the details below." : "Preparing your QR code…"}
      </div>
    );
  }

  if (!dataUrl) {
    return (
      <div
        className="mx-auto mb-4 animate-pulse rounded-md bg-muted"
        style={{ width: size, height: size }}
        aria-busy="true"
      />
    );
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element -- a runtime data: URI, not an asset */
    <img
      src={dataUrl}
      alt={label}
      width={size}
      height={size}
      className="mx-auto mb-4 rounded-md border border-border bg-white"
    />
  );
}
