"""Audit recording with mandatory redaction.

Design notes
------------
*Atomicity.* :func:`record_audit` writes in the caller's transaction. If the audit insert
fails the surrounding action rolls back, so the trail can never silently diverge from the
data. Callers must therefore not wrap it in a bare ``except``.

*Redaction is not optional.* The eSIM domain stores activation credentials, and a naive
field diff over :class:`~apps.esims.models.EsimProfile` would copy plaintext secrets into
``audit_events``. Every value passing through here is filtered by
:func:`redact`, which masks by field name **and** by value type (raw ``bytes`` are never
stored). Audit the *action*, never the credential.
"""

import logging
import uuid
from decimal import Decimal

from django.db import models

from .models import AuditEvent

logger = logging.getLogger("apps.administration.audit")

REDACTED = "***redacted***"

#: Substrings that mark a field as secret. Matched case-insensitively against field names.
SENSITIVE_NAME_PARTS = (
    "password",
    "token",
    "secret",
    "api_key",
    "apikey",
    "signature",
    "authorization",
    "cookie",
    "session",
    "iccid",
    "activation_code",
    "qr_payload",
    "smdp",
    "credential",
    "encrypted",
    "hash",
    "client_secret",
)

#: Fields that are noise in a diff and never worth storing.
IGNORED_FIELD_NAMES = ("created_at", "updated_at", "last_login")

MAX_VALUE_LENGTH = 500


def is_sensitive(field_name):
    """Return ``True`` when a field name indicates secret content."""
    name = str(field_name).lower()
    return any(part in name for part in SENSITIVE_NAME_PARTS)


def _scalar(value):
    """Coerce a value into something JSON-serialisable and bounded in size."""
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, (bytes, bytearray, memoryview)):
        # Binary columns are ciphertext or hashes — never stored, even if the name misses.
        return REDACTED
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, models.Model):
        return str(value.pk)
    text = str(value)
    if len(text) > MAX_VALUE_LENGTH:
        return text[:MAX_VALUE_LENGTH] + "…"
    return text


def redact(data):
    """Recursively redact secrets from a dict/list/scalar structure."""
    if isinstance(data, dict):
        cleaned = {}
        for key, value in data.items():
            if is_sensitive(key):
                cleaned[key] = REDACTED
            else:
                cleaned[key] = redact(value)
        return cleaned
    if isinstance(data, (list, tuple)):
        return [redact(item) for item in data]
    return _scalar(data)


def model_snapshot(instance, fields=None):
    """Capture a redacted snapshot of a model's concrete field values."""
    if instance is None:
        return {}
    snapshot = {}
    for field in instance._meta.concrete_fields:
        name = field.name
        if name in IGNORED_FIELD_NAMES:
            continue
        if fields is not None and name not in fields:
            continue
        if is_sensitive(name):
            snapshot[name] = REDACTED
            continue
        snapshot[name] = _scalar(getattr(instance, field.attname, None))
    return snapshot


def diff(before, after):
    """Return ``{field: [before, after]}`` for changed, non-secret fields.

    ``before``/``after`` are snapshots from :func:`model_snapshot`. Fields whose values are
    redacted on both sides are dropped entirely: recording ``["***redacted***",
    "***redacted***"]`` conveys nothing and only invites someone to "improve" it later by
    storing the real values.
    """
    before = before or {}
    after = after or {}
    changed = {}
    for key in set(before) | set(after):
        old, new = before.get(key), after.get(key)
        if old == new:
            continue
        if old == REDACTED and new == REDACTED:
            continue
        changed[key] = [old, new]
    return changed


def _client_ip(request):
    if request is None:
        return None
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded:
        return forwarded.split(",")[0].strip() or None
    return request.META.get("REMOTE_ADDR") or None


def _actor_type_for(user, organization):
    if user is None or not getattr(user, "is_authenticated", False):
        return "system"
    if getattr(user, "is_staff", False) or getattr(user, "is_superuser", False):
        return "platform"
    if organization is not None:
        return "agency"
    return "customer"


def record_audit(
    *,
    action,
    actor=None,
    organization=None,
    obj=None,
    changes=None,
    context=None,
    request=None,
    actor_type=None,
    correlation_id=None,
):
    """Write one immutable audit row. Returns the created :class:`AuditEvent`.

    Runs in the caller's transaction on purpose — see the module docstring.
    """
    if actor is None and request is not None:
        candidate = getattr(request, "user", None)
        if candidate is not None and getattr(candidate, "is_authenticated", False):
            actor = candidate

    object_type = obj.__class__.__name__ if obj is not None else ""
    object_id = getattr(obj, "pk", None) if obj is not None else None
    if not isinstance(object_id, uuid.UUID):
        object_id = None
    object_repr = _scalar(str(obj))[:240] if obj is not None else ""

    event = AuditEvent.objects.create(
        actor=actor,
        actor_email=(getattr(actor, "email", "") or "")[:254],
        actor_type=actor_type or _actor_type_for(actor, organization),
        organization=organization,
        action=action,
        object_type=object_type,
        object_id=object_id,
        object_repr=object_repr,
        changes=redact(changes or {}),
        context=redact(context or {}),
        ip_address=_client_ip(request),
        user_agent=(request.META.get("HTTP_USER_AGENT", "") if request else "")[:1000],
        correlation_id=correlation_id,
    )
    logger.info(
        "audit action=%s actor=%s org=%s object=%s:%s",
        action, event.actor_email or "system", organization.pk if organization else None,
        object_type, object_id,
    )
    return event
