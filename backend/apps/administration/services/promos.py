"""Discount promo codes — the kind that actually reduces what a customer pays.

Not to be confused with the other kind. `PromoCode` carries two, separated
structurally rather than by convention:

* ``tracking`` — an agency referral code. The customer pays FULL price; the code only
  attributes the sale so commission can be earned. Issued per-agency by
  :func:`apps.accounts.services.create_agency_tracking_code`, and pinned to
  ``discount_value=0`` by the ``promo_tracking_has_no_discount`` database constraint.
* ``discount`` — this module. Reduces the price.

Keeping the two creation paths apart is what makes that constraint meaningful: neither
function can accidentally produce the other's shape, so a tracking code can never grow a
discount and a discount code can never quietly claim commission from an agency.

PERCENT VS BASIS POINTS. The column is ``discount_value`` in basis points, because
integer bps avoids the rounding drift a float percentage introduces once it is multiplied
by a subtotal. Operators think in percent. The conversion happens once, here and in the
serializer, and never in a template or a component.

CODES ARE NOT DELETED. ``PromoRedemption.promo_code`` is ``on_delete=PROTECT``, so a code
that has ever been used cannot be removed — and removing one that has been used would
destroy the record of why an old order was discounted. Retiring a code is
``is_active=False``, which :func:`apps.orders.services._check_promo` refuses at checkout.
"""

from django.db import transaction

from apps.administration.audit import record_audit
from apps.orders.models import PromoCode

MAX_BPS = 10000  # 100%


def percent_to_bps(percent):
    """10 -> 1000. Rounded to the nearest basis point, so 12.345% becomes 12.35%."""
    return int(round(float(percent) * 100))


def bps_to_percent(bps):
    """1000 -> 10.0. The inverse, for display."""
    return round((bps or 0) / 100, 2)


def _validate_bps(bps):
    if not 0 < bps <= MAX_BPS:
        raise ValueError("Discount must be greater than 0% and at most 100%.")


@transaction.atomic
def create_discount_promo_code(
    *, code, percent_off, usage_limit=None, per_customer_limit=None,
    ends_at=None, starts_at=None, actor=None, request=None,
):
    """Mint a percentage-off code. Always ``kind="discount"`` with no organization.

    `organization` stays null deliberately. Attaching one would trip
    ``promo_agency_requires_commission`` unless commission fields were also set, and a
    discount code that pays an agency commission is a different product decision that
    nobody has asked for — it would quietly cost margin twice on the same sale.
    """
    bps = percent_to_bps(percent_off)
    _validate_bps(bps)

    promo = PromoCode.objects.create(
        kind="discount",
        code=code,
        organization=None,
        discount_type="percentage_bps",
        discount_value=bps,
        # No `discount_currency`: it is required only for `fixed` codes
        # (`promo_fixed_requires_currency`), and a percentage applies in any currency.
        usage_limit=usage_limit,
        per_customer_limit=per_customer_limit,
        starts_at=starts_at,
        ends_at=ends_at,
        is_active=True,
    )
    record_audit(
        action="promo_code.created",
        obj=promo,
        actor=actor,
        request=request,
        changes={
            "code": promo.code,
            "percent_off": bps_to_percent(bps),
            "usage_limit": usage_limit,
        },
    )
    return promo


@transaction.atomic
def update_discount_promo_code(promo, *, actor=None, request=None, **changes):
    """Edit a discount code's terms.

    The code string and the kind are NOT editable. A code that has been shared is an
    identifier people already hold; renaming it silently breaks every link and poster
    carrying it, while leaving the redemptions pointing at a name that no longer exists.
    Retire it and mint a new one instead.

    Changing `percent_off` affects only FUTURE orders. Past orders store their own
    `discount_minor` and `promo_code_snapshot`, so history stays truthful.
    """
    fields = []
    applied = {}

    if "percent_off" in changes and changes["percent_off"] is not None:
        bps = percent_to_bps(changes["percent_off"])
        _validate_bps(bps)
        promo.discount_value = bps
        fields.append("discount_value")
        applied["percent_off"] = bps_to_percent(bps)

    for name in ("usage_limit", "per_customer_limit", "starts_at", "ends_at", "is_active"):
        if name in changes:
            setattr(promo, name, changes[name])
            fields.append(name)
            applied[name] = changes[name]

    if fields:
        promo.save(update_fields=fields)
        record_audit(
            action="promo_code.updated",
            obj=promo,
            actor=actor,
            request=request,
            changes=applied,
        )
    return promo
