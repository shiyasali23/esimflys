"""Agency staff management.

Two invariants are enforced here rather than in views, because both are security
properties and must hold regardless of which panel calls them:

1. **No privilege escalation.** An agency actor may only grant roles strictly below their
   own (:func:`apps.administration.permissions.can_assign_role`). Platform administrators
   are unrestricted — they sit outside the agency role hierarchy — which is expressed by
   passing ``actor_role=None``.
2. **An organization always retains at least one active owner.** Otherwise an agency could
   be orphaned with nobody able to administer it.
"""

from django.db import transaction

from apps.accounts.models import MEMBER_ROLES, OrganizationMember
from apps.administration.audit import record_audit
from apps.administration.permissions import can_assign_role
from apps.common.exceptions import Conflict, DomainError


class RoleNotPermitted(DomainError):
    status_code = 403
    error_code = "permission_denied"
    default_message = "You may not assign that role."


class LastOwnerProtected(Conflict):
    error_code = "last_owner_protected"
    default_message = "An organization must keep at least one active owner."


def _active_owner_count(organization, *, exclude_member_id=None):
    queryset = OrganizationMember.objects.filter(
        organization=organization, role="owner", status="active"
    )
    if exclude_member_id is not None:
        queryset = queryset.exclude(pk=exclude_member_id)
    return queryset.count()


def _guard_last_owner(membership, *, new_role=None, new_status=None):
    """Raise when the change would remove the final active owner."""
    if membership.role != "owner" or membership.status != "active":
        return
    still_owner = (new_role or membership.role) == "owner"
    still_active = (new_status or membership.status) == "active"
    if still_owner and still_active:
        return
    if _active_owner_count(membership.organization, exclude_member_id=membership.pk) == 0:
        raise LastOwnerProtected()


def set_member_role(membership, *, role, actor=None, actor_role=None, request=None):
    """Change a member's role."""
    if role not in MEMBER_ROLES:
        raise RoleNotPermitted(message=f"Unknown role '{role}'.")
    if actor_role is not None and not can_assign_role(actor_role, role):
        raise RoleNotPermitted(
            message=f"A '{actor_role}' may not assign the role '{role}'."
        )

    with transaction.atomic():
        membership = OrganizationMember.objects.select_for_update().get(pk=membership.pk)
        previous = membership.role
        if previous == role:
            return membership
        _guard_last_owner(membership, new_role=role)

        membership.role = role
        membership.save(update_fields=["role", "updated_at"])
        record_audit(
            action="organization_member.role_changed",
            actor=actor,
            organization=membership.organization,
            obj=membership,
            changes={"role": [previous, role]},
            context={"member_email": membership.user.email},
            request=request,
        )
        return membership


def set_member_status(membership, *, status, actor=None, actor_role=None, request=None):
    """Enable or disable a member. Disabling immediately revokes agency-panel access."""
    if status not in ("active", "disabled", "invited"):
        raise RoleNotPermitted(message=f"Unknown status '{status}'.")
    if actor_role is not None and not can_assign_role(actor_role, membership.role):
        raise RoleNotPermitted(
            message=f"A '{actor_role}' may not modify a '{membership.role}'."
        )

    with transaction.atomic():
        membership = OrganizationMember.objects.select_for_update().get(pk=membership.pk)
        previous = membership.status
        if previous == status:
            return membership
        _guard_last_owner(membership, new_status=status)

        membership.status = status
        membership.save(update_fields=["status", "updated_at"])
        record_audit(
            action="organization_member.status_changed",
            actor=actor,
            organization=membership.organization,
            obj=membership,
            changes={"status": [previous, status]},
            context={"member_email": membership.user.email},
            request=request,
        )
        return membership


def add_member(organization, user, *, role, actor=None, actor_role=None, request=None):
    """Attach a user to an organization."""
    if role not in MEMBER_ROLES:
        raise RoleNotPermitted(message=f"Unknown role '{role}'.")
    if actor_role is not None and not can_assign_role(actor_role, role):
        raise RoleNotPermitted(
            message=f"A '{actor_role}' may not assign the role '{role}'."
        )
    if OrganizationMember.objects.filter(organization=organization, user=user).exists():
        raise Conflict(message="That user is already a member of this organization.")

    with transaction.atomic():
        membership = OrganizationMember.objects.create(
            organization=organization, user=user, role=role, status="active"
        )
        record_audit(
            action="organization_member.added",
            actor=actor,
            organization=organization,
            obj=membership,
            changes={"role": [None, role]},
            context={"member_email": user.email},
            request=request,
        )
        return membership


def remove_member(membership, *, actor=None, actor_role=None, request=None):
    """Detach a member. Implemented as disable-then-delete so the audit records who left."""
    if actor_role is not None and not can_assign_role(actor_role, membership.role):
        raise RoleNotPermitted(
            message=f"A '{actor_role}' may not remove a '{membership.role}'."
        )
    with transaction.atomic():
        membership = OrganizationMember.objects.select_for_update().get(pk=membership.pk)
        _guard_last_owner(membership, new_status="disabled")
        organization, email, role = (
            membership.organization, membership.user.email, membership.role,
        )
        record_audit(
            action="organization_member.removed",
            actor=actor,
            organization=organization,
            obj=membership,
            changes={"role": [role, None]},
            context={"member_email": email},
            request=request,
        )
        membership.delete()
