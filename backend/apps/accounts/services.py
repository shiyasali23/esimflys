from django.db import transaction
from django.utils import timezone

from apps.administration.audit import record_audit
from apps.common.exceptions import Conflict

from .models import CommissionPayout, Organization, PartnerCommission


def create_commission_for_order(order):
    if order.referring_organization_id is None:
        return None
    # Read the organization fresh rather than trusting ``order.referring_organization``:
    # that descriptor may be a cached relation loaded earlier in a long transaction, and a
    # financial gate must not depend on how the caller happened to load the order.
    org = Organization.objects.filter(pk=order.referring_organization_id).first()
    promo = order.promo_code
    if org is None or promo is None:
        return None
    if not promo.commission_type or promo.commission_value is None:
        return None
    if not org.is_operational:
        # A suspended, pending or closed agency must not accrue commission. Recorded so the
        # withheld amount is visible to finance rather than silently vanishing.
        record_audit(
            action="commission.withheld_inactive_organization",
            organization=org,
            obj=order,
            actor_type="system",
            context={"organization_status": org.status, "order_number": order.order_number},
        )
        return None

    # Commission is always computed and paid in the platform's base currency, never in
    # whatever the traveller happened to pay in. An agency's 20% must not move because a
    # customer chose rupees, and month-end payouts have to be summable across orders.
    # base_* is populated for every order, including the USD ones backfilled by migration.
    base_currency = order.base_currency or order.currency
    if order.base_total_minor is not None:
        # base_total_minor is stored as (base subtotal - base discount), which is exactly
        # the commissionable amount, already in the base currency.
        commissionable = max(order.base_total_minor, 0)
    else:
        commissionable = max(order.subtotal_minor - order.discount_minor, 0)
    if promo.commission_type == "percentage_bps":
        commission = commissionable * promo.commission_value // 10000
    else:
        if promo.commission_currency and promo.commission_currency != base_currency:
            return None
        commission = promo.commission_value
    commission = min(commission, commissionable)

    obj, _ = PartnerCommission.objects.get_or_create(
        organization=org,
        order=order,
        defaults={
            "promo_code": promo,
            "commission_type": promo.commission_type,
            "commission_value_snapshot": promo.commission_value,
            "commissionable_minor": commissionable,
            "commission_minor": commission,
            "reversed_minor": 0,
            "currency": base_currency,
            "status": "pending",
        },
    )
    return obj


#: Default agency commission: 20% of the amount billed, in basis points.
DEFAULT_COMMISSION_BPS = 2000


def is_agency_account(*, user=None, email=None):
    """Whether an account belongs to a travel agency.

    Agency credentials are issued by the platform and cannot be self-managed, so these
    accounts are excluded from social login and from self-service password reset.

    Only an *active* membership counts. Counting every historical row would let one agency
    permanently strip Google login and password reset from any email it had ever added —
    a lock the customer could not undo even after being removed from the organisation.
    """
    from .models import OrganizationMember

    queryset = OrganizationMember.objects.filter(status="active")
    if user is not None and getattr(user, "pk", None):
        return queryset.filter(user=user).exists()
    if email:
        return queryset.filter(user__email__iexact=email.strip()).exists()
    return False


def create_agency_tracking_code(
    organization, *, code, commission_bps=DEFAULT_COMMISSION_BPS, actor=None,
    usage_limit=None, ends_at=None,
):
    """Issue a referral tracking code to a travel agency.

    The customer pays full price — the code exists purely to attribute the sale so the
    agency earns commission. Creating codes through this helper (rather than by hand)
    guarantees the zero-discount and organization invariants and records who issued it.
    """
    from apps.orders.models import PromoCode

    if not 0 < commission_bps <= 10000:
        raise ValueError("commission_bps must be between 1 and 10000 (100%).")

    with transaction.atomic():
        promo = PromoCode.objects.create(
            kind="tracking",
            code=code,
            organization=organization,
            discount_type="percentage_bps",
            discount_value=0,
            commission_type="percentage_bps",
            commission_value=commission_bps,
            usage_limit=usage_limit,
            ends_at=ends_at,
            is_active=True,
        )
        record_audit(
            action="promo_code.tracking_issued",
            actor=actor,
            organization=organization,
            obj=promo,
            changes={"code": code, "commission_bps": commission_bps},
        )
        return promo


def reverse_commission_for_order(order, refunded_minor):
    """Reverse commission in proportion to what was refunded.

    The denominator must be the amount actually charged, not the pre-discount subtotal.
    Commission accrues on the post-discount figure (``base_total_minor`` above), so dividing
    by ``subtotal_minor`` under-reverses by exactly the discount ratio: a fully refunded
    $100 cart with 20% off and 20% commission reversed only $12.80 of $16.00. The remaining
    $3.20 stayed ``pending``, which is inside APPROVABLE_COMMISSION_STATES, so it was still
    payable — real money leaving on a fully refunded order.

    ``refunded_minor`` and ``total_minor`` are both in the charge currency, so the ratio is
    dimensionless and applies cleanly to a base-currency commission.
    """
    if order.total_minor <= 0 or refunded_minor <= 0:
        return
    commission = PartnerCommission.objects.select_for_update().filter(order=order).first()
    if commission is None:
        return
    reverse = commission.commission_minor * refunded_minor // order.total_minor
    reverse = min(reverse, commission.commission_minor - commission.reversed_minor)
    if reverse <= 0:
        return
    commission.reversed_minor += reverse
    if commission.reversed_minor >= commission.commission_minor:
        commission.status = "reversed"
    commission.save(update_fields=["reversed_minor", "status", "updated_at"])


#: Commission states that may still be approved. A reversed or cancelled commission never
#: becomes payable again — the refund already happened.
APPROVABLE_COMMISSION_STATES = ("pending", "available")


class CommissionNotApprovable(Conflict):
    error_code = "commission_not_approvable"
    default_message = "This commission can no longer be approved."


class NothingToPayOut(Conflict):
    error_code = "nothing_to_pay_out"
    default_message = "There are no approved commissions for that period."


class PayoutAlreadyPaid(Conflict):
    error_code = "payout_already_paid"
    default_message = "This payout has already been paid."


def approve_commission(commission, *, actor=None, request=None):
    """Approve one commission for payout.

    Review-first by design: commissions accrue as ``pending`` and only a human approval
    makes them payable, which gives a window to catch refunds and disputes first.
    """
    with transaction.atomic():
        commission = PartnerCommission.objects.select_for_update().get(pk=commission.pk)
        if commission.status not in APPROVABLE_COMMISSION_STATES:
            raise CommissionNotApprovable(
                message=f"A commission in state '{commission.status}' cannot be approved."
            )
        if commission.commission_minor - commission.reversed_minor <= 0:
            raise CommissionNotApprovable(
                message="This commission has been fully reversed by refunds."
            )

        previous = commission.status
        commission.status = "approved"
        commission.approved_at = timezone.now()
        commission.save(update_fields=["status", "approved_at", "updated_at"])
        record_audit(
            action="commission.approved",
            actor=actor,
            organization=commission.organization,
            obj=commission,
            changes={"status": [previous, "approved"]},
            context={
                "net_minor": commission.commission_minor - commission.reversed_minor,
                "order_id": str(commission.order_id),
            },
            request=request,
        )
        return commission


def create_payout(organization, *, period_start, period_end, currency="USD",
                  actor=None, request=None):
    """Group an agency's approved commissions **for one period** into a draft payout.

    The period filter matters: without it a January payout would sweep up commissions
    earned in February, paying an agency for work that belongs to the next cycle.
    Commissions are matched on the date the commission was created.
    """
    with transaction.atomic():
        commissions = list(
            PartnerCommission.objects.select_for_update().filter(
                organization=organization,
                status="approved",
                payout__isnull=True,
                currency=currency,
                created_at__date__gte=period_start,
                created_at__date__lte=period_end,
            )
        )
        if not commissions:
            raise NothingToPayOut()

        net = sum(c.commission_minor - c.reversed_minor for c in commissions)
        payout = CommissionPayout.objects.create(
            organization=organization,
            currency=currency,
            amount_minor=max(net, 0),
            status="draft",
            period_start=period_start,
            period_end=period_end,
        )
        PartnerCommission.objects.filter(id__in=[c.id for c in commissions]).update(
            payout=payout
        )
        record_audit(
            action="payout.created",
            actor=actor,
            organization=organization,
            obj=payout,
            changes={"amount_minor": [None, payout.amount_minor]},
            context={
                "period": f"{period_start}..{period_end}",
                "commission_count": len(commissions),
            },
            request=request,
        )
        return payout


def mark_payout_paid(payout, *, actor=None, reference=None, method=None, request=None):
    """Record that an agency has actually been paid.

    Guarded against double payment — money leaving twice is the expensive mistake here.
    """
    with transaction.atomic():
        payout = CommissionPayout.objects.select_for_update().get(pk=payout.pk)
        if payout.status == "paid":
            raise PayoutAlreadyPaid()
        if payout.status in ("cancelled", "failed"):
            raise PayoutAlreadyPaid(
                message=f"A payout in state '{payout.status}' cannot be paid."
            )

        previous = payout.status
        payout.status = "paid"
        payout.paid_at = timezone.now()
        if reference:
            payout.external_reference = reference
        if method:
            payout.payment_method = method
        payout.save(
            update_fields=[
                "status", "paid_at", "external_reference", "payment_method", "updated_at",
            ]
        )
        payout.commissions.update(status="paid", paid_at=timezone.now())
        record_audit(
            action="payout.paid",
            actor=actor,
            organization=payout.organization,
            obj=payout,
            changes={"status": [previous, "paid"]},
            context={
                "amount_minor": payout.amount_minor,
                "reference": reference or "",
                "commission_count": payout.commissions.count(),
            },
            request=request,
        )
        return payout
