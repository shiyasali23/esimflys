from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models

from apps.common.models import CIEmailField, TimestampedModel, UUIDModel


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email, password, **extra_fields):
        if not email:
            raise ValueError("Users must have an email address.")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")
        return self._create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin, UUIDModel, TimestampedModel):
    email = CIEmailField(unique=True)
    first_name = models.CharField(max_length=150, blank=True, default="")
    last_name = models.CharField(max_length=150, blank=True, default="")
    preferred_currency = models.CharField(max_length=3, default="USD")
    email_verified_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(auto_now_add=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    class Meta:
        db_table = "users"

    def __str__(self):
        return self.email


ORGANIZATION_TYPES = ("travel_agency", "business", "affiliate")
COMMISSION_TYPES = ("percentage_bps", "fixed")
MEMBER_ROLES = ("owner", "admin", "buyer", "viewer")
MEMBER_STATUSES = ("invited", "active", "disabled")
ORGANIZATION_STATUSES = ("pending", "active", "suspended", "rejected", "closed")

#: Legal organization status transitions. Anything else is rejected by the service layer.
ORGANIZATION_TRANSITIONS = {
    "pending": {"active", "rejected", "closed"},
    "active": {"suspended", "closed"},
    "suspended": {"active", "closed"},
    "rejected": {"pending", "closed"},
    "closed": set(),
}


class Organization(UUIDModel, TimestampedModel):
    name = models.CharField(max_length=200)
    organization_type = models.CharField(max_length=30)
    billing_email = CIEmailField()
    status = models.CharField(max_length=20, default="pending")
    support_email = CIEmailField(null=True, blank=True)
    country = models.CharField(max_length=2, null=True, blank=True)
    default_commission_type = models.CharField(max_length=20, null=True, blank=True)
    default_commission_value = models.BigIntegerField(null=True, blank=True)
    commission_currency = models.CharField(max_length=3, null=True, blank=True)
    metadata = models.JSONField(default=dict)

    # Lifecycle audit trail (who let this agency trade, and when).
    approved_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="approved_organizations",
    )
    suspended_at = models.DateTimeField(null=True, blank=True)
    suspension_reason = models.TextField(null=True, blank=True)

    class Meta:
        db_table = "organizations"
        constraints = [
            models.CheckConstraint(
                name="organization_type_valid",
                condition=models.Q(organization_type__in=ORGANIZATION_TYPES),
            ),
            models.CheckConstraint(
                name="organization_commission_type_valid",
                condition=models.Q(default_commission_type__isnull=True)
                | models.Q(default_commission_type__in=COMMISSION_TYPES),
            ),
            models.CheckConstraint(
                name="organization_status_valid",
                condition=models.Q(status__in=ORGANIZATION_STATUSES),
            ),
        ]
        indexes = [
            models.Index(fields=["status", "organization_type"]),
        ]

    def __str__(self):
        return self.name

    @property
    def is_operational(self):
        """Whether the organization may transact (earn commission, access agency scope)."""
        return self.status == "active"


class OrganizationMember(UUIDModel, TimestampedModel):
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="members"
    )
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="organization_memberships"
    )
    role = models.CharField(max_length=20)
    status = models.CharField(max_length=20, default="active")

    class Meta:
        db_table = "organization_members"
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "user"], name="unique_org_member"
            ),
            models.CheckConstraint(
                name="org_member_role_valid", condition=models.Q(role__in=MEMBER_ROLES)
            ),
            models.CheckConstraint(
                name="org_member_status_valid",
                condition=models.Q(status__in=MEMBER_STATUSES),
            ),
        ]

    def __str__(self):
        return f"{self.user} @ {self.organization}"


PAYOUT_STATUSES = ("draft", "approved", "processing", "paid", "failed", "cancelled")
COMMISSION_STATUSES = ("pending", "available", "approved", "paid", "cancelled", "reversed")


class CommissionPayout(UUIDModel, TimestampedModel):
    organization = models.ForeignKey(
        Organization, on_delete=models.PROTECT, related_name="payouts"
    )
    currency = models.CharField(max_length=3)
    amount_minor = models.BigIntegerField()
    status = models.CharField(max_length=20)
    period_start = models.DateField()
    period_end = models.DateField()
    payment_method = models.CharField(max_length=40, null=True, blank=True)
    external_reference = models.CharField(max_length=240, null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "commission_payouts"
        constraints = [
            models.CheckConstraint(
                name="payout_status_valid", condition=models.Q(status__in=PAYOUT_STATUSES)
            ),
        ]


class PartnerCommission(UUIDModel, TimestampedModel):
    organization = models.ForeignKey(
        Organization, on_delete=models.PROTECT, related_name="commissions"
    )
    order = models.ForeignKey("orders.Order", on_delete=models.PROTECT, related_name="commissions")
    promo_code = models.ForeignKey(
        "orders.PromoCode", on_delete=models.PROTECT, null=True, blank=True,
        related_name="commissions",
    )
    payout = models.ForeignKey(
        CommissionPayout, on_delete=models.PROTECT, null=True, blank=True,
        related_name="commissions",
    )
    commission_type = models.CharField(max_length=20)
    commission_value_snapshot = models.BigIntegerField()
    commissionable_minor = models.BigIntegerField()
    commission_minor = models.BigIntegerField()
    reversed_minor = models.BigIntegerField(default=0)
    currency = models.CharField(max_length=3)
    status = models.CharField(max_length=20)
    available_at = models.DateTimeField(null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "partner_commissions"
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "order"], name="unique_org_order_commission"
            ),
            models.CheckConstraint(
                name="commission_reversed_bounds",
                condition=models.Q(reversed_minor__gte=0)
                & models.Q(reversed_minor__lte=models.F("commission_minor")),
            ),
            models.CheckConstraint(
                name="commission_status_valid",
                condition=models.Q(status__in=COMMISSION_STATUSES),
            ),
        ]
