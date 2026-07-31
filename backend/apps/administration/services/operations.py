"""Operational recovery actions for stuck background work.

Retrying a supplier job **reuses the original idempotency key** — the row is simply made
claimable again. That is what makes a retry safe: if the supplier already provisioned the
eSIM on the failed attempt, it returns the same result rather than provisioning (and
charging for) a second one.
"""

from django.db import transaction

from apps.administration.audit import record_audit
from apps.common.exceptions import Conflict
from apps.esims.models import SupplierEvent
from apps.orders.models import Notification

#: States from which a retry makes sense. A succeeded job must never be re-run.
RETRYABLE_SUPPLIER_STATES = ("failed", "manual_review", "retrying")
RETRYABLE_NOTIFICATION_STATES = ("failed", "retrying")


def retry_supplier_event(event, *, actor=None, request=None):
    """Make a stalled supplier job claimable again by the worker."""
    with transaction.atomic():
        event = SupplierEvent.objects.select_for_update().get(pk=event.pk)
        if event.status not in RETRYABLE_SUPPLIER_STATES:
            raise Conflict(
                message=f"A job in state '{event.status}' cannot be retried."
            )
        previous = event.status
        event.status = "pending"
        event.next_attempt_at = None
        event.locked_at = None
        event.save(update_fields=["status", "next_attempt_at", "locked_at", "updated_at"])
        record_audit(
            action="supplier_event.retried",
            actor=actor,
            obj=event,
            changes={"status": [previous, "pending"]},
            # Recorded so an operator can prove the retry reused the original key.
            context={"idempotency_key_reused": True, "attempt_count": event.attempt_count},
            request=request,
        )
        return event


def retry_notification(notification, *, actor=None, request=None):
    """Requeue a failed notification. Delivery stays idempotent via its stored key."""
    with transaction.atomic():
        notification = Notification.objects.select_for_update().get(pk=notification.pk)
        if notification.status not in RETRYABLE_NOTIFICATION_STATES:
            raise Conflict(
                message=f"A notification in state '{notification.status}' cannot be retried."
            )
        previous = notification.status
        notification.status = "queued"
        notification.next_attempt_at = None
        notification.save(update_fields=["status", "next_attempt_at", "updated_at"])
        record_audit(
            action="notification.retried",
            actor=actor,
            obj=notification,
            changes={"status": [previous, "queued"]},
            request=request,
        )
        return notification
