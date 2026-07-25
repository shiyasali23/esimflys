from rest_framework import serializers

from apps.catalog.models import TopupProduct

from . import services
from .models import EsimProfile, TopupFulfillment


class EsimProfileSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="order_item.product_name", read_only=True)
    country_iso2 = serializers.CharField(source="order_item.country_iso2", read_only=True)
    country_name = serializers.CharField(source="order_item.country_name", read_only=True)
    plan_type = serializers.CharField(source="order_item.plan_type", read_only=True)
    validity_days = serializers.IntegerField(source="order_item.validity_days", read_only=True)

    class Meta:
        model = EsimProfile
        fields = (
            "id",
            "status",
            "product_name",
            "country_iso2",
            "country_name",
            "plan_type",
            "validity_days",
            "iccid_last4",
            "total_data_bytes",
            "remaining_data_bytes",
            "installed_at",
            "activated_at",
            "expires_at",
            "last_synced_at",
        )


class EsimProfileDetailSerializer(EsimProfileSerializer):
    credentials = serializers.SerializerMethodField()

    class Meta(EsimProfileSerializer.Meta):
        fields = EsimProfileSerializer.Meta.fields + ("credentials",)

    def get_credentials(self, obj):
        return services.decrypt_credentials(obj)


class TopupProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = TopupProduct
        fields = (
            "product_code",
            "name",
            "data_amount_mb",
            "validity_days",
            "retail_amount_minor",
            "currency",
        )


class TopupFulfillmentSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="topup_product.name", read_only=True)

    class Meta:
        model = TopupFulfillment
        fields = ("id", "product_name", "status", "completed_at", "created_at")


class TopupCreateSerializer(serializers.Serializer):
    topup_product_code = serializers.CharField()
