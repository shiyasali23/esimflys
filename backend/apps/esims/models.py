from django.db import models
from django.db.models import F, Q

from apps.common.models import TimestampedModel, UUIDModel

ESIM_STATUSES = (
    "pending",
    "provisioning",
    "ready",
    "installed",
    "active",
    "expired",
    "failed",
    "cancelled",
    "manual_review",
)
SUPPLIER_EVENT_STATUSES = (
    "pending",
    "processing",
    "retrying",
    "succeeded",
    "failed",
    "cancelled",
    "manual_review",
)


class EsimProfile(UUIDModel, TimestampedModel):
    order_item = models.OneToOneField(
        "orders.OrderItem", on_delete=models.PROTECT, related_name="esim_profile"
    )
    supplier = models.ForeignKey(
        "catalog.Supplier", on_delete=models.PROTECT, related_name="esim_profiles"
    )
    supplier_reference = models.CharField(max_length=255, null=True, blank=True)
    status = models.CharField(max_length=30, default="pending")
    iccid_encrypted = models.BinaryField(null=True, blank=True)
    iccid_hash = models.BinaryField(max_length=32, null=True, blank=True, unique=True)
    iccid_last4 = models.CharField(max_length=4, null=True, blank=True)
    smdp_address_encrypted = models.BinaryField(null=True, blank=True)
    activation_code_encrypted = models.BinaryField(null=True, blank=True)
    qr_payload_encrypted = models.BinaryField(null=True, blank=True)
    encryption_key_version = models.IntegerField(null=True, blank=True)
    total_data_bytes = models.BigIntegerField(null=True, blank=True)
    remaining_data_bytes = models.BigIntegerField(null=True, blank=True)
    installed_at = models.DateTimeField(null=True, blank=True)
    activated_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    last_synced_at = models.DateTimeField(null=True, blank=True)
    supplier_payload_redacted = models.JSONField(default=dict)

    class Meta:
        db_table = "esim_profiles"
        constraints = [
            models.CheckConstraint(
                name="esim_status_valid", condition=Q(status__in=ESIM_STATUSES)
            ),
            models.CheckConstraint(
                name="esim_remaining_nonneg",
                condition=Q(remaining_data_bytes__isnull=True)
                | Q(remaining_data_bytes__gte=0),
            ),
            models.CheckConstraint(
                name="esim_remaining_le_total",
                condition=Q(remaining_data_bytes__isnull=True)
                | Q(total_data_bytes__isnull=True)
                | Q(remaining_data_bytes__lte=F("total_data_bytes")),
            ),
            models.UniqueConstraint(
                fields=["supplier", "supplier_reference"],
                condition=Q(supplier_reference__isnull=False),
                name="unique_supplier_reference",
            ),
        ]


class SupplierEvent(UUIDModel, TimestampedModel):
    supplier = models.ForeignKey(
        "catalog.Supplier", on_delete=models.PROTECT, related_name="events"
    )
    order_item = models.ForeignKey(
        "orders.OrderItem", on_delete=models.PROTECT, null=True, blank=True,
        related_name="supplier_events",
    )
    esim_profile = models.ForeignKey(
        EsimProfile, on_delete=models.PROTECT, null=True, blank=True,
        related_name="supplier_events",
    )
    event_type = models.CharField(max_length=60)
    idempotency_key = models.CharField(max_length=255, unique=True)
    correlation_id = models.UUIDField()
    supplier_reference = models.CharField(max_length=255, null=True, blank=True)
    status = models.CharField(max_length=30, default="pending")
    attempt_count = models.IntegerField(default=0)
    next_attempt_at = models.DateTimeField(null=True, blank=True)
    locked_at = models.DateTimeField(null=True, blank=True)
    request_data_redacted = models.JSONField(null=True, blank=True)
    response_data_redacted = models.JSONField(null=True, blank=True)
    error_code = models.CharField(max_length=120, null=True, blank=True)
    error_message = models.TextField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "supplier_events"
        constraints = [
            models.CheckConstraint(
                name="supplier_event_status_valid",
                condition=Q(status__in=SUPPLIER_EVENT_STATUSES),
            ),
        ]
        indexes = [models.Index(fields=["status", "next_attempt_at"])]


TOPUP_FULFILLMENT_STATUSES = (
    "pending",
    "processing",
    "completed",
    "failed",
    "cancelled",
    "refunded",
)


class TopupFulfillment(UUIDModel, TimestampedModel):
    order_item = models.OneToOneField(
        "orders.OrderItem", on_delete=models.PROTECT, related_name="topup_fulfillment"
    )
    esim_profile = models.ForeignKey(
        EsimProfile, on_delete=models.PROTECT, related_name="topup_fulfillments"
    )
    topup_product = models.ForeignKey(
        "catalog.TopupProduct", on_delete=models.PROTECT, related_name="fulfillments"
    )
    supplier_reference = models.CharField(max_length=255, null=True, blank=True)
    status = models.CharField(max_length=30, default="pending")
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "topup_fulfillments"
        constraints = [
            models.CheckConstraint(
                name="topup_fulfillment_status_valid",
                condition=Q(status__in=TOPUP_FULFILLMENT_STATUSES),
            ),
        ]
