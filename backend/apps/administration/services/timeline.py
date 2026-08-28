"""One order's whole life, in order, from the five tables that record pieces of it.

Support's first question is always "what happened to this order", and answering it meant
opening five screens and reconciling timestamps by eye: the order row, its payments, the
supplier jobs that provisioned it, the eSIM profile, and the notifications that were
supposed to tell the customer. Every timestamp already existed. None of them were ever
shown together, so the shape of a failure — paid at 12:04, provisioned at 12:04, email
failed at 12:04 and never retried — was invisible.

Read-only and assembled per request. There is no timeline table and there should not be:
these rows are the source of truth for their own domains, and a denormalised copy would
be one more thing to keep honest.

NOTHING HERE IS A SECRET. Activation codes, QR payloads and ICCIDs are deliberately
absent — revealing those is a separately permissioned, audited, rate-limited action, and
a debugging view must not become the back door around it.
"""

from apps.esims.models import EsimProfile, SupplierEvent
from apps.orders.models import Notification
from apps.payments.models import Payment, Refund


def _entry(at, kind, label, detail=None, status=None):
    return {"at": at, "kind": kind, "label": label, "detail": detail, "status": status}


def order_timeline(order):
    """Return every recorded event for ``order``, oldest first.

    Entries with no timestamp are dropped rather than sorted to the front: a NULL
    `paid_at` means it never happened, and showing it at the beginning of the story
    would read as though it happened first.
    """
    entries = [
        _entry(order.created_at, "order", "Order placed", order.order_number),
    ]
    if order.placed_at and order.placed_at != order.created_at:
        entries.append(_entry(order.placed_at, "order", "Order confirmed"))

    if order.promo_code_snapshot:
        entries.append(
            _entry(
                order.created_at,
                "promo",
                f"Promo code {order.promo_code_snapshot} applied",
                f"Discount {order.discount_minor / 100:.2f} {order.currency}"
                if order.discount_minor
                else "Attribution only — no discount",
            )
        )

    for payment in order.payments.all():
        entries.append(
            _entry(
                payment.created_at,
                "payment",
                "Payment started",
                f"{payment.amount_minor / 100:.2f} {payment.currency} via {payment.provider}",
                payment.status,
            )
        )
        if payment.paid_at:
            entries.append(_entry(payment.paid_at, "payment", "Payment settled", None, "succeeded"))
        if payment.failure_message:
            entries.append(
                _entry(
                    payment.updated_at,
                    "payment",
                    "Payment failed",
                    payment.failure_message,
                    payment.status,
                )
            )

    for refund in Refund.objects.filter(payment__order=order):
        entries.append(
            _entry(
                refund.completed_at or refund.created_at,
                "refund",
                "Refund issued",
                f"{refund.amount_minor / 100:.2f} {refund.currency}"
                + (f" — {refund.reason}" if refund.reason else ""),
                refund.status,
            )
        )

    for event in SupplierEvent.objects.filter(order_item__order=order).order_by("created_at"):
        entries.append(
            _entry(
                event.created_at,
                "supplier",
                f"Supplier job {event.event_type}",
                f"attempt {event.attempt_count}",
                event.status,
            )
        )
        if event.error_message:
            entries.append(
                _entry(
                    event.updated_at,
                    "supplier",
                    "Supplier job failed",
                    f"{event.error_code or ''} {event.error_message}".strip(),
                    event.status,
                )
            )
        if event.completed_at:
            entries.append(
                _entry(event.completed_at, "supplier", "Supplier job completed", None, event.status)
            )

    for profile in EsimProfile.objects.filter(order_item__order=order):
        entries.append(_entry(profile.created_at, "esim", "eSIM record created", None, profile.status))
        if profile.installed_at:
            entries.append(_entry(profile.installed_at, "esim", "Installed on a device", None, "installed"))
        if profile.activated_at:
            entries.append(_entry(profile.activated_at, "esim", "Activated", None, "active"))
        if profile.expires_at:
            entries.append(_entry(profile.expires_at, "esim", "Plan expires", None, None))

    for note in Notification.objects.filter(order=order).order_by("created_at"):
        entries.append(
            _entry(note.created_at, "email", f"{note.template_code} queued", note.recipient, note.status)
        )
        if note.sent_at:
            entries.append(_entry(note.sent_at, "email", f"{note.template_code} sent", note.recipient, "sent"))
        if note.failure_message:
            entries.append(
                _entry(
                    note.updated_at,
                    "email",
                    f"{note.template_code} failed",
                    f"{note.failure_message} (attempt {note.attempt_count})",
                    note.status,
                )
            )

    return sorted([e for e in entries if e["at"]], key=lambda e: e["at"])
