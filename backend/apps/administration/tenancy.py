"""Tenant resolution and scoping for the agency admin panel.

Every agency request must resolve to exactly one :class:`~apps.accounts.models.Organization`
before any data is touched. :func:`resolve_tenant` is the single entry point; views must not
re-implement membership checks.

Failures raise :class:`TenantNotFound` (HTTP 404, not 403) on purpose: a 403 would confirm
that another tenant's object exists, which is itself an information leak.
"""

from rest_framework import status

from apps.accounts.models import Organization, OrganizationMember
from apps.common.exceptions import DomainError


class TenantNotFound(DomainError):
    status_code = status.HTTP_404_NOT_FOUND
    error_code = "not_found"
    default_message = "Not found."


def resolve_tenant(user, organization_id):
    """Return ``(organization, membership)`` for an active member of an active agency.

    Raises :class:`TenantNotFound` when the user is anonymous, is not a member, the
    membership is not ``active``, or the organization is not ``active``. All four cases
    produce an identical response so callers cannot probe which condition failed.
    """
    if user is None or not getattr(user, "is_authenticated", False):
        raise TenantNotFound()

    membership = (
        OrganizationMember.objects.select_related("organization")
        .filter(user=user, organization_id=organization_id, status="active")
        .first()
    )
    if membership is None:
        raise TenantNotFound()
    if not membership.organization.is_operational:
        raise TenantNotFound()
    return membership.organization, membership


def agency_orders(organization):
    """Orders the agency **owns** (bought on behalf of a customer). Full visibility."""
    from apps.orders.models import Order

    return Order.objects.for_agency_buyer(organization)


def agency_referral_orders(organization):
    """Orders merely attributed to the agency by coupon. Commission-only visibility."""
    from apps.orders.models import Order

    return Order.objects.for_agency_referral(organization)


def agency_esim_profiles(organization):
    """eSIM profiles the agency may see credentials for — buyer orders only."""
    from apps.esims.models import EsimProfile

    return EsimProfile.objects.filter(
        order_item__order__buyer_organization=organization
    )


def agency_commissions(organization):
    from apps.accounts.models import PartnerCommission

    return PartnerCommission.objects.filter(organization=organization)


def agency_payouts(organization):
    from apps.accounts.models import CommissionPayout

    return CommissionPayout.objects.filter(organization=organization)


def agency_audit_events(organization):
    """Audit trail scoped to one tenant."""
    from apps.administration.models import AuditEvent

    return AuditEvent.objects.filter(organization=organization)


def member_organizations(user):
    """Active organizations the user belongs to (used for the tenant switcher)."""
    if user is None or not getattr(user, "is_authenticated", False):
        return Organization.objects.none()
    return Organization.objects.filter(
        members__user=user, members__status="active", status="active"
    ).distinct()
