"""Send transactional mail over Resend's HTTP API instead of SMTP.

WHY THIS EXISTS. Every email this platform ever sent failed. All ten notifications on
production — five `order-confirmation` and five `esim-ready` — died with "timed out"
after five attempts each. `esim-ready` carries the QR code, so no customer has ever
received their eSIM by email; the five sales that worked did so only because the buyer
stayed on the confirmation page long enough to see it.

The configuration was never wrong: EMAIL_HOST=smtp.resend.com, port 587, TLS on, a
36-character API key. Resend's SMTP answers in 0.19s from a laptop. It is the container
that cannot reach it — outbound SMTP is blocked, which is ordinary for a PaaS and
invisible from the config.

So this stops arguing with the network. The same container already talks to Stripe and
to eSIM Access over HTTPS on 443 all day, and Resend exposes the identical send over
that port. Swapping the transport removes the failure mode rather than retrying into it.

Errors are RAISED, not swallowed. `orders.notifications._send_one` wraps `message.send()`
and records the exception on the Notification row, which is what drives the retry ledger
and the failure counter on the dashboard. A backend that quietly returned 0 would mark
mail as sent and take the one signal anybody had that delivery was broken.
"""

import json
import logging

import httpx
from django.conf import settings
from django.core.mail.backends.base import BaseEmailBackend

logger = logging.getLogger(__name__)

API_URL = "https://api.resend.com/emails"


class ResendEmailBackend(BaseEmailBackend):
    """Django email backend that POSTs to Resend rather than opening an SMTP session."""

    def __init__(self, fail_silently=False, **kwargs):
        super().__init__(fail_silently=fail_silently, **kwargs)
        self._api_key = getattr(settings, "RESEND_API_KEY", "") or ""
        self._timeout = float(getattr(settings, "EMAIL_TIMEOUT", 10) or 10)

    def send_messages(self, email_messages):
        if not email_messages:
            return 0
        if not self._api_key:
            # Loud on purpose. A missing key must look like the outage it is, not like a
            # quiet no-op that leaves orders looking delivered.
            if self.fail_silently:
                return 0
            raise RuntimeError(
                "RESEND_API_KEY is not set, so no email can be sent. Set it, or set "
                "EMAIL_BACKEND to Django's console backend for local work."
            )

        sent = 0
        with httpx.Client(timeout=self._timeout) as client:
            for message in email_messages:
                try:
                    self._send_one(client, message)
                except Exception:
                    if not self.fail_silently:
                        raise
                else:
                    sent += 1
        return sent

    def _send_one(self, client, message):
        payload = {
            "from": message.from_email or settings.DEFAULT_FROM_EMAIL,
            "to": list(message.to),
            "subject": message.subject,
        }
        if message.cc:
            payload["cc"] = list(message.cc)
        if message.bcc:
            payload["bcc"] = list(message.bcc)
        if message.reply_to:
            payload["reply_to"] = list(message.reply_to)

        text, html = _bodies(message)
        if text:
            payload["text"] = text
        if html:
            payload["html"] = html
        # Resend rejects a message with neither. Send the subject rather than 400 on an
        # empty body — an odd-looking email beats a delivery that never happens.
        if not text and not html:
            payload["text"] = message.subject or ""

        response = client.post(
            API_URL,
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
            },
            content=json.dumps(payload),
        )
        if response.status_code >= 400:
            # The body carries Resend's reason ("domain not verified", "invalid to"),
            # which lands on Notification.failure_message and is the whole point of
            # having a failure column. Truncated so one bad response cannot flood a row.
            raise RuntimeError(
                f"Resend rejected the message ({response.status_code}): "
                f"{response.text[:300]}"
            )
        logger.info("Resend accepted message to %s", ", ".join(message.to))


def _bodies(message):
    """Return ``(text, html)`` for a Django message, however it was assembled.

    `EmailMultiAlternatives` keeps HTML in `alternatives`, not in `body`, and
    `notifications.py` attaches the SAME rendered template as both. Reading only `body`
    would send the raw HTML as plain text.
    """
    text = message.body if message.content_subtype == "plain" else None
    html = message.body if message.content_subtype == "html" else None
    for content, mimetype in getattr(message, "alternatives", ()) or ():
        if mimetype == "text/html" and not html:
            html = content
    return text, html
