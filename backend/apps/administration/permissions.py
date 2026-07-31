"""DRF permission classes for the platform and agency admin APIs.

Two rules govern this module:

1. **Default deny.** A view in an admin namespace that does not declare
   ``required_capability`` is a bug, not an open endpoint. It raises
   :class:`~django.core.exceptions.ImproperlyConfigured` so the mistake surfaces in
   development and in the permission-matrix tests, rather than silently granting or
   denying access in production.
2. **404 over 403 for tenancy.** Cross-tenant access must not confirm that the object
   exists (see :mod:`apps.administration.tenancy`).
"""

from django.core.exceptions import ImproperlyConfigured
from rest_framework.permissions import BasePermission

from .roles import (
    AGENCY_ROLE_RANK,
    has_agency_capability,
    has_platform_capability,
    platform_roles_for,
)
from .tenancy import resolve_tenant


def _required_capability(view):
    capability = getattr(view, "required_capability", None)
    if not capability:
        raise ImproperlyConfigured(
            f"{view.__class__.__name__} must declare `required_capability`. "
            "Admin views deny by default."
        )
    return capability


class IsPlatformAdmin(BasePermission):
    """Any user holding at least one platform role."""

    message = "Platform administrator access is required."

    def has_permission(self, request, view):
        user = request.user
        if user is None or not user.is_authenticated or not user.is_active:
            return False
        return bool(platform_roles_for(user))


class HasPlatformCapability(BasePermission):
    """Platform role must grant ``view.required_capability``."""

    message = "You do not have permission to perform this action."

    def has_permission(self, request, view):
        return has_platform_capability(request.user, _required_capability(view))


class IsAgencyMember(BasePermission):
    """Resolve the tenant from the URL and attach it to the request.

    Sets ``request.tenant`` and ``request.membership``. Raises
    :class:`~apps.administration.tenancy.TenantNotFound` (404) when the caller is not an
    active member of an active organization.
    """

    def has_permission(self, request, view):
        organization_id = view.kwargs.get("organization_id")
        if organization_id is None:
            raise ImproperlyConfigured(
                f"{view.__class__.__name__} is agency-scoped but its URL has no "
                "`organization_id` parameter."
            )
        organization, membership = resolve_tenant(request.user, organization_id)
        request.tenant = organization
        request.membership = membership
        return True


class HasAgencyCapability(BasePermission):
    """Membership role must grant ``view.required_capability``.

    Must be listed *after* :class:`IsAgencyMember`, which populates ``request.membership``.
    """

    message = "Your role does not permit this action."

    def has_permission(self, request, view):
        capability = _required_capability(view)
        membership = getattr(request, "membership", None)
        if membership is None:
            return False
        return has_agency_capability(membership.role, capability)


class IsTenantObject(BasePermission):
    """Re-check tenancy at the object level.

    Queryset filtering should already prevent cross-tenant reads; this is the second line
    of defence for detail and mutation endpoints, since a single missing ``.filter()`` in a
    ``get_object`` override would otherwise be exploitable.
    """

    def has_object_permission(self, request, view, obj):
        tenant = getattr(request, "tenant", None)
        if tenant is None:
            return False
        owner_id = getattr(obj, "organization_id", None)
        if owner_id is None:
            resolver = getattr(view, "get_object_organization_id", None)
            if resolver is None:
                return False
            owner_id = resolver(obj)
        return owner_id == tenant.id


def can_assign_role(actor_role, target_role):
    """Whether ``actor_role`` may grant/revoke ``target_role``.

    Prevents lateral and upward privilege escalation: an ``admin`` can manage buyers and
    viewers but can neither create another ``owner`` nor promote itself.
    """
    if actor_role not in AGENCY_ROLE_RANK or target_role not in AGENCY_ROLE_RANK:
        return False
    return AGENCY_ROLE_RANK[target_role] < AGENCY_ROLE_RANK[actor_role]
