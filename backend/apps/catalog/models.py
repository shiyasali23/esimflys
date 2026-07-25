from django.db import models
from django.db.models import F, Q

from apps.common.models import CIEmailField, TimestampedModel, UUIDModel

PLAN_TYPES = ("fixed", "daily")
PLAN_STATUSES = ("draft", "paused", "active", "retired")
SUPPLIER_STATUSES = ("active", "paused", "disabled")


class Country(UUIDModel, TimestampedModel):
    iso2 = models.CharField(max_length=2, unique=True)
    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=140, unique=True)
    region = models.CharField(max_length=80)
    flag_emoji = models.CharField(max_length=16, null=True, blank=True)
    timezone = models.CharField(max_length=80, null=True, blank=True)
    is_popular = models.BooleanField(default=False)
    homepage_badge = models.CharField(max_length=20, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    sort_order = models.IntegerField(default=0)

    class Meta:
        db_table = "countries"
        verbose_name_plural = "countries"
        constraints = [
            models.CheckConstraint(
                name="country_iso2_uppercase",
                condition=Q(iso2__regex=r"^[A-Z]{2}$"),
            ),
            models.CheckConstraint(
                name="country_homepage_badge_valid",
                condition=Q(homepage_badge__isnull=True)
                | Q(homepage_badge__in=["popular", "best_value"]),
            ),
            models.CheckConstraint(
                name="country_sort_order_nonneg",
                condition=Q(sort_order__gte=0),
            ),
        ]
        indexes = [
            models.Index(fields=["is_active", "is_popular", "sort_order"]),
            models.Index(fields=["region", "is_active", "name"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.iso2})"


class Supplier(UUIDModel, TimestampedModel):
    code = models.CharField(max_length=40, unique=True)
    name = models.CharField(max_length=120)
    status = models.CharField(max_length=20, default="active")
    api_base_url = models.CharField(max_length=500, null=True, blank=True)
    support_email = CIEmailField(null=True, blank=True)
    metadata = models.JSONField(default=dict)

    class Meta:
        db_table = "suppliers"
        constraints = [
            models.CheckConstraint(
                name="supplier_status_valid",
                condition=Q(status__in=SUPPLIER_STATUSES),
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.code})"


class CatalogPlan(UUIDModel, TimestampedModel):
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name="plans")
    country = models.ForeignKey(Country, on_delete=models.PROTECT, related_name="plans")
    product_code = models.CharField(max_length=120, unique=True)
    supplier_package_code = models.CharField(max_length=120)
    plan_type = models.CharField(max_length=20)
    day_count = models.IntegerField(null=True, blank=True)
    display_name = models.CharField(max_length=240)
    data_limit_mb = models.BigIntegerField(null=True, blank=True)
    daily_high_speed_mb = models.BigIntegerField(null=True, blank=True)
    validity_days = models.IntegerField()
    traffic_policy = models.TextField(null=True, blank=True)
    activation_policy = models.TextField(null=True, blank=True)
    hotspot_supported = models.BooleanField(null=True, blank=True)
    network_names = models.JSONField(default=list)
    topup_supported = models.BooleanField(default=False)
    retail_amount_minor = models.BigIntegerField()
    wholesale_amount_minor = models.BigIntegerField(null=True, blank=True)
    currency = models.CharField(max_length=3, default="USD")
    status = models.CharField(max_length=20, default="paused")
    badge = models.CharField(max_length=20, null=True, blank=True)
    tier = models.CharField(max_length=20, null=True, blank=True)
    is_default_selected = models.BooleanField(default=False)
    sort_order = models.IntegerField(default=0)
    supplier_verified_at = models.DateTimeField(null=True, blank=True)
    supplier_metadata = models.JSONField(default=dict)

    class Meta:
        db_table = "catalog_plans"
        constraints = [
            models.CheckConstraint(
                name="catalog_plan_type_valid",
                condition=Q(plan_type__in=PLAN_TYPES),
            ),
            models.CheckConstraint(
                name="catalog_plan_status_valid",
                condition=Q(status__in=PLAN_STATUSES),
            ),
            models.CheckConstraint(
                name="catalog_plan_badge_valid",
                condition=Q(badge__isnull=True) | Q(badge__in=["popular", "value"]),
            ),
            models.CheckConstraint(
                name="catalog_plan_validity_positive",
                condition=Q(validity_days__gt=0),
            ),
            models.CheckConstraint(
                name="catalog_plan_retail_positive",
                condition=Q(retail_amount_minor__gt=0),
            ),
            models.CheckConstraint(
                name="catalog_plan_wholesale_nonneg",
                condition=Q(wholesale_amount_minor__isnull=True)
                | Q(wholesale_amount_minor__gte=0),
            ),
            models.CheckConstraint(
                name="catalog_plan_fixed_shape",
                condition=~Q(plan_type="fixed")
                | (
                    Q(data_limit_mb__gt=0)
                    & Q(daily_high_speed_mb__isnull=True)
                    & Q(day_count__isnull=True)
                ),
            ),
            models.CheckConstraint(
                name="catalog_plan_daily_shape",
                condition=~Q(plan_type="daily")
                | (
                    Q(daily_high_speed_mb__gt=0)
                    & Q(data_limit_mb__isnull=True)
                    & Q(day_count=F("validity_days"))
                ),
            ),
            models.UniqueConstraint(
                fields=["country"],
                condition=Q(is_default_selected=True) & ~Q(status="retired"),
                name="one_default_plan_per_country",
            ),
        ]
        indexes = [
            models.Index(fields=["country", "status", "sort_order"]),
            models.Index(fields=["supplier", "supplier_package_code"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return f"{self.product_code} ({self.status})"


TOPUP_STATUSES = ("draft", "paused", "active", "retired")


class TopupProduct(UUIDModel, TimestampedModel):
    supplier = models.ForeignKey(
        Supplier, on_delete=models.PROTECT, related_name="topup_products"
    )
    base_plan = models.ForeignKey(
        CatalogPlan, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="topup_products",
    )
    product_code = models.CharField(max_length=120, unique=True)
    supplier_package_code = models.CharField(max_length=120)
    name = models.CharField(max_length=240)
    data_amount_mb = models.BigIntegerField()
    validity_days = models.IntegerField(null=True, blank=True)
    retail_amount_minor = models.BigIntegerField()
    wholesale_amount_minor = models.BigIntegerField(null=True, blank=True)
    currency = models.CharField(max_length=3, default="USD")
    status = models.CharField(max_length=20, default="paused")
    supplier_metadata = models.JSONField(default=dict)

    class Meta:
        db_table = "topup_products"
        constraints = [
            models.CheckConstraint(
                name="topup_data_positive", condition=Q(data_amount_mb__gt=0)
            ),
            models.CheckConstraint(
                name="topup_validity_positive",
                condition=Q(validity_days__isnull=True) | Q(validity_days__gt=0),
            ),
            models.CheckConstraint(
                name="topup_retail_positive", condition=Q(retail_amount_minor__gt=0)
            ),
            models.CheckConstraint(
                name="topup_status_valid", condition=Q(status__in=TOPUP_STATUSES)
            ),
        ]
        indexes = [models.Index(fields=["supplier", "status"])]

    def __str__(self):
        return f"{self.product_code} ({self.status})"
