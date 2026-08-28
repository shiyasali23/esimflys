import logging
import time

from django.core.management.base import BaseCommand

from apps.esims.services import (
    claim_and_process_one,
    reclaim_stale_events,
    refresh_stale_usage,
)
from apps.orders.notifications import send_pending_notifications
from apps.payments.services import reconcile_stuck_payments

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = (
        "Process durable supplier and notification jobs. Claims work with "
        "SELECT FOR UPDATE SKIP LOCKED so multiple workers can run safely."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--once", action="store_true", help="Drain all available jobs, then exit."
        )
        parser.add_argument("--sleep", type=float, default=2.0)
        parser.add_argument("--reconcile-every", type=float, default=300.0)
        # 15 minutes. The supplier's own usage figures lag one to three hours, so polling
        # faster buys nothing real and only spends rate limit.
        parser.add_argument("--usage-every", type=float, default=900.0)

    def handle(self, *args, **options):
        if options["once"]:
            reclaimed = reclaim_stale_events()
            jobs = 0
            while claim_and_process_one():
                jobs += 1
            if reclaimed:
                self.stdout.write(f"reclaimed {reclaimed} stale job(s)")
            notifications = send_pending_notifications()
            rescued = reconcile_stuck_payments()
            usage = refresh_stale_usage()
            self.stdout.write(
                self.style.SUCCESS(
                    f"processed {jobs} supplier job(s), {notifications} notification(s), "
                    f"reconciled {rescued} payment(s), refreshed {usage} eSIM(s)"
                )
            )
            return

        self.stdout.write(
            "worker started; polling for supplier + notification jobs, "
            f"reconciling payments every {options['reconcile_every']}s..."
        )
        next_reconcile = 0.0
        next_usage = 0.0
        while True:
            worked = False

            # Requeue anything a previously crashed worker left claimed. Cheap indexed
            # update, and it is the only path that unsticks those rows.
            if reclaim_stale_events():
                worked = True
            while claim_and_process_one():
                worked = True
            if send_pending_notifications():
                worked = True

            # On its own clock, NOT the 2s job loop. Every pass costs a Stripe API call
            # per stuck payment, and there is no value in asking more often than a webhook
            # would plausibly have been late by. `monotonic` because a wall-clock jump
            # must not skip or stampede this.
            now = time.monotonic()
            if now >= next_reconcile:
                next_reconcile = now + options["reconcile_every"]
                try:
                    if reconcile_stuck_payments():
                        worked = True
                except Exception:
                    # A reconciliation failure must never stop provisioning or email.
                    logger.exception("payment reconciliation pass failed")

            # Also on its own clock, and for the same reason: each pass is one supplier
            # call per stale profile. Without this every eSIM keeps the balance it was
            # born with — production had five profiles all reading a full allowance,
            # including one that had really used 382 MB.
            if now >= next_usage:
                next_usage = now + options["usage_every"]
                try:
                    if refresh_stale_usage():
                        worked = True
                except Exception:
                    # The supplier being unreachable must not stop provisioning or email.
                    logger.exception("usage refresh pass failed")

            if not worked:
                time.sleep(options["sleep"])
