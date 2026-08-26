"""Cancel orders that were placed but never paid, and give their promo uses back.

There was no way to cancel an order at all: no admin endpoint, no service call, no
command. Abandoned checkouts therefore accumulated forever — 57 of 63 orders on
production were `pending_payment`, the oldest twelve days old.

That is not only clutter. `create_order` reserves a promo redemption, and the
usage-limit check in `_validate_promo` counts `reserved` alongside `consumed`, while
`release_promo_for_order` is reached only from the payment-failure path
(`payments/services.py`). An abandoned order is never paid AND never failed, so its
reservation stays `reserved` for good and permanently burns one use of the code. A
five-use code dies after five people change their minds.

SAFETY. This mutates production money records, so it refuses rather than guesses:

  * anything whose payment_status is not `pending` is skipped — paid, processing,
    refunded and partially_refunded orders are never touched;
  * an order carrying a Payment row in `succeeded`, `processing`, `refunded` or
    `partially_refunded` is skipped even if the order row disagrees, because the
    payment row is the one backed by Stripe;
  * an order with any eSIM attached is skipped — something was delivered, so this
    is a refund question, not a cancellation;
  * nothing is written unless `--apply` is passed.

Cancelling is deliberately NOT wired to a schedule. How long a customer may take to
finish paying is a business decision, and a cron that silently voids real orders is
worse than the clutter it tidies.
"""

from django.core.management.base import BaseCommand, CommandError

from apps.common.exceptions import Conflict
from django.utils import timezone

from apps.orders.models import Order
from apps.orders.services import cancel_unpaid_order, cancellation_blocker

class Command(BaseCommand):
    help = "Cancel unpaid orders and release the promo reservations they were holding."

    def add_arguments(self, parser):
        parser.add_argument(
            "--order",
            action="append",
            default=[],
            metavar="UUID",
            help="Cancel this specific order. Repeatable. Combine with nothing else to be surgical.",
        )
        parser.add_argument(
            "--older-than",
            type=float,
            metavar="HOURS",
            help="Cancel every unpaid order created more than this many hours ago.",
        )
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Actually write. Without it this only reports what it would do.",
        )

    def handle(self, *args, **options):
        ids = options["order"]
        older_than = options["older_than"]
        apply_changes = options["apply"]

        if not ids and older_than is None:
            raise CommandError("Give --order <uuid> (repeatable) or --older-than <hours>.")

        queryset = Order.objects.filter(payment_status="pending")
        if ids:
            queryset = queryset.filter(id__in=ids)
        if older_than is not None:
            cutoff = timezone.now() - timezone.timedelta(hours=older_than)
            queryset = queryset.filter(created_at__lt=cutoff)

        orders = list(queryset.prefetch_related("payments").order_by("created_at"))

        # An id that matched nothing is reported rather than ignored: it means the
        # order is already cancelled, already paid, or the id is wrong — and each of
        # those is something the operator wanted to know before running this.
        if ids:
            found = {str(o.id) for o in orders}
            for missing in [i for i in ids if i not in found]:
                self.stdout.write(f"  SKIP {missing[:8]} — not an unpaid order (already settled, cancelled, or unknown id)")

        cancelled = skipped = 0
        for order in orders:
            blocker = self._blocker(order)
            if blocker:
                skipped += 1
                self.stdout.write(f"  SKIP {str(order.id)[:8]} {order.order_number} — {blocker}")
                continue

            label = (
                f"{str(order.id)[:8]} {order.order_number} "
                f"{order.total_minor / 100:.2f} {order.currency} {order.customer_email}"
            )
            if not apply_changes:
                self.stdout.write(f"  WOULD CANCEL {label}")
                cancelled += 1
                continue

            try:
                released = cancel_unpaid_order(order)
            except Conflict as exc:
                skipped += 1
                self.stdout.write(f"  SKIP {str(order.id)[:8]} — {exc.message}")
                continue

            cancelled += 1
            note = f" (released {released} promo reservation)" if released else ""
            self.stdout.write(f"  CANCELLED {label}{note}")

        verb = "Cancelled" if apply_changes else "Would cancel"
        self.stdout.write(f"\n{verb} {cancelled} order(s), skipped {skipped}.")
        if not apply_changes and cancelled:
            self.stdout.write("Nothing was written. Re-run with --apply to commit.")

    def _blocker(self, order):
        """Delegates to the shared guard so this and the admin endpoint cannot diverge."""
        return cancellation_blocker(order)
