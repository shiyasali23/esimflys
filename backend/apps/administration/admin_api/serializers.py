"""Serializers for the platform admin API.

Every serializer declares an explicit ``fields`` allowlist. ``fields = "__all__"`` is
banned in admin scope: it would silently expose new columns (including wholesale cost and
encrypted credentials) the moment a model gains them.
"""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from apps.administration.services import promos as promo_services

from apps.accounts.models import (
    MEMBER_ROLES,
    MEMBER_STATUSES,
    CommissionPayout,
    Organization,
    OrganizationMember,
    PartnerCommission,
)
from apps.administration import roles as roles_module
from apps.administration.models import AuditEvent
from apps.administration.roles import has_platform_capability
from apps.catalog.models import CatalogPlan, Country, TopupProduct
from apps.esims.models import EsimProfile, SupplierEvent
from apps.orders.models import Notification, Order, OrderItem, PromoCode
from apps.payments.models import Payment, Refund

User = get_user_model()


class OrganizationSerializer(serializers.ModelSerializer):
    member_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Organization
        fields = (
            "id",
            "name",
            "organization_type",
            "billing_email",
            "support_email",
            "country",
            "status",
            "default_commission_type",
            "default_commission_value",
            "commission_currency",
            "approved_at",
            "suspended_at",
            "suspension_reason",
            "member_count",
            "created_at",
            "updated_at",
        )
        # Status moves only through the lifecycle service, never a bare PATCH.
        read_only_fields = (
            "id", "status", "approved_at", "suspended_at", "suspension_reason",
            "created_at", "updated_at",
        )


class OrganizationCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = (
            # `id` and `status` are echoed back so a client can act on what it just
            # created without a second round-trip.
            "id", "status",
            "name", "organization_type", "billing_email", "support_email", "country",
            "default_commission_type", "default_commission_value", "commission_currency",
        )
        read_only_fields = ("id", "status")


class SuspendSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=500)


class ReasonSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=500, required=False, allow_blank=True)


class OrganizationMemberSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source="user.email", read_only=True)
    first_name = serializers.CharField(source="user.first_name", read_only=True)
    last_name = serializers.CharField(source="user.last_name", read_only=True)

    class Meta:
        model = OrganizationMember
        fields = ("id", "email", "first_name", "last_name", "role", "status", "created_at")
        read_only_fields = ("id", "created_at")


class AddMemberSerializer(serializers.Serializer):
    """Attach a user to an organization, creating the login if it does not exist.

    Agencies are onboarded by the platform: there is no agency self-signup, so the
    administrator sets the initial password here and passes it to the agency out of band.
    """

    email = serializers.EmailField()
    role = serializers.ChoiceField(choices=[(r, r) for r in MEMBER_ROLES])
    password = serializers.CharField(write_only=True, required=False, allow_blank=False)
    first_name = serializers.CharField(required=False, allow_blank=True, default="")
    last_name = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_password(self, value):
        validate_password(value)
        return value

    def validate(self, attrs):
        exists = User.objects.filter(email=attrs["email"]).exists()
        if not exists and not attrs.get("password"):
            raise serializers.ValidationError({
                "password": [
                    "No account exists for that email, so a password is required to "
                    "create one."
                ]
            })
        return attrs


class SetMemberPasswordSerializer(serializers.Serializer):
    """Administrator-issued password reset for an agency user."""

    password = serializers.CharField(write_only=True)

    def validate_password(self, value):
        validate_password(value)
        return value


class UpdateMemberSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=[(r, r) for r in MEMBER_ROLES], required=False)
    status = serializers.ChoiceField(
        choices=[(s, s) for s in MEMBER_STATUSES], required=False
    )

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError("Provide 'role' and/or 'status'.")
        return attrs


class TrackingCodeSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    redemption_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = PromoCode
        fields = (
            "id",
            "code",
            "kind",
            "organization",
            "organization_name",
            "commission_type",
            "commission_value",
            "usage_limit",
            "starts_at",
            "ends_at",
            "is_active",
            "redemption_count",
            "created_at",
        )
        read_only_fields = fields


class IssueTrackingCodeSerializer(serializers.Serializer):
    """Issue an attribution-only referral code.

    No discount fields are accepted: a tracking code must never reduce what the customer
    pays, and the database enforces that too.
    """

    code = serializers.CharField(max_length=64)
    commission_bps = serializers.IntegerField(min_value=1, max_value=10000, default=2000)
    usage_limit = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    ends_at = serializers.DateTimeField(required=False, allow_null=True)

    def validate_code(self, value):
        code = value.strip()
        if not code:
            raise serializers.ValidationError("Code cannot be blank.")
        if PromoCode.objects.filter(code=code).exists():
            raise serializers.ValidationError("That code already exists.")
        return code


class AdminPromoCodeSerializer(serializers.ModelSerializer):
    """A discount code as the panel shows it.

    `percent_off` is derived, not stored: the column is basis points so the arithmetic
    stays integral, and every surface that shows a percentage derives it from the same
    helper rather than dividing by 100 in its own way.
    """

    percent_off = serializers.SerializerMethodField()
    redemption_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = PromoCode
        fields = (
            "id",
            "code",
            "kind",
            "discount_type",
            "discount_value",
            "percent_off",
            "usage_limit",
            "per_customer_limit",
            "starts_at",
            "ends_at",
            "is_active",
            "redemption_count",
            "created_at",
        )
        read_only_fields = fields

    def get_percent_off(self, obj):
        return promo_services.bps_to_percent(obj.discount_value)


class CreatePromoCodeSerializer(serializers.Serializer):
    """Mint a percentage-off code.

    Takes a PERCENT, not basis points. Operators think in percent, and the one place
    that ever sees 1000-meaning-10% is the conversion in `promos.percent_to_bps`.
    """

    code = serializers.CharField(max_length=64)
    percent_off = serializers.DecimalField(
        max_digits=5, decimal_places=2, min_value=Decimal("0.01"), max_value=Decimal("100"),
    )
    usage_limit = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    per_customer_limit = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    starts_at = serializers.DateTimeField(required=False, allow_null=True)
    ends_at = serializers.DateTimeField(required=False, allow_null=True)

    def validate_code(self, value):
        code = value.strip()
        if not code:
            raise serializers.ValidationError("Code cannot be blank.")
        if " " in code:
            raise serializers.ValidationError("Codes cannot contain spaces.")
        # `code` is a CITextField, so this lookup is already case-insensitive — which is
        # what makes the check honest: SAVE10 and save10 are the same code at checkout,
        # and without it the duplicate reaches the unique index as a 500 instead of a
        # field error the operator can act on.
        if PromoCode.objects.filter(code=code).exists():
            raise serializers.ValidationError("A promo code with that name already exists.")
        return code

    def validate(self, attrs):
        starts, ends = attrs.get("starts_at"), attrs.get("ends_at")
        if starts and ends and starts > ends:
            # Also a database constraint (`promo_dates_ordered`); caught here so it
            # returns a field error instead of a 500 from the integrity error.
            raise serializers.ValidationError({"ends_at": ["End date must be after the start date."]})
        return attrs


class UpdatePromoCodeSerializer(serializers.Serializer):
    """Edit a code's terms. `code` and `kind` are deliberately absent — see promos.py."""

    percent_off = serializers.DecimalField(
        max_digits=5, decimal_places=2, min_value=Decimal("0.01"), max_value=Decimal("100"),
        required=False,
    )
    usage_limit = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    per_customer_limit = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    starts_at = serializers.DateTimeField(required=False, allow_null=True)
    ends_at = serializers.DateTimeField(required=False, allow_null=True)
    is_active = serializers.BooleanField(required=False)

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError("Provide at least one field to change.")
        return attrs


class AdminOrderItemSerializer(serializers.ModelSerializer):
    """Order line for platform staff.

    ``wholesale_amount_minor`` is intentionally absent: margin is an aggregate concern
    exposed only through the capability-gated dashboard, never leaked row by row.
    """

    class Meta:
        model = OrderItem
        fields = (
            "id", "item_type", "product_code", "product_name", "country_iso2",
            "country_name", "plan_type", "data_limit_mb", "daily_high_speed_mb",
            "validity_days", "unit_amount_minor", "currency", "status",
        )
        read_only_fields = fields


class AdminOrderListSerializer(serializers.ModelSerializer):
    item_count = serializers.IntegerField(read_only=True)
    referring_organization_name = serializers.CharField(
        source="referring_organization.name", read_only=True, default=None
    )

    class Meta:
        model = Order
        fields = (
            "id", "order_number", "customer_email", "currency", "subtotal_minor",
            "discount_minor", "tax_minor", "total_minor", "status", "payment_status",
            "fulfillment_status", "placed_at", "created_at", "promo_code_snapshot",
            "referring_organization", "referring_organization_name", "item_count",
        )
        read_only_fields = fields


class AdminOrderDetailSerializer(AdminOrderListSerializer):
    items = AdminOrderItemSerializer(many=True, read_only=True)
    payments = serializers.SerializerMethodField()
    esims = serializers.SerializerMethodField()

    class Meta(AdminOrderListSerializer.Meta):
        fields = AdminOrderListSerializer.Meta.fields + ("items", "payments", "esims")

    def get_payments(self, obj):
        return AdminPaymentSerializer(obj.payments.all(), many=True).data

    def get_esims(self, obj):
        from apps.esims.models import EsimProfile

        profiles = EsimProfile.objects.filter(order_item__order=obj)
        return AdminEsimListSerializer(profiles, many=True).data


class AdminPaymentSerializer(serializers.ModelSerializer):
    order_number = serializers.CharField(source="order.order_number", read_only=True)

    class Meta:
        model = Payment
        fields = (
            "id", "order", "order_number", "provider", "amount_minor", "currency",
            "status", "failure_code", "paid_at", "created_at",
        )
        read_only_fields = fields


class AdminRefundSerializer(serializers.ModelSerializer):
    order_number = serializers.CharField(
        source="payment.order.order_number", read_only=True
    )

    class Meta:
        model = Refund
        fields = (
            "id", "payment", "order_number", "amount_minor", "currency", "reason",
            "status", "completed_at", "created_at",
        )
        read_only_fields = fields


class RefundAllocationSerializer(serializers.Serializer):
    order_item_id = serializers.UUIDField()
    amount_minor = serializers.IntegerField(min_value=1)


class CreateRefundSerializer(serializers.Serializer):
    allocations = RefundAllocationSerializer(many=True, allow_empty=False)
    reason = serializers.CharField(max_length=500, required=False, allow_blank=True)


class AdminCustomerSerializer(serializers.ModelSerializer):
    order_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = User
        fields = (
            "id", "email", "first_name", "last_name", "preferred_currency",
            "email_verified_at", "is_active", "date_joined", "order_count",
        )
        read_only_fields = fields


class AdminEsimListSerializer(serializers.ModelSerializer):
    """eSIM summary. Credentials are never included — see the reveal endpoint."""

    order_number = serializers.CharField(
        source="order_item.order.order_number", read_only=True
    )
    product_name = serializers.CharField(source="order_item.product_name", read_only=True)
    country_iso2 = serializers.CharField(source="order_item.country_iso2", read_only=True)

    class Meta:
        model = EsimProfile
        fields = (
            "id", "status", "order_number", "product_name", "country_iso2",
            "iccid_last4", "total_data_bytes", "remaining_data_bytes", "installed_at",
            "activated_at", "expires_at", "last_synced_at", "created_at",
        )
        read_only_fields = fields


class AdminSupplierEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = SupplierEvent
        fields = (
            "id", "event_type", "status", "attempt_count", "next_attempt_at",
            "error_code", "error_message", "supplier_reference", "correlation_id",
            "completed_at", "created_at",
        )
        read_only_fields = fields


class AdminNotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = (
            "id", "template_code", "channel", "recipient", "status", "attempt_count",
            "next_attempt_at", "failure_message", "sent_at", "created_at",
        )
        read_only_fields = fields


# --- Commissions & payouts -----------------------------------------------------------

class AdminCommissionSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    order_number = serializers.CharField(source="order.order_number", read_only=True)
    net_minor = serializers.SerializerMethodField()

    class Meta:
        model = PartnerCommission
        fields = (
            "id", "organization", "organization_name", "order_number", "commission_type",
            "commission_value_snapshot", "commissionable_minor", "commission_minor",
            "reversed_minor", "net_minor", "currency", "status", "approved_at", "paid_at",
            "payout", "created_at",
        )
        read_only_fields = fields

    def get_net_minor(self, obj):
        return obj.commission_minor - obj.reversed_minor


class AdminPayoutSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    # Prefers the list query's annotation; falls back to a real count on single-object
    # responses (create/pay), which previously reported 0 for a non-empty payout.
    commission_count = serializers.SerializerMethodField()

    class Meta:
        model = CommissionPayout
        fields = (
            "id", "organization", "organization_name", "currency", "amount_minor",
            "status", "period_start", "period_end", "payment_method",
            "external_reference", "paid_at", "commission_count", "created_at",
        )
        read_only_fields = fields

    def get_commission_count(self, obj):
        annotated = getattr(obj, "commission_count", None)
        if isinstance(annotated, int):
            return annotated
        return obj.commissions.count()


class CreatePayoutSerializer(serializers.Serializer):
    organization = serializers.UUIDField()
    period_start = serializers.DateField()
    period_end = serializers.DateField()
    currency = serializers.CharField(max_length=3, default="USD")

    def validate(self, attrs):
        if attrs["period_start"] > attrs["period_end"]:
            raise serializers.ValidationError("period_start must be before period_end.")
        return attrs


class MarkPayoutPaidSerializer(serializers.Serializer):
    reference = serializers.CharField(max_length=240, required=False, allow_blank=True)
    method = serializers.CharField(max_length=40, required=False, allow_blank=True)


class BulkApproveSerializer(serializers.Serializer):
    commission_ids = serializers.ListField(
        child=serializers.UUIDField(), allow_empty=False, max_length=500
    )


# --- Catalogue -------------------------------------------------------------------------

class _PricingAwareSerializer(serializers.ModelSerializer):
    """Drops wholesale cost unless the caller may see platform economics."""

    WHOLESALE_FIELDS = ("wholesale_amount_minor", "margin_minor")

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        allowed = has_platform_capability(
            getattr(request, "user", None), roles_module.MANAGE_PLATFORM_PRICING
        ) if request else False
        if not allowed:
            for field in self.WHOLESALE_FIELDS:
                data.pop(field, None)
        return data


class AdminCountrySerializer(serializers.ModelSerializer):
    plan_count = serializers.IntegerField(read_only=True, default=0)
    active_plan_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Country
        fields = (
            "id", "iso2", "name", "slug", "region", "flag_emoji", "timezone",
            "is_popular", "homepage_badge", "is_active", "sort_order",
            "plan_count", "active_plan_count",
        )
        # Identity comes from the supplier workbook; only presentation is editable here.
        read_only_fields = ("id", "iso2", "name", "slug", "region", "flag_emoji",
                            "plan_count", "active_plan_count")


class AdminPlanSerializer(_PricingAwareSerializer):
    country_iso2 = serializers.CharField(source="country.iso2", read_only=True)
    country_name = serializers.CharField(source="country.name", read_only=True)
    margin_minor = serializers.SerializerMethodField()

    class Meta:
        model = CatalogPlan
        fields = (
            "id", "product_code", "country", "country_iso2", "country_name",
            "plan_type", "display_name", "data_limit_mb", "daily_high_speed_mb",
            "day_count", "validity_days", "topup_supported", "hotspot_supported",
            "network_names", "retail_amount_minor", "wholesale_amount_minor",
            "margin_minor", "currency", "status", "badge", "tier",
            "is_default_selected", "sort_order", "supplier_verified_at", "created_at",
        )
        # Product facts come from the workbook. Status changes go through the service so
        # activation always passes its guards.
        read_only_fields = (
            "id", "product_code", "country", "country_iso2", "country_name", "plan_type",
            "display_name", "data_limit_mb", "daily_high_speed_mb", "day_count",
            "validity_days", "topup_supported", "hotspot_supported", "network_names",
            "wholesale_amount_minor", "margin_minor", "currency", "status",
            "supplier_verified_at", "created_at",
        )

    def get_margin_minor(self, obj):
        if obj.wholesale_amount_minor is None:
            return None
        return obj.retail_amount_minor - obj.wholesale_amount_minor


class AdminTopupProductSerializer(_PricingAwareSerializer):
    class Meta:
        model = TopupProduct
        fields = (
            "id", "product_code", "name", "data_amount_mb", "validity_days",
            "retail_amount_minor", "wholesale_amount_minor", "currency", "status",
            "created_at",
        )
        read_only_fields = (
            "id", "product_code", "name", "data_amount_mb", "validity_days",
            "wholesale_amount_minor", "currency", "created_at",
        )


class BulkPlanStatusSerializer(serializers.Serializer):
    plan_ids = serializers.ListField(
        child=serializers.UUIDField(), allow_empty=False, max_length=1000
    )
    status = serializers.ChoiceField(choices=["draft", "paused", "active"])


class AuditEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditEvent
        fields = (
            "id", "created_at", "actor_email", "actor_type", "organization", "action",
            "object_type", "object_id", "object_repr", "changes", "context", "ip_address",
        )
        read_only_fields = fields
