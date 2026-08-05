from django.conf import settings
from django.db import models
from django.db.models import F, Q

from apps.common.models import CIEmailField, CITextField, TimestampedModel, UUIDModel

CART_STATUSES = ("active", "converted", "expired", "abandoned")
CART_ITEM_TYPES = ("esim", "topup")
DISCOUNT_TYPES = ("fixed", "percentage_bps")
PROMO_CODE_KINDS = ("discount", "tracking")
COMMISSION_TYPES = ("percentage_bps", "fixed")
REDEMPTION_STATUSES = ("reserved", "consumed", "released", "cancelled")
ORDER_STATUSES = (
    "pending_payment",
    "paid",
    "fulfilling",
    "partially_fulfilled",
    "fulfilled",
    "cancelled",
    "partially_refunded",
    "refunded",
    "failed",
)
PAYMENT_STATUSES = (
    "pending",
    "processing",
    "paid",
    "failed",
    "cancelled",
    "partially_refunded",
    "refunded",
)
FULFILLMENT_STATUSES = (
    "pending",
    "processing",
    "partially_delivered",
    "delivered",
    "failed",
    "cancelled",
)
ORDER_ITEM_TYPES = ("esim", "topup")


class Cart(UUIDModel, TimestampedModel):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="carts",
    )
    organization = models.ForeignKey(
        "accounts.Organization", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="carts",
    )
    guest_token_hash = models.BinaryField(max_length=32, null=True, blank=True, unique=True)
    currency = models.CharField(max_length=3, default="USD")
    status = models.CharField(max_length=20, default="active")
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "carts"
        constraints = [
            models.CheckConstraint(
                name="cart_status_valid", condition=Q(status__in=CART_STATUSES)
            ),
            models.CheckConstraint(
                name="cart_identity_user_xor_guest",
                condition=(Q(user__isnull=False) & Q(guest_token_hash__isnull=True))
                | (Q(user__isnull=True) & Q(guest_token_hash__isnull=False)),
            ),
            models.CheckConstraint(
                name="cart_org_requires_user",
                condition=Q(organization__isnull=True) | Q(user__isnull=False),
            ),
            models.UniqueConstraint(
                fields=["user", "currency"],
                condition=Q(status="active", user__isnull=False),
                name="one_active_cart_per_user_currency",
            ),
        ]


class CartItem(UUIDModel, TimestampedModel):
    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name="items")
    item_type = models.CharField(max_length=20, default="esim")
    catalog_plan = models.ForeignKey(
        "catalog.CatalogPlan", on_delete=models.PROTECT, null=True, blank=True,
        related_name="cart_items",
    )
    topup_product = models.ForeignKey(
        "catalog.TopupProduct", on_delete=models.PROTECT, null=True, blank=True,
        related_name="cart_items",
    )
    target_esim_profile = models.ForeignKey(
        "esims.EsimProfile", on_delete=models.PROTECT, null=True, blank=True,
        related_name="cart_items",
    )
    quantity = models.IntegerField(default=1)

    class Meta:
        db_table = "cart_items"
        constraints = [
            models.CheckConstraint(
                name="cart_item_type_valid", condition=Q(item_type__in=CART_ITEM_TYPES)
            ),
            models.CheckConstraint(
                name="cart_item_quantity_range",
                condition=Q(quantity__gte=1) & Q(quantity__lte=1000),
            ),
            models.CheckConstraint(
                name="cart_item_esim_requires_plan",
                condition=~Q(item_type="esim")
                | (
                    Q(catalog_plan__isnull=False)
                    & Q(topup_product__isnull=True)
                    & Q(target_esim_profile__isnull=True)
                ),
            ),
            models.CheckConstraint(
                name="cart_item_topup_requires_target",
                condition=~Q(item_type="topup")
                | (
                    Q(topup_product__isnull=False)
                    & Q(target_esim_profile__isnull=False)
                    & Q(catalog_plan__isnull=True)
                    & Q(quantity=1)
                ),
            ),
            models.UniqueConstraint(
                fields=["cart", "catalog_plan"],
                condition=Q(catalog_plan__isnull=False),
                name="unique_plan_per_cart",
            ),
        ]


class PromoCode(UUIDModel, TimestampedModel):
    """A code entered at checkout.

    Two distinct kinds, separated structurally rather than by convention:

    * ``discount`` — reduces what the customer pays.
    * ``tracking`` — an agency referral code. The customer pays **full price**; the code
      exists only to attribute the sale to a travel agency so commission can be earned.

    A tracking code is forced to ``discount_value=0`` by a database constraint, so it can
    never be edited into a discount later, and must belong to an organization (an
    unattributed tracking code would be meaningless).
    """

    kind = models.CharField(max_length=20, default="discount")
    code = CITextField(unique=True)
    organization = models.ForeignKey(
        "accounts.Organization", on_delete=models.PROTECT, null=True, blank=True,
        related_name="promo_codes",
    )
    discount_type = models.CharField(max_length=20)
    discount_value = models.BigIntegerField()
    discount_currency = models.CharField(max_length=3, null=True, blank=True)
    maximum_discount_minor = models.BigIntegerField(null=True, blank=True)
    minimum_order_minor = models.BigIntegerField(default=0)
    commission_type = models.CharField(max_length=20, null=True, blank=True)
    commission_value = models.BigIntegerField(null=True, blank=True)
    commission_currency = models.CharField(max_length=3, null=True, blank=True)
    usage_limit = models.IntegerField(null=True, blank=True)
    per_customer_limit = models.IntegerField(null=True, blank=True)
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "promo_codes"
        constraints = [
            models.CheckConstraint(
                name="promo_discount_type_valid", condition=Q(discount_type__in=DISCOUNT_TYPES)
            ),
            models.CheckConstraint(
                name="promo_percentage_within_bounds",
                condition=~Q(discount_type="percentage_bps") | Q(discount_value__lte=10000),
            ),
            models.CheckConstraint(
                name="promo_fixed_requires_currency",
                condition=~Q(discount_type="fixed") | Q(discount_currency__isnull=False),
            ),
            models.CheckConstraint(
                name="promo_agency_requires_commission",
                condition=Q(organization__isnull=True)
                | (Q(commission_type__isnull=False) & Q(commission_value__isnull=False)),
            ),
            models.CheckConstraint(
                name="promo_commission_type_valid",
                condition=Q(commission_type__isnull=True)
                | Q(commission_type__in=COMMISSION_TYPES),
            ),
            models.CheckConstraint(
                name="promo_fixed_commission_requires_currency",
                condition=~Q(commission_type="fixed") | Q(commission_currency__isnull=False),
            ),
            models.CheckConstraint(
                name="promo_dates_ordered",
                condition=Q(starts_at__isnull=True)
                | Q(ends_at__isnull=True)
                | Q(starts_at__lte=F("ends_at")),
            ),
            models.CheckConstraint(
                name="promo_kind_valid", condition=Q(kind__in=PROMO_CODE_KINDS)
            ),
            # A tracking code must never reduce the customer's price.
            models.CheckConstraint(
                name="promo_tracking_has_no_discount",
                condition=~Q(kind="tracking") | Q(discount_value=0),
            ),
            # A tracking code with no agency attributes nothing.
            models.CheckConstraint(
                name="promo_tracking_requires_organization",
                condition=~Q(kind="tracking") | Q(organization__isnull=False),
            ),
        ]


class OrderQuerySet(models.QuerySet):
    """Tenant-scoping helpers.

    There are deliberately **two** separate methods rather than one combined filter,
    because the two agency relationships must not grant the same visibility:

    * ``for_agency_buyer`` — the agency purchased on behalf of its own customer, so it may
      see the customer and the eSIM credentials.
    * ``for_agency_referral`` — a *platform* customer merely used the agency's coupon. The
      agency may see commission-relevant figures and nothing else.

    A single ``Q(buyer=org) | Q(referring=org)`` filter would inevitably be reused by a
    detail serializer and leak retail customers' PII to any agency holding a coupon.
    """

    def for_agency_buyer(self, organization):
        return self.filter(buyer_organization=organization)

    def for_agency_referral(self, organization):
        return self.filter(referring_organization=organization)


class Order(UUIDModel, TimestampedModel):
    objects = OrderQuerySet.as_manager()

    order_number = models.CharField(max_length=40, unique=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="orders",
    )
    buyer_organization = models.ForeignKey(
        "accounts.Organization", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="orders",
    )
    referring_organization = models.ForeignKey(
        "accounts.Organization", on_delete=models.PROTECT, null=True, blank=True,
        related_name="referred_orders",
    )
    promo_code = models.ForeignKey(
        PromoCode, on_delete=models.PROTECT, null=True, blank=True, related_name="orders"
    )
    promo_code_snapshot = models.CharField(max_length=120, null=True, blank=True)
    customer_email = CIEmailField()
    # The currency the customer is charged in. Every *_minor field below is denominated in
    # it, which is what keeps the order_total_balances constraint meaningful.
    currency = models.CharField(max_length=3)
    subtotal_minor = models.BigIntegerField()
    discount_minor = models.BigIntegerField(default=0)
    tax_minor = models.BigIntegerField(default=0)
    total_minor = models.BigIntegerField()

    # The same order expressed in USD, plus the rate it was priced with.
    #
    # Commissions and every report aggregate on these, never on the local amounts: an
    # agency's 20% must not move because a traveller happened to pay in rupees, and totals
    # across mixed currencies are otherwise unsummable.
    #
    # `fx_rate_used` is snapshotted rather than looked up later. A refund weeks afterwards
    # has to reverse the amount actually taken, and re-deriving the rate from whatever is
    # configured today is the classic multi-currency accounting bug.
    base_currency = models.CharField(max_length=3, default="USD")
    base_subtotal_minor = models.BigIntegerField(null=True, blank=True)
    base_total_minor = models.BigIntegerField(null=True, blank=True)
    fx_rate_used = models.DecimalField(
        max_digits=18, decimal_places=8, null=True, blank=True
    )
    status = models.CharField(max_length=30)
    payment_status = models.CharField(max_length=30)
    fulfillment_status = models.CharField(max_length=30)
    placed_at = models.DateTimeField(null=True, blank=True)
    metadata = models.JSONField(default=dict)

    class Meta:
        db_table = "orders"
        constraints = [
            models.CheckConstraint(
                name="order_subtotal_nonneg", condition=Q(subtotal_minor__gte=0)
            ),
            models.CheckConstraint(
                name="order_discount_nonneg", condition=Q(discount_minor__gte=0)
            ),
            models.CheckConstraint(
                name="order_discount_le_subtotal",
                condition=Q(discount_minor__lte=F("subtotal_minor")),
            ),
            models.CheckConstraint(name="order_tax_nonneg", condition=Q(tax_minor__gte=0)),
            models.CheckConstraint(
                name="order_total_nonneg", condition=Q(total_minor__gte=0)
            ),
            models.CheckConstraint(
                name="order_total_balances",
                condition=Q(
                    total_minor=F("subtotal_minor") - F("discount_minor") + F("tax_minor")
                ),
            ),
            models.CheckConstraint(
                name="order_status_valid", condition=Q(status__in=ORDER_STATUSES)
            ),
            models.CheckConstraint(
                name="order_payment_status_valid",
                condition=Q(payment_status__in=PAYMENT_STATUSES),
            ),
            models.CheckConstraint(
                name="order_fulfillment_status_valid",
                condition=Q(fulfillment_status__in=FULFILLMENT_STATUSES),
            ),
        ]
        indexes = [
            models.Index(fields=["user", "status"]),
            models.Index(fields=["status", "payment_status"]),
        ]


class PromoRedemption(UUIDModel, TimestampedModel):
    promo_code = models.ForeignKey(
        PromoCode, on_delete=models.PROTECT, related_name="redemptions"
    )
    order = models.OneToOneField(Order, on_delete=models.PROTECT, related_name="promo_redemption")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="promo_redemptions",
    )
    customer_email_hash = models.BinaryField(max_length=32)
    status = models.CharField(max_length=20, default="reserved")
    reserved_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)
    released_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "promo_redemptions"
        constraints = [
            models.CheckConstraint(
                name="promo_redemption_status_valid",
                condition=Q(status__in=REDEMPTION_STATUSES),
            ),
        ]
        indexes = [
            models.Index(fields=["promo_code", "status"]),
        ]


class OrderItem(UUIDModel, TimestampedModel):
    order = models.ForeignKey(Order, on_delete=models.PROTECT, related_name="items")
    catalog_plan = models.ForeignKey(
        "catalog.CatalogPlan", on_delete=models.PROTECT, null=True, blank=True,
        related_name="order_items",
    )
    topup_product = models.ForeignKey(
        "catalog.TopupProduct", on_delete=models.PROTECT, null=True, blank=True,
        related_name="order_items",
    )
    supplier = models.ForeignKey(
        "catalog.Supplier", on_delete=models.PROTECT, related_name="order_items"
    )
    item_type = models.CharField(max_length=20)
    product_code = models.CharField(max_length=120)
    supplier_package_code = models.CharField(max_length=120)
    product_name = models.CharField(max_length=240)
    country_iso2 = models.CharField(max_length=2, null=True, blank=True)
    country_name = models.CharField(max_length=120, null=True, blank=True)
    plan_type = models.CharField(max_length=20, null=True, blank=True)
    data_limit_mb = models.BigIntegerField(null=True, blank=True)
    daily_high_speed_mb = models.BigIntegerField(null=True, blank=True)
    validity_days = models.IntegerField(null=True, blank=True)
    traffic_policy = models.TextField(null=True, blank=True)
    network_names = models.JSONField(default=list)
    unit_amount_minor = models.BigIntegerField()
    # What the item sold for in USD. Refund allocations and commission arithmetic use this,
    # so they stay in one currency however the customer paid.
    base_unit_amount_minor = models.BigIntegerField(null=True, blank=True)
    # Always USD: this is what the supplier charges us, and has nothing to do with the buyer.
    wholesale_amount_minor = models.BigIntegerField(null=True, blank=True)
    currency = models.CharField(max_length=3)
    status = models.CharField(max_length=30, default="pending")

    class Meta:
        db_table = "order_items"
        constraints = [
            models.CheckConstraint(
                name="order_item_type_valid", condition=Q(item_type__in=ORDER_ITEM_TYPES)
            ),
            models.CheckConstraint(
                name="order_item_unit_amount_nonneg",
                condition=Q(unit_amount_minor__gte=0),
            ),
        ]
        indexes = [
            models.Index(fields=["order"]),
        ]


NOTIFICATION_STATUSES = (
    "queued",
    "processing",
    "sent",
    "delivered",
    "retrying",
    "failed",
    "cancelled",
)


class Notification(UUIDModel, TimestampedModel):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="notifications",
    )
    order = models.ForeignKey(
        Order, on_delete=models.PROTECT, null=True, blank=True, related_name="notifications"
    )
    esim_profile = models.ForeignKey(
        "esims.EsimProfile", on_delete=models.PROTECT, null=True, blank=True,
        related_name="notifications",
    )
    channel = models.CharField(max_length=20, default="email")
    recipient = models.CharField(max_length=320)
    template_code = models.CharField(max_length=80)
    idempotency_key = models.CharField(max_length=255, unique=True)
    provider_message_id = models.CharField(max_length=255, null=True, blank=True)
    status = models.CharField(max_length=20, default="queued")
    attempt_count = models.IntegerField(default=0)
    next_attempt_at = models.DateTimeField(null=True, blank=True)
    failure_message = models.TextField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "notifications"
        constraints = [
            models.CheckConstraint(
                name="notification_status_valid",
                condition=Q(status__in=NOTIFICATION_STATUSES),
            ),
        ]
        indexes = [models.Index(fields=["status", "next_attempt_at"])]
