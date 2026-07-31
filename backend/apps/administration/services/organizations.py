"""Organization lifecycle.

Status is the switch that decides whether an agency may trade: an organization that is not
``active`` cannot access the agency panel (:func:`apps.administration.tenancy.resolve_tenant`)
and earns no commission (:func:`apps.accounts.services.create_commission_for_order`).
Transitions therefore run through this module only, so every change is validated against the
state machine and written to the audit trail.
"""

from django.db import transaction
from django.utils import timezone

from apps.accounts.models import ORGANIZATION_TRANSITIONS, Organization
from apps.administration.audit import record_audit
from apps.common.exceptions import Conflict


class InvalidTransition(Conflict):
    error_code = "invalid_status_transition"
    default_message = "That status change is not allowed."


def transition_organization(organization, *, to_status, actor=None, reason=None, request=None):
    """Move an organization to ``to_status``, validating the transition.

    Returns the refreshed organization. Raises :class:`InvalidTransition` when the move is
    not permitted by :data:`~apps.accounts.models.ORGANIZATION_TRANSITIONS`.
    """
    with transaction.atomic():
        organization = Organization.objects.select_for_update().get(pk=organization.pk)
        from_status = organization.status

        if to_status == from_status:
            raise InvalidTransition(
                message=f"The organization is already {to_status}."
            )
        allowed = ORGANIZATION_TRANSITIONS.get(from_status, set())
        if to_status not in allowed:
            raise InvalidTransition(
                message=(
                    f"Cannot change status from '{from_status}' to '{to_status}'. "
                    f"Allowed: {sorted(allowed) or 'none'}."
                )
            )

        organization.status = to_status
        updated = ["status", "updated_at"]

        if to_status == "active" and organization.approved_at is None:
            organization.approved_at = timezone.now()
            organization.approved_by = actor
            updated += ["approved_at", "approved_by"]
        if to_status == "suspended":
            organization.suspended_at = timezone.now()
            organization.suspension_reason = reason
            updated += ["suspended_at", "suspension_reason"]
        if to_status == "active" and from_status == "suspended":
            organization.suspended_at = None
            organization.suspension_reason = None
            updated += ["suspended_at", "suspension_reason"]

        organization.save(update_fields=updated)
        record_audit(
            action=f"organization.{to_status}",
            actor=actor,
            organization=organization,
            obj=organization,
            changes={"status": [from_status, to_status]},
            context={"reason": reason} if reason else {},
            request=request,
        )
        return organization


def approve_organization(organization, *, actor=None, request=None):
    """Let a pending agency start trading."""
    return transition_organization(
        organization, to_status="active", actor=actor, request=request
    )


def suspend_organization(organization, *, reason, actor=None, request=None):
    """Stop an agency trading. Existing commissions are retained, new ones are withheld."""
    if not reason:
        raise InvalidTransition(message="A suspension reason is required.")
    return transition_organization(
        organization, to_status="suspended", actor=actor, reason=reason, request=request
    )


def reactivate_organization(organization, *, actor=None, request=None):
    return transition_organization(
        organization, to_status="active", actor=actor, request=request
    )


def reject_organization(organization, *, reason=None, actor=None, request=None):
    return transition_organization(
        organization, to_status="rejected", actor=actor, reason=reason, request=request
    )


def close_organization(organization, *, reason=None, actor=None, request=None):
    """Terminal state — a closed organization can never trade again."""
    return transition_organization(
        organization, to_status="closed", actor=actor, reason=reason, request=request
    )
