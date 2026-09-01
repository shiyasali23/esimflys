from datetime import timedelta

import logging

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.db import transaction
from django.db.models import Q
from django.template.loader import render_to_string
from django.utils import timezone

from .models import Notification

MAX_ATTEMPTS = 5
BACKOFF_BASE_SECONDS = 30

#: template_code -> (subject, html template, plain-text template).
#:
#: The text template is not optional. `EmailMultiAlternatives(subject, body)` treats
#: `body` as the PLAIN TEXT part, and this module used to pass the rendered HTML into it
#: and then attach the same string again as the HTML alternative. Every message went out
#: with raw markup as its text/plain part — which is what a client with images or HTML
#: disabled renders, and what Gmail scrapes for the inbox preview line.
logger = logging.getLogger(__name__)

TEMPLATES = {
    "order-confirmation": (
        "Order {order_number} confirmed — your eSIM is on its way",
        "emails/order-confirmation.html",
        "emails/order-confirmation.txt",
    ),
    "esim-ready": (
        "Your eSIM for {order_number} is ready to install",
        "emails/esim-ready.html",
        "emails/esim-ready.txt",
    ),
    "refund-confirmation": (
        "Your refund for {order_number} has been processed",
        "emails/refund-confirmation.html",
        "emails/refund-confirmation.txt",
    ),
    "topup-confirmation": (
        "Your top-up for {order_number} is live",
        "emails/topup-confirmation.html",
        "emails/topup-confirmation.txt",
    ),
    "password-reset": (
        "Reset your eSIMFlys password",
        "emails/password-reset.html",
        "emails/password-reset.txt",
    ),
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
        subject_template, html_template, text_template = TEMPLATES.get(
            notification.template_code, TEMPLATES["order-confirmation"]
        )
        context = _context(notification)
        subject = subject_template.format(**context)
        text_body = render_to_string(text_template, context).strip() + "\n"
        html_body = render_to_string(html_template, context)
        message = EmailMultiAlternatives(
            subject,
            text_body,
            settings.DEFAULT_FROM_EMAIL,
            [notification.recipient],
            # A reply-to that reaches a person. The From address is no-reply@, so without
            # this a customer who hits Reply — the first thing anyone does when an eSIM
            # will not connect — is writing to a mailbox nobody reads. An unanswered
            # support question on a card charge is how a chargeback starts.
            reply_to=[settings.SUPPORT_EMAIL],
        )
        message.attach_alternative(html_body, "text/html")
        message.send()
    except Exception as exc:
        _fail(notification, str(exc))
        return

    notification.status = "sent"
    notification.sent_at = timezone.now()
    notification.failure_message = None
    notification.save(update_fields=["status", "sent_at", "failure_message", "updated_at"])


def send_password_reset(*, user, uid, token):
    """Send the reset link immediately, through the same shell as every other email.

    NOT queued, deliberately, and this is the one exception to the ledger. Queuing would
    put the reset token in a database column, where a dump would hand over live tokens
    until they expire; and the person is sitting on the "check your email" screen, so a
    two-second worker poll is worse for them than a direct send.

    Undeliverable addresses are refused here as they are at queue time — a reserved
    domain cannot receive a reset any more than it can receive a receipt.
    """
    if is_undeliverable(user.email):
        logger.info("skipping password reset to reserved address")
        return False

    context = {
        "site_url": settings.FRONTEND_BASE_URL.rstrip("/"),
        "support_email": settings.SUPPORT_EMAIL,
        "reset_url": "%s/auth/reset-password?uid=%s&token=%s"
        % (settings.FRONTEND_BASE_URL.rstrip("/"), uid, token),
    }
    subject, html_template, text_template = TEMPLATES["password-reset"]
    try:
        message = EmailMultiAlternatives(
            subject,
            render_to_string(text_template, context).strip() + "\n",
            settings.DEFAULT_FROM_EMAIL,
            [user.email],
            reply_to=[settings.SUPPORT_EMAIL],
        )
        message.attach_alternative(render_to_string(html_template, context), "text/html")
        message.send()
    except Exception:
        # Logged, not raised. The view must answer the same way whether or not the
        # address exists, or the response becomes an account-enumeration oracle.
        logger.exception("password reset email failed")
        return False
    return True


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
    """Everything the templates render, resolved here rather than in the markup.

    Money is formatted by `common.currency.format_minor`, never by a template: the
    order-confirmation email used to print `{{ order.total_minor }} {{ order.currency }}
    (minor units)`, so a customer who paid $14.99 read "1499 USD (minor units)".
    """
    from apps.common.currency import format_minor

    order = notification.order if notification.order_id else None
    context = {
        "order_number": order.order_number if order else "",
        "recipient": notification.recipient,
        "order": order,
        "site_url": settings.FRONTEND_BASE_URL.rstrip("/"),
        "support_email": settings.SUPPORT_EMAIL,
    }

    if order:
        context["total_paid"] = format_minor(order.total_minor, order.currency)
        context["items"] = [
            {
                "product_name": item.product_name,
                "country_name": item.country_name,
                # `unit_amount_minor`, and nothing else: an OrderItem carries neither
                # `total_minor` nor `quantity` — it is one row per unit. Assuming either
                # raised AttributeError inside `_deliver`, and the retry ledger recorded
                # that as a failed notification rather than surfacing a crash, so the
                # eSIM email simply stopped arriving. Caught by the provisioning test,
                # not by anything that reads this file.
                "line_total": format_minor(item.unit_amount_minor, order.currency),
            }
            for item in order.items.all()
        ]

    profile = notification.esim_profile if notification.esim_profile_id else None
    if profile:
        context["esim"] = profile
        item = profile.order_item
        if item:
            context["plan_name"] = item.product_name
            context["country_name"] = item.country_name
            if item.data_limit_mb:
                gb = item.data_limit_mb / 1024
                context["data_label"] = (
                    f"{gb:.0f} GB" if gb >= 1 else f"{item.data_limit_mb} MB"
                )
            if item.validity_days:
                context["validity_label"] = f"{item.validity_days} days"
        context.update(_credentials(profile))

    return context


def _credentials(profile):
    """The activation string and QR URL, or nothing at all if they cannot be read.

    Decryption failing must not take the whole email down with it: a message that
    arrives without the QR still tells the customer their eSIM is ready and points them
    at the lookup page, whereas an exception here marks the notification failed and they
    hear nothing.
    """
    if not getattr(settings, "EMAIL_INCLUDE_ACTIVATION", True):
        return {}
    try:
        from apps.esims import services as esim_services

        creds = esim_services.decrypt_credentials(profile) or {}
    except Exception:
        logger.exception("could not decrypt credentials for profile %s", profile.pk)
        return {}
    return {
        "activation_code": creds.get("activation_code"),
        "qr_code_url": creds.get("qr_code_url"),
    }
