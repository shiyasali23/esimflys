from decimal import ROUND_HALF_UP, Decimal

from rest_framework import serializers

from .models import CatalogPlan, Country


def _money(minor):
    if minor is None:
        return None
    dollars = (Decimal(minor) / Decimal(100)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return {"amount": str(dollars), "currency": "USD"}


class CountrySlimSerializer(serializers.ModelSerializer):
    class Meta:
        model = Country
        fields = ("iso2", "name", "slug", "flag_emoji")


class CountrySerializer(serializers.ModelSerializer):
    price_from = serializers.SerializerMethodField()
    plan_count = serializers.SerializerMethodField()

    class Meta:
        model = Country
        fields = (
            "iso2",
            "name",
            "slug",
            "region",
            "flag_emoji",
            "timezone",
            "is_popular",
            "homepage_badge",
            "price_from",
            "plan_count",
        )

    def get_price_from(self, obj):
        return _money(getattr(obj, "price_from_minor", None))

    def get_plan_count(self, obj):
        return getattr(obj, "active_plan_count", 0)


class PlanSerializer(serializers.ModelSerializer):
    price_per_day = serializers.SerializerMethodField()

    class Meta:
        model = CatalogPlan
        fields = (
            "product_code",
            "plan_type",
            "display_name",
            "data_limit_mb",
            "daily_high_speed_mb",
            "day_count",
            "validity_days",
            "traffic_policy",
            "hotspot_supported",
            "network_names",
            "topup_supported",
            "retail_amount_minor",
            "currency",
            "price_per_day",
            "badge",
            "is_default_selected",
            "sort_order",
        )

    def get_price_per_day(self, obj):
        return _money(Decimal(obj.retail_amount_minor) / obj.validity_days)


class PlanDetailSerializer(PlanSerializer):
    country = CountrySlimSerializer(read_only=True)

    class Meta(PlanSerializer.Meta):
        fields = PlanSerializer.Meta.fields + ("country",)
