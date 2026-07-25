from django.db.models import Count, DecimalField, F, Min, Q
from django.db.models.functions import Cast

from .models import CatalogPlan, Country

_PER_DAY_MINOR = Cast(
    F("plans__retail_amount_minor"), DecimalField(max_digits=20, decimal_places=6)
) / F("plans__validity_days")


def active_countries():
    return (
        Country.objects.filter(is_active=True)
        .annotate(
            price_from_minor=Min(_PER_DAY_MINOR, filter=Q(plans__status="active")),
            active_plan_count=Count("plans", filter=Q(plans__status="active")),
        )
        .order_by("sort_order", "name")
    )


def active_plans(country_slug=None):
    queryset = CatalogPlan.objects.filter(
        status="active", country__is_active=True
    ).select_related("country")
    if country_slug is not None:
        queryset = queryset.filter(country__slug=country_slug)
    return queryset.order_by("sort_order", "retail_amount_minor")
