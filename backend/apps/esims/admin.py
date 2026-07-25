from django.contrib import admin

from .models import EsimProfile, SupplierEvent, TopupFulfillment


@admin.register(EsimProfile)
class EsimProfileAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "order_item",
        "supplier",
        "status",
        "iccid_last4",
        "supplier_reference",
        "remaining_data_bytes",
        "total_data_bytes",
    )
    list_filter = ("status", "supplier")
    search_fields = ("supplier_reference", "iccid_last4", "order_item__product_code")
    fields = (
        "order_item",
        "supplier",
        "status",
        "supplier_reference",
        "iccid_last4",
        "encryption_key_version",
        "total_data_bytes",
        "remaining_data_bytes",
        "installed_at",
        "activated_at",
        "expires_at",
        "last_synced_at",
        "supplier_payload_redacted",
    )
    readonly_fields = fields


@admin.register(SupplierEvent)
class SupplierEventAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "event_type",
        "supplier",
        "status",
        "attempt_count",
        "next_attempt_at",
        "completed_at",
    )
    list_filter = ("status", "event_type", "supplier")
    search_fields = ("idempotency_key", "supplier_reference", "correlation_id")
    readonly_fields = ("idempotency_key", "correlation_id", "request_data_redacted", "response_data_redacted")


@admin.register(TopupFulfillment)
class TopupFulfillmentAdmin(admin.ModelAdmin):
    list_display = ("id", "order_item", "topup_product", "esim_profile", "status", "completed_at")
    list_filter = ("status",)
    search_fields = ("supplier_reference", "order_item__product_code")
