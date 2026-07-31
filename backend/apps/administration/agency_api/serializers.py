"""Serializers for the travel-agency panel.

**The governing rule (plan §8.2/§0):** every order an agency can see is a *referral* order
— a platform customer who happened to use the agency's tracking code. The agency is
therefore shown the commercial facts (order value, date, commission) and **never** the
customer's identity, the eSIM credentials, or the platform's wholesale cost.

Field lists are explicit for that reason. ``fields = "__all__"`` on any of these models
would leak `customer_email` the day someone adds a related field.
"""

from rest_framework import serializers

from apps.accounts.models import (
    CommissionPayout,
    MEMBER_ROLES,
    MEMBER_STATUSES,
    Organization,
    OrganizationMember,
    PartnerCommission,
)
from apps.administration.models import AuditEvent
from apps.orders.models import Order, PromoCode


class AgencyProfileSerializer(serializers.ModelSerializer):
    """The agency's own profile.

    Commission terms are read-only: they are a contract between the platform and the
    agency, so an agency editing its own rate would be a direct financial escalation.
    """

    class Meta:
        model = Organization
        fields = (
            "id", "name", "organization_type", "status", "billing_email",
            "support_email", "country",
            "default_commission_type", "default_commission_value", "commission_currency",
            "created_at",
        )
        read_only_fields = (
            "id", "organization_type", "status",
            "default_commission_type", "default_commission_value", "commission_currency",
            "created_at",
        )


class AgencyMemberSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source="user.email", read_only=True)
    first_name = serializers.CharField(source="user.first_name", read_only=True)
    last_name = serializers.CharField(source="user.last_name", read_only=True)

    class Meta:
        model = OrganizationMember
        fields = ("id", "email", "first_name", "last_name", "role", "status", "created_at")
        read_only_fields = ("id", "created_at")


class AgencyAddMemberSerializer(serializers.Serializer):
    email = serializers.EmailField()
    role = serializers.ChoiceField(choices=[(r, r) for r in MEMBER_ROLES])


class AgencyUpdateMemberSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=[(r, r) for r in MEMBER_ROLES], required=False)
    status = serializers.ChoiceField(
        choices=[(s, s) for s in MEMBER_STATUSES], required=False
    )

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError("Provide 'role' and/or 'status'.")
        return attrs


class AgencyReferralSaleSerializer(serializers.ModelSerializer):
    """A sale attributed to this agency.

    Deliberately excludes ``customer_email``, ``user``, order items and eSIM data. The
    agency introduced the customer to the platform; it does not own the relationship.
    """

    commission_minor = serializers.SerializerMethodField()
    commission_status = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = (
            "id",
            "order_number",
            "currency",
            "total_minor",
            "status",
            "payment_status",
            "placed_at",
            "promo_code_snapshot",
            "commission_minor",
            "commission_status",
        )
        read_only_fields = fields

    def _commission(self, obj):
        # Prefetched by the view to avoid a query per row.
        commissions = getattr(obj, "_prefetched_commissions", None)
        if commissions is None:
            commissions = list(obj.commissions.all())
        return commissions[0] if commissions else None

    def get_commission_minor(self, obj):
        commission = self._commission(obj)
        if commission is None:
            return None
        return commission.commission_minor - commission.reversed_minor

    def get_commission_status(self, obj):
        commission = self._commission(obj)
        return commission.status if commission else None


class AgencyCommissionSerializer(serializers.ModelSerializer):
    order_number = serializers.CharField(source="order.order_number", read_only=True)
    net_minor = serializers.SerializerMethodField()

    class Meta:
        model = PartnerCommission
        fields = (
            "id", "order_number", "commission_type", "commission_value_snapshot",
            "commissionable_minor", "commission_minor", "reversed_minor", "net_minor",
            "currency", "status", "approved_at", "paid_at", "created_at",
        )
        read_only_fields = fields

    def get_net_minor(self, obj):
        return obj.commission_minor - obj.reversed_minor


class AgencyPayoutSerializer(serializers.ModelSerializer):
    class Meta:
        model = CommissionPayout
        fields = (
            "id", "currency", "amount_minor", "status", "period_start", "period_end",
            "payment_method", "external_reference", "paid_at", "created_at",
        )
        read_only_fields = fields


class AgencyTrackingCodeSerializer(serializers.ModelSerializer):
    """The agency's referral codes. Read-only — only the platform issues them."""

    redemption_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = PromoCode
        fields = (
            "id", "code", "kind", "commission_type", "commission_value",
            "usage_limit", "starts_at", "ends_at", "is_active", "redemption_count",
            "created_at",
        )
        read_only_fields = fields


class AgencyActivitySerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditEvent
        fields = (
            "id", "created_at", "actor_email", "actor_type", "action", "object_type",
            "object_repr", "changes",
        )
        read_only_fields = fields
