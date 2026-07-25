from django.db import models
from django.db.models import Q

from apps.common.models import TimestampedModel, UUIDModel

PAYMENT_STATUSES = (
    "pending",
    "processing",
    "succeeded",
    "failed",
    "cancelled",
    "refunded",
    "partially_refunded",
)
WEBHOOK_STATUSES = ("received", "processing", "processed", "failed", "rejected")


class Payment(UUIDModel, TimestampedModel):
    order = models.ForeignKey(
        "orders.Order", on_delete=models.PROTECT, related_name="payments"
    )
    provider = models.CharField(max_length=30)
    provider_payment_id = models.CharField(max_length=255, null=True, blank=True)
    provider_checkout_session_id = models.CharField(max_length=255, null=True, blank=True)
    idempotency_key = models.CharField(max_length=255, unique=True)
    amount_minor = models.BigIntegerField()
    currency = models.CharField(max_length=3)
    status = models.CharField(max_length=30)
    failure_code = models.CharField(max_length=120, null=True, blank=True)
    failure_message = models.TextField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "payments"
        constraints = [
            models.CheckConstraint(
                name="payment_amount_positive", condition=Q(amount_minor__gt=0)
            ),
            models.CheckConstraint(
                name="payment_status_valid", condition=Q(status__in=PAYMENT_STATUSES)
            ),
            models.UniqueConstraint(
                fields=["provider", "provider_payment_id"],
                condition=Q(provider_payment_id__isnull=False),
                name="unique_provider_payment_id",
            ),
            models.UniqueConstraint(
                fields=["provider", "provider_checkout_session_id"],
                condition=Q(provider_checkout_session_id__isnull=False),
                name="unique_provider_checkout_session_id",
            ),
        ]
        indexes = [models.Index(fields=["order", "status"])]


class WebhookEvent(UUIDModel, TimestampedModel):
    provider = models.CharField(max_length=30)
    external_event_id = models.CharField(max_length=255)
    event_type = models.CharField(max_length=120)
    payload_redacted = models.JSONField(default=dict)
    signature_valid = models.BooleanField()
    status = models.CharField(max_length=20)
    attempt_count = models.IntegerField(default=0)
    next_attempt_at = models.DateTimeField(null=True, blank=True)
    last_error = models.TextField(null=True, blank=True)
    received_at = models.DateTimeField()
    processed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "webhook_events"
        constraints = [
            models.UniqueConstraint(
                fields=["provider", "external_event_id"], name="unique_provider_event"
            ),
            models.CheckConstraint(
                name="webhook_status_valid", condition=Q(status__in=WEBHOOK_STATUSES)
            ),
        ]
        indexes = [models.Index(fields=["status", "next_attempt_at"])]


REFUND_STATUSES = ("pending", "processing", "succeeded", "failed", "cancelled")


class Refund(UUIDModel, TimestampedModel):
    payment = models.ForeignKey(Payment, on_delete=models.PROTECT, related_name="refunds")
    provider = models.CharField(max_length=30)
    provider_refund_id = models.CharField(max_length=255, null=True, blank=True)
    idempotency_key = models.CharField(max_length=255, unique=True)
    amount_minor = models.BigIntegerField()
    currency = models.CharField(max_length=3)
    reason = models.TextField(null=True, blank=True)
    status = models.CharField(max_length=20)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "refunds"
        constraints = [
            models.CheckConstraint(
                name="refund_amount_positive", condition=Q(amount_minor__gt=0)
            ),
            models.CheckConstraint(
                name="refund_status_valid", condition=Q(status__in=REFUND_STATUSES)
            ),
            models.UniqueConstraint(
                fields=["provider", "provider_refund_id"],
                condition=Q(provider_refund_id__isnull=False),
                name="unique_provider_refund_id",
            ),
        ]


class RefundItem(UUIDModel, TimestampedModel):
    refund = models.ForeignKey(Refund, on_delete=models.PROTECT, related_name="items")
    order_item = models.ForeignKey(
        "orders.OrderItem", on_delete=models.PROTECT, related_name="refund_items"
    )
    amount_minor = models.BigIntegerField()

    class Meta:
        db_table = "refund_items"
        constraints = [
            models.UniqueConstraint(
                fields=["refund", "order_item"], name="unique_refund_order_item"
            ),
            models.CheckConstraint(
                name="refund_item_amount_positive", condition=Q(amount_minor__gt=0)
            ),
        ]
