from rest_framework import serializers

from .models import Cart, CartItem, Order, OrderItem


class CartItemSerializer(serializers.ModelSerializer):
    product_code = serializers.CharField(source="catalog_plan.product_code", read_only=True)
    display_name = serializers.CharField(source="catalog_plan.display_name", read_only=True)
    plan_type = serializers.CharField(source="catalog_plan.plan_type", read_only=True)
    unit_amount_minor = serializers.IntegerField(
        source="catalog_plan.retail_amount_minor", read_only=True
    )
    currency = serializers.CharField(source="catalog_plan.currency", read_only=True)
    line_total_minor = serializers.SerializerMethodField()

    class Meta:
        model = CartItem
        fields = (
            "id",
            "product_code",
            "display_name",
            "plan_type",
            "quantity",
            "unit_amount_minor",
            "currency",
            "line_total_minor",
        )

    def get_line_total_minor(self, obj):
        return obj.catalog_plan.retail_amount_minor * obj.quantity


class CartSerializer(serializers.ModelSerializer):
    items = CartItemSerializer(many=True, read_only=True)
    subtotal_minor = serializers.SerializerMethodField()
    item_count = serializers.SerializerMethodField()

    class Meta:
        model = Cart
        fields = ("id", "currency", "status", "items", "subtotal_minor", "item_count")

    def get_subtotal_minor(self, obj):
        return sum(i.catalog_plan.retail_amount_minor * i.quantity for i in obj.items.all())

    def get_item_count(self, obj):
        return sum(i.quantity for i in obj.items.all())


class AddItemSerializer(serializers.Serializer):
    product_code = serializers.CharField()
    quantity = serializers.IntegerField(default=1, min_value=1, max_value=1000)


class UpdateItemSerializer(serializers.Serializer):
    quantity = serializers.IntegerField(min_value=1, max_value=1000)


class PromoInputSerializer(serializers.Serializer):
    code = serializers.CharField()
    customer_email = serializers.EmailField(required=False)


class CheckoutSerializer(serializers.Serializer):
    customer_email = serializers.EmailField(required=False)
    promo_code = serializers.CharField(required=False, allow_blank=True)


class DirectCheckoutItemSerializer(serializers.Serializer):
    product_code = serializers.CharField()
    quantity = serializers.IntegerField(min_value=1, default=1)


class DirectCheckoutSerializer(serializers.Serializer):
    """Buy without a cart.

    Only identifies WHAT is being bought — never what it costs. Prices are read from the
    catalogue server-side, so a tampered client can change the product, never the price.
    """

    items = DirectCheckoutItemSerializer(many=True, allow_empty=False)
    customer_email = serializers.EmailField(required=False)
    promo_code = serializers.CharField(required=False, allow_blank=True)
    currency = serializers.CharField(required=False, allow_blank=True, max_length=3)


class OrderLookupSerializer(serializers.Serializer):
    order_number = serializers.CharField()
    email = serializers.EmailField()


class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = (
            "id",
            "item_type",
            "product_code",
            "product_name",
            "country_iso2",
            "country_name",
            "plan_type",
            "data_limit_mb",
            "daily_high_speed_mb",
            "validity_days",
            "traffic_policy",
            "network_names",
            "unit_amount_minor",
            "currency",
            "status",
        )


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = (
            "id",
            "order_number",
            "customer_email",
            "currency",
            "subtotal_minor",
            "discount_minor",
            "tax_minor",
            "total_minor",
            "status",
            "payment_status",
            "fulfillment_status",
            "placed_at",
            "promo_code_snapshot",
            "items",
        )
