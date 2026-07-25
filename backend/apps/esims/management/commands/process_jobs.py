import time

from django.core.management.base import BaseCommand

from apps.esims.services import claim_and_process_one
from apps.orders.notifications import send_pending_notifications


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

    def handle(self, *args, **options):
        if options["once"]:
            jobs = 0
            while claim_and_process_one():
                jobs += 1
            notifications = send_pending_notifications()
            self.stdout.write(
                self.style.SUCCESS(
                    f"processed {jobs} supplier job(s), {notifications} notification(s)"
                )
            )
            return

        self.stdout.write("worker started; polling for supplier + notification jobs...")
        while True:
            worked = False
            while claim_and_process_one():
                worked = True
            if send_pending_notifications():
                worked = True
            if not worked:
                time.sleep(options["sleep"])
