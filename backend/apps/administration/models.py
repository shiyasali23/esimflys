import uuid

from django.conf import settings
from django.db import models

from apps.common.models import CIEmailField

ACTOR_TYPES = ("platform", "agency", "customer", "system")


class AuditEvent(models.Model):
    """Append-only record of a security- or money-relevant action.

    Deliberately **not** a :class:`~apps.common.models.TimestampedModel`: an audit row is
    immutable, so it has ``created_at`` but no ``updated_at``. That also keeps it out of the
    ``set_updated_at`` trigger, which only attaches to tables having that column.

    Rows are written inside the same transaction as the action they describe, so an audit
    failure rolls the action back — the trail cannot silently diverge from reality.

    ``changes`` is redacted before storage (see :mod:`apps.administration.audit`); secrets
    such as ICCIDs, activation codes and QR payloads must never reach this table.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="audit_events",
    )
    # Denormalised so the trail survives account deletion.
    actor_email = models.CharField(max_length=254, blank=True, default="")
    actor_type = models.CharField(max_length=20, default="system")

    organization = models.ForeignKey(
        "accounts.Organization", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="audit_events",
    )

    action = models.CharField(max_length=80)
    object_type = models.CharField(max_length=80, blank=True, default="")
    object_id = models.UUIDField(null=True, blank=True)
    object_repr = models.CharField(max_length=240, blank=True, default="")

    changes = models.JSONField(default=dict, blank=True)
    context = models.JSONField(default=dict, blank=True)

    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True, default="")
    correlation_id = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = "audit_events"
        ordering = ("-created_at",)
        constraints = [
            models.CheckConstraint(
                name="audit_actor_type_valid",
                condition=models.Q(actor_type__in=ACTOR_TYPES),
            ),
        ]
        indexes = [
            models.Index(fields=["organization", "-created_at"]),
            models.Index(fields=["action", "-created_at"]),
            models.Index(fields=["object_type", "object_id"]),
            models.Index(fields=["actor", "-created_at"]),
        ]

    def __str__(self):
        return f"{self.action} by {self.actor_email or 'system'} at {self.created_at:%Y-%m-%d %H:%M}"
