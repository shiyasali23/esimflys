from django.contrib import admin

from .models import CatalogPlan, Country, Supplier, TopupProduct


@admin.register(Country)
class CountryAdmin(admin.ModelAdmin):
    list_display = ("name", "iso2", "region", "is_popular", "is_active", "sort_order")
    list_filter = ("is_active", "is_popular", "region")
    search_fields = ("name", "iso2", "slug")
    ordering = ("sort_order", "name")


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "status")
    list_filter = ("status",)
    search_fields = ("name", "code")


@admin.register(CatalogPlan)
class CatalogPlanAdmin(admin.ModelAdmin):
    list_display = (
        "product_code",
        "country",
        "plan_type",
        "display_name",
        "retail_amount_minor",
        "status",
        "is_default_selected",
        "sort_order",
    )
    list_filter = ("status", "plan_type", "topup_supported", "country__region")
    search_fields = ("product_code", "supplier_package_code", "display_name", "country__name")
    list_select_related = ("country", "supplier")
    autocomplete_fields = ("country", "supplier")
    ordering = ("country__name", "sort_order")


@admin.register(TopupProduct)
class TopupProductAdmin(admin.ModelAdmin):
    list_display = (
        "product_code",
        "name",
        "data_amount_mb",
        "validity_days",
        "retail_amount_minor",
        "currency",
        "status",
    )
    list_filter = ("status", "supplier")
    search_fields = ("product_code", "name", "supplier_package_code")
    autocomplete_fields = ("supplier", "base_plan")
