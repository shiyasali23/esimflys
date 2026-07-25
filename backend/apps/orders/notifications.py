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


def queue_notification(*, template_code, recipient, idempotency_key, user=None, order=None, esim_profile=None):
    notification, _ = Notification.objects.get_or_create(
        idempotency_key=idempotency_key,
        defaults={
            "template_code": template_code,
            "recipient": recipient,
            "user": user,
            "order": order,
            "esim_profile": esim_profile,
            "channel": "email",
            "status": "queued",
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
