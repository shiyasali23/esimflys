from django.core.management.base import BaseCommand

from apps.administration.audit import record_audit
from apps.esims.supplier import SupplierError, get_supplier_gateway

#: Below this the platform risks failing live orders with supplier error 200007.
DEFAULT_THRESHOLD_MINOR = 50_00


class Command(BaseCommand):
    help = (
        "Check the eSIM supplier wallet balance and warn when it is low. Orders fail with "
        "error 200007 once the wallet is empty, so run this on a schedule."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--threshold", type=int, default=DEFAULT_THRESHOLD_MINOR,
            help="Warn below this balance, in minor units (default 5000 = $50.00).",
        )
        parser.add_argument(
            "--fail-on-low", action="store_true",
            help="Exit non-zero when below the threshold, for alerting from cron/CI.",
        )

    def handle(self, *args, **options):
        gateway = get_supplier_gateway()
        try:
            result = gateway.query_balance()
        except SupplierError as exc:
            self.stderr.write(self.style.ERROR(f"balance check failed: {exc}"))
            record_audit(
                action="supplier.balance_check_failed",
                actor_type="system", context={"error": str(exc)[:200]},
            )
            raise SystemExit(1)

        balance = result["balance_minor"] or 0
        threshold = options["threshold"]
        self.stdout.write(f"supplier wallet balance: ${balance / 100:,.2f}")

        if balance < threshold:
            self.stdout.write(
                self.style.WARNING(
                    f"LOW BALANCE — below ${threshold / 100:,.2f}. Top up, or live orders "
                    "will fail with supplier error 200007."
                )
            )
            record_audit(
                action="supplier.balance_low",
                actor_type="system",
                context={"balance_minor": balance, "threshold_minor": threshold},
            )
            if options["fail_on_low"]:
                raise SystemExit(2)
        else:
            self.stdout.write(self.style.SUCCESS("balance is healthy"))
