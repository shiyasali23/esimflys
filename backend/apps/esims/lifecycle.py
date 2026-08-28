"""Turn the supplier's status words into ours, and into the timestamps support needs.

WHY THIS EXISTS. `EsimProfile` has carried `installed_at`, `activated_at` and
`expires_at` since the first migration, and the admin panel has always serialized them.
Nothing ever wrote them. Every profile in production sits at `status="ready"` with all
three NULL and a full data balance, including one we know consumed 382 MB. So the panel
could not answer whether an eSIM was installed, whether it was activated, when it
expires, or how much data is left — the four questions support is actually asked.

The supplier told us all of it and we discarded it. `/esim/query` and `/esim/usage/query`
both return `smdpStatus`, `esimStatus` and `expiredTime`; the redactor even keeps them,
so they were sitting in `supplier_payload_redacted` as JSON while the typed columns
stayed empty.

THE VOCABULARY is not guessed. It was read off a real order during a support
investigation and is recorded in `confirmation-view.client.jsx`: a customer's iPhone 13
sat at `smdpStatus: INSTALLATION` with `activateTime: -` and zero usage, then moved to
`smdpStatus: ENABLED, esimStatus: IN_USE` with 382 MB used once Data Roaming was turned
on.

    smdpStatus   RELEASED ──► INSTALLATION ──► ENABLED
                 issued        on the device     line switched on
    esimStatus   GOT_RESOURCE ─────────────────► IN_USE

TWO RULES, both about not lying:

1. An unknown status NEVER changes anything. Suppliers add states; a mapper that
   collapses anything it does not recognise into "ready" would quietly walk a live eSIM
   backwards and tell support the customer never installed it.

2. Lifecycle only moves FORWARD. `installed_at` and `activated_at` are stamped once, on
   the first observation that implies them, and never cleared. Usage polling is a
   snapshot of a lagging remote system; a transient blank reply must not erase the fact
   that an eSIM was once seen active.
"""

from django.utils import timezone

#: smdpStatus values that mean the profile is on a device.
INSTALLED_SMDP = frozenset({"INSTALLATION", "ENABLED", "DISABLED"})

#: smdpStatus values that mean the line has been switched on at least once.
ACTIVE_SMDP = frozenset({"ENABLED"})

#: esimStatus values that mean data has started flowing.
ACTIVE_ESIM = frozenset({"IN_USE"})

#: esimStatus values that mean the plan is over. `USED_UP` is allowance exhausted,
#: `USED_EXPIRED` is validity elapsed — both are terminal for the customer.
FINISHED_ESIM = frozenset({"USED_UP", "USED_EXPIRED", "EXPIRED"})

#: Terminal states that are not "the customer used it up".
CANCELLED_ESIM = frozenset({"CANCEL", "CANCELLED", "REVOKED", "DELETED"})

#: Our own states this module is allowed to move a profile out of. Anything else —
#: `failed`, `manual_review`, `cancelled` — was set deliberately by provisioning or by an
#: operator, and a usage poll must not overwrite that judgement.
MOVABLE = frozenset({"ready", "installed", "active", "expired"})


def derive_status(*, smdp_status, esim_status, current):
    """Our status for this pair of supplier words, or ``current`` if they say nothing new.

    Ordered most-terminal first: an eSIM that is both ENABLED and USED_UP is finished,
    not active.
    """
    if current not in MOVABLE:
        return current

    smdp = (smdp_status or "").upper()
    esim = (esim_status or "").upper()

    if esim in CANCELLED_ESIM or smdp in CANCELLED_ESIM:
        return "cancelled"
    if esim in FINISHED_ESIM:
        return "expired"
    if smdp in ACTIVE_SMDP or esim in ACTIVE_ESIM:
        return "active"
    if smdp in INSTALLED_SMDP:
        return "installed"
    return current


def apply_supplier_state(profile, state, *, now=None):
    """Fold one supplier reading into ``profile`` and return the changed field names.

    Returns a list rather than saving, so the caller decides the transaction and can pass
    it straight to ``save(update_fields=...)``. An empty list means the reading told us
    nothing new and no write is needed.
    """
    now = now or timezone.now()
    changed = []

    def put(field, value):
        if value is not None and getattr(profile, field) != value:
            setattr(profile, field, value)
            changed.append(field)

    put("smdp_status", state.get("smdp_status"))
    put("esim_status", state.get("esim_status"))
    put("total_data_bytes", state.get("total_data_bytes"))
    put("remaining_data_bytes", state.get("remaining_data_bytes"))
    put("expires_at", state.get("expires_at"))

    smdp = (state.get("smdp_status") or "").upper()
    esim = (state.get("esim_status") or "").upper()

    # Stamped once, never re-stamped and never cleared — see rule 2.
    if profile.installed_at is None and (
        smdp in INSTALLED_SMDP or smdp in ACTIVE_SMDP or esim in ACTIVE_ESIM
    ):
        profile.installed_at = now
        changed.append("installed_at")

    if profile.activated_at is None and (smdp in ACTIVE_SMDP or esim in ACTIVE_ESIM):
        profile.activated_at = now
        changed.append("activated_at")

    status = derive_status(
        smdp_status=state.get("smdp_status"),
        esim_status=state.get("esim_status"),
        current=profile.status,
    )
    if status != profile.status:
        profile.status = status
        changed.append("status")

    if changed:
        profile.last_synced_at = now
        changed.append("last_synced_at")
    return changed
