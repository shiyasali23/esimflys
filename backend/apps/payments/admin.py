from django.contrib import admin

from .models import Payment, Refund, RefundItem, WebhookEvent


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ("id", "order", "provider", "amount_minor", "currency", "status", "paid_at")
    list_filter = ("provider", "status", "currency")
    search_fields = ("provider_payment_id", "idempotency_key", "order__order_number")
    readonly_fields = (
        "order",
        "provider",
        "provider_payment_id",
        "provider_checkout_session_id",
        "idempotency_key",
        "amount_minor",
        "currency",
    )


@admin.register(WebhookEvent)
class WebhookEventAdmin(admin.ModelAdmin):
    list_display = (
        "provider",
        "external_event_id",
        "event_type",
        "signature_valid",
        "status",
        "received_at",
        "processed_at",
    )
    list_filter = ("provider", "status", "signature_valid")
    search_fields = ("external_event_id", "event_type")


class RefundItemInline(admin.TabularInline):
    model = RefundItem
    extra = 0


@admin.register(Refund)
class RefundAdmin(admin.ModelAdmin):
    list_display = ("id", "payment", "amount_minor", "currency", "status", "completed_at")
    list_filter = ("status", "provider", "currency")
    search_fields = ("provider_refund_id", "idempotency_key", "payment__order__order_number")
    inlines = [RefundItemInline]
