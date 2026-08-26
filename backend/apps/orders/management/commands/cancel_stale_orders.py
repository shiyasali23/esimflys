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
from django.db import transaction
from django.utils import timezone

from apps.orders.models import Order, OrderItem, PromoRedemption

BLOCKING_PAYMENT_STATES = ("succeeded", "processing", "refunded", "partially_refunded")


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

            with transaction.atomic():
                # Re-read under a row lock: a webhook could settle this order between
                # the read above and the write here, which would cancel a paid order.
                locked = Order.objects.select_for_update().get(pk=order.pk)
                blocker = self._blocker(locked)
                if blocker:
                    skipped += 1
                    self.stdout.write(f"  SKIP {str(order.id)[:8]} — became {blocker} while running")
                    continue

                released = PromoRedemption.objects.filter(
                    order=locked, status="reserved"
                ).update(status="released", released_at=timezone.now())

                locked.status = "cancelled"
                locked.payment_status = "cancelled"
                locked.fulfillment_status = "cancelled"
                locked.save(update_fields=["status", "payment_status", "fulfillment_status"])

            cancelled += 1
            note = f" (released {released} promo reservation)" if released else ""
            self.stdout.write(f"  CANCELLED {label}{note}")

        verb = "Cancelled" if apply_changes else "Would cancel"
        self.stdout.write(f"\n{verb} {cancelled} order(s), skipped {skipped}.")
        if not apply_changes and cancelled:
            self.stdout.write("Nothing was written. Re-run with --apply to commit.")

    def _blocker(self, order):
        """Why this order must not be cancelled, or None if it is safe."""
        if order.payment_status != "pending":
            return f"payment_status is {order.payment_status}"
        # An EsimProfile hangs off OrderItem, not Order — there is no `order.esims`.
        # Reaching through the items is the only way to see a delivered profile.
        if OrderItem.objects.filter(order=order, esim_profile__isnull=False).exists():
            return "an eSIM was already provisioned — this is a refund, not a cancellation"
        live = [p.status for p in order.payments.all() if p.status in BLOCKING_PAYMENT_STATES]
        if live:
            return f"carries a payment in {live[0]}"
        return None
