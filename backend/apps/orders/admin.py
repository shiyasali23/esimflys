from django.contrib import admin

from .models import (
    Cart,
    CartItem,
    Notification,
    Order,
    OrderItem,
    PromoCode,
    PromoRedemption,
)


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    can_delete = False
    fields = ("product_code", "product_name", "unit_amount_minor", "currency", "status")
    readonly_fields = fields


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = (
        "order_number",
        "customer_email",
        "total_minor",
        "currency",
        "status",
        "payment_status",
        "fulfillment_status",
        "placed_at",
    )
    list_filter = ("status", "payment_status", "fulfillment_status", "currency")
    search_fields = ("order_number", "customer_email")
    date_hierarchy = "placed_at"
    inlines = [OrderItemInline]


@admin.register(PromoCode)
class PromoCodeAdmin(admin.ModelAdmin):
    list_display = (
        "code",
        "discount_type",
        "discount_value",
        "organization",
        "is_active",
        "usage_limit",
        "ends_at",
    )
    list_filter = ("discount_type", "is_active")
    search_fields = ("code",)


@admin.register(PromoRedemption)
class PromoRedemptionAdmin(admin.ModelAdmin):
    list_display = ("promo_code", "order", "status", "reserved_at", "consumed_at")
    list_filter = ("status",)


class CartItemInline(admin.TabularInline):
    model = CartItem
    extra = 0


@admin.register(Cart)
class CartAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "status", "currency", "created_at")
    list_filter = ("status", "currency")
    inlines = [CartItemInline]


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = (
        "template_code",
        "recipient",
        "channel",
        "status",
        "attempt_count",
        "sent_at",
    )
    list_filter = ("status", "channel", "template_code")
    search_fields = ("recipient", "idempotency_key", "order__order_number")
