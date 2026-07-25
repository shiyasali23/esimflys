import secrets

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.accounts.services import create_commission_for_order, reverse_commission_for_order
from apps.common.exceptions import Conflict, PaymentMismatch, RefundLimitExceeded
from apps.esims.services import enqueue_provisioning_for_order
from apps.orders.models import Order, OrderItem
from apps.orders.notifications import queue_notification
from apps.orders.services import consume_promo_for_order, release_promo_for_order

from . import stripe as gateway_module
from .models import Payment, Refund, RefundItem, WebhookEvent


def create_payment_intent_for_order(order):
    if order.payment_status == "paid":
        raise Conflict(
            message="This order has already been paid.",
            error_code="payment_already_completed",
        )
    if order.status != "pending_payment":
        raise Conflict(message="This order is not awaiting payment.")

    if order.total_minor == 0:
        with transaction.atomic():
            _complete_zero_total(order.id)
        return {"zero_total": True, "client_secret": None, "payment_status": "paid"}

    idempotency_key = f"pi:{order.id}"
    gateway = gateway_module.get_gateway()
    intent = gateway.create_payment_intent(
        amount_minor=order.total_minor,
        currency=order.currency,
        metadata={"order_id": str(order.id), "order_number": order.order_number},
        idempotency_key=idempotency_key,
    )
    payment, _ = Payment.objects.get_or_create(
        idempotency_key=idempotency_key,
        defaults={
            "order": order,
            "provider": "stripe",
            "provider_payment_id": intent["id"],
            "amount_minor": order.total_minor,
            "currency": order.currency,
            "status": "processing",
        },
    )
    return {
        "client_secret": intent["client_secret"],
        "payment_id": str(payment.id),
        "amount_minor": order.total_minor,
        "currency": order.currency,
    }


def handle_webhook_event(payload_bytes, sig_header):
    gateway = gateway_module.get_gateway()
    try:
        event = gateway.construct_event(payload_bytes, sig_header)
    except gateway_module.SignatureVerificationError:
        WebhookEvent.objects.create(
            provider="stripe",
            external_event_id="unverified-" + secrets.token_hex(12),
            event_type="unknown",
            payload_redacted={},
            signature_valid=False,
            status="rejected",
            received_at=timezone.now(),
        )
        return {"ok": False, "status": 400}

    event_id = event["id"]
    event_type = event["type"]
    webhook, created = WebhookEvent.objects.get_or_create(
        provider="stripe",
        external_event_id=event_id,
        defaults={
            "event_type": event_type,
            "payload_redacted": _redact(event),
            "signature_valid": True,
            "status": "received",
            "received_at": timezone.now(),
        },
    )
    if not created and webhook.status == "processed":
        return {"ok": True, "status": 200}

    try:
        with transaction.atomic():
            _dispatch(event_type, event)
    except PaymentMismatch as exc:
        webhook.status = "failed"
        webhook.last_error = str(exc.message)
        webhook.attempt_count += 1
        webhook.save(update_fields=["status", "last_error", "attempt_count", "updated_at"])
        return {"ok": False, "status": 409}

    webhook.status = "processed"
    webhook.processed_at = timezone.now()
    webhook.save(update_fields=["status", "processed_at", "updated_at"])
    return {"ok": True, "status": 200}


def _dispatch(event_type, event):
    obj = event["data"]["object"]
    if event_type == "payment_intent.succeeded":
        _handle_succeeded(obj)
    elif event_type == "payment_intent.payment_failed":
        _handle_failed(obj)


def _handle_succeeded(intent):
    payment = (
        Payment.objects.select_for_update()
        .filter(provider="stripe", provider_payment_id=intent["id"])
        .first()
    )
    if payment is None:
        raise PaymentMismatch(message="No local payment matches this intent.")

    order = Order.objects.select_for_update().get(pk=payment.order_id)

    metadata = intent.get("metadata") or {}
    reconciled = (
        int(intent["amount"]) == payment.amount_minor
        and str(intent["currency"]).upper() == order.currency
        and metadata.get("order_id") == str(order.id)
    )
    if not reconciled:
        payment.status = "failed"
        payment.failure_code = "reconciliation_mismatch"
        payment.save(update_fields=["status", "failure_code", "updated_at"])
        raise PaymentMismatch()

    if order.payment_status == "paid":
        if payment.status != "succeeded":
            payment.status = "succeeded"
            payment.paid_at = payment.paid_at or timezone.now()
            payment.save(update_fields=["status", "paid_at", "updated_at"])
        return

    payment.status = "succeeded"
    payment.paid_at = timezone.now()
    payment.save(update_fields=["status", "paid_at", "updated_at"])

    order.payment_status = "paid"
    order.status = "paid"
    order.save(update_fields=["payment_status", "status", "updated_at"])
    consume_promo_for_order(order)
    create_commission_for_order(order)
    enqueue_provisioning_for_order(order)
    queue_notification(
        template_code="order-confirmation",
        recipient=order.customer_email,
        idempotency_key=f"notify:order-confirmation:{order.id}",
        user=order.user,
        order=order,
    )


def _handle_failed(intent):
    payment = (
        Payment.objects.select_for_update()
        .filter(provider="stripe", provider_payment_id=intent["id"])
        .first()
    )
    if payment is None:
        return
    order = Order.objects.select_for_update().get(pk=payment.order_id)
    if order.payment_status == "paid":
        return
    payment.status = "failed"
    payment.failure_code = (intent.get("last_payment_error") or {}).get("code") or "payment_failed"
    payment.save(update_fields=["status", "failure_code", "updated_at"])
    order.payment_status = "failed"
    order.save(update_fields=["payment_status", "updated_at"])
    release_promo_for_order(order)


def _complete_zero_total(order_id):
    order = Order.objects.select_for_update().get(pk=order_id)
    if order.payment_status == "paid":
        return
    order.payment_status = "paid"
    order.status = "paid"
    order.metadata = {**(order.metadata or {}), "zero_total": True}
    order.save(update_fields=["payment_status", "status", "metadata", "updated_at"])
    consume_promo_for_order(order)
    create_commission_for_order(order)
    enqueue_provisioning_for_order(order)
    queue_notification(
        template_code="order-confirmation",
        recipient=order.customer_email,
        idempotency_key=f"notify:order-confirmation:{order.id}",
        user=order.user,
        order=order,
    )


def _redact(event):
    obj = (event.get("data") or {}).get("object") or {}
    return {
        "id": event.get("id"),
        "type": event.get("type"),
        "object_id": obj.get("id"),
        "amount": obj.get("amount"),
        "currency": obj.get("currency"),
    }


def create_refund(*, payment, allocations, reason=None):
    with transaction.atomic():
        payment = Payment.objects.select_for_update().get(pk=payment.pk)
        order = Order.objects.select_for_update().get(pk=payment.order_id)
        total = sum(int(a["amount_minor"]) for a in allocations)
        if total <= 0:
            raise Conflict(message="Refund amount must be positive.")

        prior = (
            Refund.objects.filter(
                payment=payment, status__in=["pending", "processing", "succeeded"]
            ).aggregate(s=Sum("amount_minor"))["s"]
            or 0
        )
        if prior + total > payment.amount_minor:
            raise RefundLimitExceeded()

        for alloc in allocations:
            item = OrderItem.objects.filter(pk=alloc["order_item_id"], order=order).first()
            if item is None:
                raise Conflict(
                    message="Order item does not belong to this order.",
                    error_code="not_found",
                    status_code=404,
                )
            item_prior = (
                RefundItem.objects.filter(
                    order_item=item,
                    refund__status__in=["pending", "processing", "succeeded"],
                ).aggregate(s=Sum("amount_minor"))["s"]
                or 0
            )
            if item_prior + int(alloc["amount_minor"]) > item.unit_amount_minor:
                raise RefundLimitExceeded()

        idempotency_key = f"refund:{payment.id}:{secrets.token_hex(8)}"
        refund = Refund.objects.create(
            payment=payment,
            provider="stripe",
            idempotency_key=idempotency_key,
            amount_minor=total,
            currency=order.currency,
            reason=reason,
            status="pending",
        )
        for alloc in allocations:
            RefundItem.objects.create(
                refund=refund,
                order_item_id=alloc["order_item_id"],
                amount_minor=int(alloc["amount_minor"]),
            )

        result = gateway_module.get_gateway().create_refund(
            payment_intent_id=payment.provider_payment_id,
            amount_minor=total,
            idempotency_key=idempotency_key,
        )
        refund.provider_refund_id = result["id"]
        if result["status"] == "succeeded":
            refund.status = "succeeded"
            refund.completed_at = timezone.now()
        else:
            refund.status = "processing"
        refund.save(
            update_fields=["provider_refund_id", "status", "completed_at", "updated_at"]
        )

        if refund.status == "succeeded":
            _apply_successful_refund(payment, order, total)
            queue_notification(
                template_code="refund-confirmation",
                recipient=order.customer_email,
                idempotency_key=f"notify:refund-confirmation:{refund.id}",
                user=order.user,
                order=order,
            )
        return refund


def _apply_successful_refund(payment, order, refunded_minor):
    total_refunded = (
        Refund.objects.filter(payment=payment, status="succeeded").aggregate(
            s=Sum("amount_minor")
        )["s"]
        or 0
    )
    if total_refunded >= payment.amount_minor:
        payment.status = "refunded"
        order.payment_status = "refunded"
        order.status = "refunded"
    else:
        payment.status = "partially_refunded"
        order.payment_status = "partially_refunded"
        order.status = "partially_refunded"
    payment.save(update_fields=["status", "updated_at"])
    order.save(update_fields=["payment_status", "status", "updated_at"])
    reverse_commission_for_order(order, refunded_minor)
