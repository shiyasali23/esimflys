from datetime import timedelta

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.db import transaction
from django.db.models import Q
from django.template.loader import render_to_string
from django.utils import timezone

from .models import Notification

MAX_ATTEMPTS = 5
BACKOFF_BASE_SECONDS = 30

TEMPLATES = {
    "order-confirmation": ("eSIMFlys — order {order_number} confirmed", "emails/order-confirmation.html"),
    "esim-ready": ("Your eSIM is ready to install", "emails/esim-ready.html"),
    "refund-confirmation": ("eSIMFlys — your refund has been processed", "emails/refund-confirmation.html"),
    "topup-confirmation": ("eSIMFlys — your top-up is complete", "emails/topup-confirmation.html"),
}


#: Domains reserved by RFC 2606 and RFC 6761. Mail to them cannot be delivered by
#: anybody, ever — they exist precisely so documentation and test data have addresses
#: that are guaranteed not to reach a real person.
RESERVED_TLDS = (".test", ".example", ".invalid", ".localhost")
RESERVED_DOMAINS = ("example.com", "example.net", "example.org")


def is_undeliverable(recipient):
    """Whether this address is one nobody can ever receive mail at."""
    address = str(recipient or "").strip().lower()
    local, _, domain = address.rpartition("@")
    # Anything that is not `something@something` cannot be mailed. This also covers a
    # string with no "@" at all: `rpartition` puts the whole string in `domain` and
    # leaves `local` empty when the separator is missing.
    if not local or not domain:
        return True
    if domain.endswith(RESERVED_TLDS):
        return True
    # Subdomains are reserved too: `sub.example.com` is as undeliverable as
    # `example.com`. Matched with a leading dot so `myexample.com` — a domain somebody
    # may really own — is not caught by it.
    return domain in RESERVED_DOMAINS or any(
        domain.endswith(f".{reserved}") for reserved in RESERVED_DOMAINS
    )


def queue_notification(*, template_code, recipient, idempotency_key, user=None, order=None, esim_profile=None):
    """Queue one message, unless the address is one that cannot receive mail.

    A reserved address is recorded as `cancelled` rather than `queued`, so it is never
    handed to the provider. Sending to it is not a failure that might succeed on retry —
    it is a guaranteed hard bounce, and a burst of those is how a sending domain's
    reputation is damaged for every real customer using it.

    [MEASURED] The demo seeder writes ~108 `@example.com` travellers. Suppressing them
    after the run was racy: the worker polls every two seconds and had already claimed one
    into `processing`, which then made FOUR real attempts and collected four 422s from
    Resend before anyone looked. Deciding at creation removes the window entirely.

    The row is still written. An eSIM whose delivery has no record at all is worse than
    one recorded as deliberately not sent.
    """
    undeliverable = is_undeliverable(recipient)
    notification, _ = Notification.objects.get_or_create(
        idempotency_key=idempotency_key,
        defaults={
            "template_code": template_code,
            "recipient": recipient,
            "user": user,
            "order": order,
            "esim_profile": esim_profile,
            "channel": "email",
            "status": "cancelled" if undeliverable else "queued",
            "failure_message": (
                "Reserved address (RFC 2606) — not deliverable, never sent."
                if undeliverable
                else None
            ),
        },
    )
    return notification


def send_pending_notifications(limit=100):
    processed = 0
    while processed < limit and _send_one():
        processed += 1
    return processed


def _send_one():
    now = timezone.now()
    with transaction.atomic():
        notification = (
            Notification.objects.select_for_update(skip_locked=True)
            .filter(status__in=["queued", "retrying"])
            .filter(Q(next_attempt_at__isnull=True) | Q(next_attempt_at__lte=now))
            .order_by("created_at")
            .first()
        )
        if notification is None:
            return False
        notification.status = "processing"
        notification.attempt_count += 1
        notification.save(update_fields=["status", "attempt_count", "updated_at"])

    _deliver(notification)
    return True


def _deliver(notification):
    try:
        subject_template, body_template = TEMPLATES.get(
            notification.template_code, TEMPLATES["order-confirmation"]
        )
        context = _context(notification)
        subject = subject_template.format(**context)
        body = render_to_string(body_template, context)
        message = EmailMultiAlternatives(
            subject, body, settings.DEFAULT_FROM_EMAIL, [notification.recipient]
        )
        message.attach_alternative(body, "text/html")
        message.send()
    except Exception as exc:
        _fail(notification, str(exc))
        return

    notification.status = "sent"
    notification.sent_at = timezone.now()
    notification.failure_message = None
    notification.save(update_fields=["status", "sent_at", "failure_message", "updated_at"])


def _fail(notification, message):
    with transaction.atomic():
        notification = Notification.objects.select_for_update().get(pk=notification.pk)
        notification.failure_message = message
        if notification.attempt_count >= MAX_ATTEMPTS:
            notification.status = "failed"
        else:
            notification.status = "retrying"
            delay = BACKOFF_BASE_SECONDS * (2 ** (notification.attempt_count - 1))
            notification.next_attempt_at = timezone.now() + timedelta(seconds=delay)
        notification.save(
            update_fields=["status", "failure_message", "next_attempt_at", "updated_at"]
        )


def _context(notification):
    context = {"order_number": "", "recipient": notification.recipient}
    if notification.order_id:
        context["order"] = notification.order
        context["order_number"] = notification.order.order_number
    if notification.esim_profile_id:
        context["esim"] = notification.esim_profile
    return context
