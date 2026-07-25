from django.db import transaction
from django.utils import timezone

from .models import CommissionPayout, PartnerCommission


def create_commission_for_order(order):
    org = order.referring_organization
    promo = order.promo_code
    if org is None or promo is None:
        return None
    if not promo.commission_type or promo.commission_value is None:
        return None

    commissionable = max(order.subtotal_minor - order.discount_minor, 0)
    if promo.commission_type == "percentage_bps":
        commission = commissionable * promo.commission_value // 10000
    else:
        if promo.commission_currency and promo.commission_currency != order.currency:
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
            "currency": order.currency,
            "status": "pending",
        },
    )
    return obj


def reverse_commission_for_order(order, refunded_minor):
    if order.subtotal_minor <= 0 or refunded_minor <= 0:
        return
    commission = PartnerCommission.objects.select_for_update().filter(order=order).first()
    if commission is None:
        return
    reverse = commission.commission_minor * refunded_minor // order.subtotal_minor
    reverse = min(reverse, commission.commission_minor - commission.reversed_minor)
    if reverse <= 0:
        return
    commission.reversed_minor += reverse
    if commission.reversed_minor >= commission.commission_minor:
        commission.status = "reversed"
    commission.save(update_fields=["reversed_minor", "status", "updated_at"])


def approve_commission(commission):
    if commission.status in ("pending", "available"):
        commission.status = "approved"
        commission.approved_at = timezone.now()
        commission.save(update_fields=["status", "approved_at", "updated_at"])
    return commission


def create_payout(organization, *, period_start, period_end, currency="USD"):
    with transaction.atomic():
        commissions = list(
            PartnerCommission.objects.select_for_update().filter(
                organization=organization,
                status="approved",
                payout__isnull=True,
                currency=currency,
            )
        )
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
        return payout


def mark_payout_paid(payout):
    with transaction.atomic():
        payout = CommissionPayout.objects.select_for_update().get(pk=payout.pk)
        payout.status = "paid"
        payout.paid_at = timezone.now()
        payout.save(update_fields=["status", "paid_at", "updated_at"])
        payout.commissions.update(status="paid", paid_at=timezone.now())
    return payout
