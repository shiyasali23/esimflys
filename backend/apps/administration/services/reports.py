"""Aggregation for platform and agency dashboards.

Two rules govern this module:

1. **Bounded queries.** Every figure comes from a database aggregate, never a Python loop
   over rows. Dashboards are the first thing to degrade as volume grows, so the tests pin
   the query count.
2. **Margin is platform-only.** ``retail − wholesale`` is the platform's own economics.
   :func:`platform_dashboard` exposes it behind an explicit flag; no agency-scoped function
   in this module touches a wholesale column.
"""

from django.db.models import Count, DecimalField, F, Q, Sum
from django.db.models.functions import Coalesce, TruncDate

from apps.accounts.models import CommissionPayout, PartnerCommission
from apps.esims.models import EsimProfile, SupplierEvent
from apps.orders.models import Notification, Order, OrderItem
from apps.payments.models import Payment, Refund, WebhookEvent

#: Payment states that mean money was actually collected at some point.
SETTLED_PAYMENT_STATES = ("paid", "partially_refunded", "refunded")

#: eSIMs a customer can currently use.
LIVE_ESIM_STATES = ("ready", "installed", "active")

#: Commission that is owed but not yet paid out.
OUTSTANDING_COMMISSION_STATES = ("pending", "available", "approved")


def _zero_sum(field):
    return Coalesce(Sum(field), 0)


def _date_filter(queryset, field, date_from=None, date_to=None):
    if date_from:
        queryset = queryset.filter(**{f"{field}__gte": date_from})
    if date_to:
        queryset = queryset.filter(**{f"{field}__lte": date_to})
    return queryset


def platform_dashboard(*, date_from=None, date_to=None, include_margin=False):
    """Headline operational figures for the platform owner.

    ``include_margin`` must only be set for a caller holding a platform capability —
    wholesale cost must never reach an agency.
    """
    orders = _date_filter(Order.objects.all(), "created_at", date_from, date_to)
    settled = orders.filter(payment_status__in=SETTLED_PAYMENT_STATES)

    order_totals = settled.aggregate(
        gross_revenue_minor=_zero_sum("total_minor"),
        paid_order_count=Count("id"),
    )
    refunded = _date_filter(
        Refund.objects.filter(status="succeeded"), "created_at", date_from, date_to
    ).aggregate(total=_zero_sum("amount_minor"))["total"]

    status_breakdown = {
        row["status"]: row["count"]
        for row in orders.values("status").annotate(count=Count("id")).order_by()
    }
    payment_breakdown = {
        row["payment_status"]: row["count"]
        for row in orders.values("payment_status").annotate(count=Count("id")).order_by()
    }

    esims = EsimProfile.objects.aggregate(
        total=Count("id"),
        live=Count("id", filter=Q(status__in=LIVE_ESIM_STATES)),
        failed=Count("id", filter=Q(status__in=("failed", "manual_review"))),
    )

    # NB: aggregate aliases must not shadow a field name they also reference — Django
    # raises "'x' is an aggregate" when it resolves the alias before the expression.
    commission_totals = PartnerCommission.objects.aggregate(
        outstanding_total=Coalesce(
            Sum(
                F("commission_minor") - F("reversed_minor"),
                filter=Q(status__in=OUTSTANDING_COMMISSION_STATES),
            ),
            0,
        ),
        paid_total=Coalesce(
            Sum(F("commission_minor") - F("reversed_minor"), filter=Q(status="paid")), 0
        ),
        reversed_total=_zero_sum("reversed_minor"),
    )
    commissions = {
        "outstanding_minor": commission_totals["outstanding_total"],
        "paid_minor": commission_totals["paid_total"],
        "reversed_minor": commission_totals["reversed_total"],
    }

    operations = {
        "supplier_jobs_pending": SupplierEvent.objects.filter(
            status__in=("pending", "retrying", "processing")
        ).count(),
        "supplier_jobs_manual_review": SupplierEvent.objects.filter(
            status="manual_review"
        ).count(),
        "notifications_failed": Notification.objects.filter(
            status__in=("failed", "retrying")
        ).count(),
        "webhooks_rejected": WebhookEvent.objects.filter(status="rejected").count(),
    }

    gross = order_totals["gross_revenue_minor"]
    result = {
        "currency": "USD",
        "revenue": {
            "gross_minor": gross,
            "refunded_minor": refunded,
            "net_minor": gross - refunded,
        },
        "orders": {
            "total": orders.count(),
            "paid": order_totals["paid_order_count"],
            "by_status": status_breakdown,
            "by_payment_status": payment_breakdown,
        },
        "esims": esims,
        "commissions": commissions,
        "operations": operations,
    }

    if include_margin:
        margin = OrderItem.objects.filter(
            order__payment_status__in=SETTLED_PAYMENT_STATES,
            wholesale_amount_minor__isnull=False,
        ).aggregate(
            retail_minor=_zero_sum("unit_amount_minor"),
            wholesale_minor=_zero_sum("wholesale_amount_minor"),
        )
        result["margin"] = {
            "retail_minor": margin["retail_minor"],
            "wholesale_minor": margin["wholesale_minor"],
            "margin_minor": margin["retail_minor"] - margin["wholesale_minor"],
        }
    return result


def revenue_timeseries(*, date_from=None, date_to=None, limit=90):
    """Daily settled revenue, newest last. Bounded by ``limit`` days."""
    queryset = _date_filter(
        Order.objects.filter(payment_status__in=SETTLED_PAYMENT_STATES),
        "created_at", date_from, date_to,
    )
    rows = (
        queryset.annotate(day=TruncDate("created_at"))
        .values("day")
        .annotate(revenue_minor=_zero_sum("total_minor"), orders=Count("id"))
        .order_by("-day")[:limit]
    )
    return list(reversed([
        {"date": row["day"].isoformat(), "revenue_minor": row["revenue_minor"],
         "orders": row["orders"]}
        for row in rows
    ]))


def agency_dashboard(organization, *, date_from=None, date_to=None):
    """Figures an agency may see about its **referred** sales.

    Deliberately contains no customer identity and no wholesale cost: these are the
    platform's retail customers who merely used the agency's tracking code.
    """
    orders = _date_filter(
        Order.objects.for_agency_referral(organization).filter(
            payment_status__in=SETTLED_PAYMENT_STATES
        ),
        "created_at", date_from, date_to,
    )
    order_totals = orders.aggregate(
        attributed_sales_minor=_zero_sum("total_minor"),
        order_count=Count("id"),
    )

    # Aliases are suffixed `_total` so they never shadow the fields they reference.
    commission_totals = PartnerCommission.objects.filter(
        organization=organization
    ).aggregate(
        earned_total=_zero_sum("commission_minor"),
        reversed_total=_zero_sum("reversed_minor"),
        outstanding_total=Coalesce(
            Sum(
                F("commission_minor") - F("reversed_minor"),
                filter=Q(status__in=OUTSTANDING_COMMISSION_STATES),
            ),
            0,
        ),
        paid_total=Coalesce(
            Sum(F("commission_minor") - F("reversed_minor"), filter=Q(status="paid")), 0
        ),
    )
    payouts = CommissionPayout.objects.filter(organization=organization).aggregate(
        paid_out_minor=Coalesce(Sum("amount_minor", filter=Q(status="paid")), 0),
        payout_count=Count("id"),
    )

    return {
        "currency": "USD",
        "attributed_sales": {
            "order_count": order_totals["order_count"],
            "total_minor": order_totals["attributed_sales_minor"],
        },
        "commissions": {
            "earned_minor": commission_totals["earned_total"],
            "reversed_minor": commission_totals["reversed_total"],
            "outstanding_minor": commission_totals["outstanding_total"],
            "paid_minor": commission_totals["paid_total"],
        },
        "payouts": payouts,
    }


def agency_revenue_timeseries(organization, *, limit=90):
    """Daily attributed sales + commission for one agency."""
    rows = (
        Order.objects.for_agency_referral(organization)
        .filter(payment_status__in=SETTLED_PAYMENT_STATES)
        .annotate(day=TruncDate("created_at"))
        .values("day")
        .annotate(sales_minor=_zero_sum("total_minor"), orders=Count("id"))
        .order_by("-day")[:limit]
    )
    return list(reversed([
        {"date": row["day"].isoformat(), "sales_minor": row["sales_minor"],
         "orders": row["orders"]}
        for row in rows
    ]))
