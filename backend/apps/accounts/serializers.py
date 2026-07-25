from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import CommissionPayout, Organization, PartnerCommission

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "first_name",
            "last_name",
            "preferred_currency",
            "email_verified_at",
        )
        read_only_fields = ("id", "email", "email_verified_at")


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    first_name = serializers.CharField(required=False, allow_blank=True, default="")
    last_name = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value

    def validate_password(self, value):
        validate_password(value)
        return value


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)


class PasswordResetSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True)

    def validate_new_password(self, value):
        validate_password(value)
        return value


class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ("id", "name", "organization_type", "status", "billing_email")


class PartnerCommissionSerializer(serializers.ModelSerializer):
    order_number = serializers.CharField(source="order.order_number", read_only=True)

    class Meta:
        model = PartnerCommission
        fields = (
            "id",
            "order_number",
            "commission_type",
            "commission_value_snapshot",
            "commissionable_minor",
            "commission_minor",
            "reversed_minor",
            "currency",
            "status",
            "approved_at",
            "paid_at",
            "created_at",
        )


class CommissionPayoutSerializer(serializers.ModelSerializer):
    class Meta:
        model = CommissionPayout
        fields = (
            "id",
            "currency",
            "amount_minor",
            "status",
            "period_start",
            "period_end",
            "paid_at",
            "created_at",
        )
