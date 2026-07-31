"""Month-end payout run for travel agencies.

Agencies earn 20% commission on the bookings their tracking code attracts and redeem
monthly. This command gathers each agency's **already-approved** commissions for one
calendar month into a draft payout.

It deliberately does **not** approve anything. Approval is a human review step so that
refunds and disputes can be caught before money leaves — this command only packages what
a reviewer has already signed off.
"""

import calendar
from datetime import date, timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db.models import Count, Q

from apps.accounts.models import CommissionPayout, Organization
from apps.accounts.services import NothingToPayOut, create_payout


def month_bounds(year, month):
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last_day)


def previous_month(today=None):
    today = today or date.today()
    last_of_previous = today.replace(day=1) - timedelta(days=1)
    return last_of_previous.year, last_of_previous.month


class Command(BaseCommand):
    help = (
        "Create draft monthly payouts from approved commissions. Defaults to last month. "
        "Does not approve anything — approval is a separate review step."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--month", default=None,
            help="Month to settle as YYYY-MM. Defaults to the previous calendar month.",
        )
        parser.add_argument("--currency", default="USD")
        parser.add_argument(
            "--dry-run", action="store_true",
            help="Report what would be created without writing anything.",
        )

    def handle(self, *args, **options):
        if options["month"]:
            try:
                year, month = (int(part) for part in options["month"].split("-", 1))
                period_start, period_end = month_bounds(year, month)
            except (ValueError, calendar.IllegalMonthError) as exc:
                raise CommandError(f"--month must look like 2026-07 ({exc})") from exc
        else:
            period_start, period_end = month_bounds(*previous_month())

        currency = options["currency"]
        dry_run = options["dry_run"]

        self.stdout.write(
            self.style.MIGRATE_HEADING(
                f"\nMonthly payouts {period_start} .. {period_end} ({currency})"
                + (" [DRY RUN]" if dry_run else "")
            )
        )

        agencies = (
            Organization.objects.filter(status="active")
            .annotate(
                approved_count=Count(
                    "commissions",
                    filter=Q(
                        commissions__status="approved",
                        commissions__payout__isnull=True,
                        commissions__currency=currency,
                        commissions__created_at__date__gte=period_start,
                        commissions__created_at__date__lte=period_end,
                    ),
                )
            )
            .order_by("name")
        )

        created = skipped = 0
        total_minor = 0

        for agency in agencies:
            if not agency.approved_count:
                continue

            # Idempotency: a payout for this agency and period already exists.
            if CommissionPayout.objects.filter(
                organization=agency, period_start=period_start, period_end=period_end,
                currency=currency,
            ).exists():
                self.stdout.write(f"  - {agency.name}: payout already exists, skipped")
                skipped += 1
                continue

            if dry_run:
                self.stdout.write(
                    f"  + {agency.name}: would settle {agency.approved_count} commission(s)"
                )
                created += 1
                continue

            try:
                payout = create_payout(
                    agency, period_start=period_start, period_end=period_end,
                    currency=currency,
                )
            except NothingToPayOut:
                continue
            created += 1
            total_minor += payout.amount_minor
            self.stdout.write(
                f"  + {agency.name}: ${payout.amount_minor / 100:,.2f} "
                f"({agency.approved_count} commission(s)) -> draft payout {payout.id}"
            )

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                f"  {created} payout(s) {'to create' if dry_run else 'created'}, "
                f"{skipped} skipped, total ${total_minor / 100:,.2f}"
            )
        )
        if not dry_run and created:
            self.stdout.write(
                self.style.WARNING(
                    "  Payouts are in 'draft'. Mark each one paid once the money is sent."
                )
            )
