from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.contrib.auth.forms import UserChangeForm, UserCreationForm

from . import services
from .models import (
    CommissionPayout,
    Organization,
    OrganizationMember,
    PartnerCommission,
    User,
)


class UserCreationForm(UserCreationForm):
    class Meta:
        model = User
        fields = ("email",)


class UserChangeForm(UserChangeForm):
    class Meta:
        model = User
        fields = "__all__"


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    add_form = UserCreationForm
    form = UserChangeForm
    model = User
    ordering = ("email",)
    list_display = ("email", "first_name", "last_name", "is_staff", "is_active")
    list_filter = ("is_staff", "is_superuser", "is_active")
    search_fields = ("email", "first_name", "last_name")
    readonly_fields = ("last_login", "date_joined", "created_at", "updated_at")
    filter_horizontal = ("groups", "user_permissions")
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Personal", {"fields": ("first_name", "last_name", "preferred_currency")}),
        ("Status", {"fields": ("is_active", "email_verified_at", "deleted_at")}),
        (
            "Permissions",
            {"fields": ("is_staff", "is_superuser", "groups", "user_permissions")},
        ),
        ("Dates", {"fields": ("last_login", "date_joined", "created_at", "updated_at")}),
    )
    add_fieldsets = (
        (None, {"classes": ("wide",), "fields": ("email", "password1", "password2")}),
    )


@admin.action(description="Approve selected commissions")
def approve_commissions(modeladmin, request, queryset):
    """Bulk-approve, skipping anything already settled or fully reversed by a refund."""
    approved = skipped = 0
    for commission in queryset:
        try:
            services.approve_commission(commission, actor=request.user, request=request)
            approved += 1
        except services.CommissionNotApprovable:
            skipped += 1
    modeladmin.message_user(
        request,
        f"Approved {approved} commission(s). Skipped {skipped} "
        "(already settled, or fully reversed by refunds).",
    )


class OrganizationMemberInline(admin.TabularInline):
    model = OrganizationMember
    extra = 0


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ("name", "organization_type", "status", "billing_email")
    list_filter = ("organization_type", "status")
    search_fields = ("name", "billing_email")
    inlines = [OrganizationMemberInline]


@admin.register(PartnerCommission)
class PartnerCommissionAdmin(admin.ModelAdmin):
    list_display = (
        "organization",
        "order",
        "commission_minor",
        "reversed_minor",
        "currency",
        "status",
        "payout",
    )
    list_filter = ("status", "currency", "commission_type")
    search_fields = ("organization__name", "order__order_number")
    actions = [approve_commissions]


@admin.register(CommissionPayout)
class CommissionPayoutAdmin(admin.ModelAdmin):
    list_display = (
        "organization",
        "amount_minor",
        "currency",
        "status",
        "period_start",
        "period_end",
        "paid_at",
    )
    list_filter = ("status", "currency")
    search_fields = ("organization__name", "external_reference")
