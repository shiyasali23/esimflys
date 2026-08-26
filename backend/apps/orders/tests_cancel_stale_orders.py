"""The cancel command mutates production money records, so its refusals are the point.

Every test here that matters asserts something is NOT cancelled. Cancelling an order
that took money, or one whose eSIM was already delivered, turns a support ticket into
a customer who paid and holds a voided order.
"""

from io import StringIO
from unittest import mock

from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import transaction
from django.test import TestCase, override_settings
from django.utils import timezone

from apps.catalog.models import CatalogPlan, Country, Supplier
from apps.esims.models import EsimProfile
from apps.orders import services
from apps.orders.models import Order, PromoCode, PromoRedemption
from apps.payments import stripe as stripe_module
from apps.payments.models import Payment


def run(*args):
    out = StringIO()
    call_command("cancel_stale_orders", *args, stdout=out)
    return out.getvalue()


@override_settings(SUPPLIER_GATEWAY="fake", PAYMENTS_GATEWAY="fake")
class CancelStaleOrdersTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.supplier = Supplier.objects.create(code="esim-access", name="eSIM Access", status="active")
        cls.country = Country.objects.create(
            iso2="SA", name="Saudi Arabia", slug="saudi-arabia", region="Asia", is_active=True
        )
        cls.plan = CatalogPlan.objects.create(
            supplier=cls.supplier, country=cls.country, product_code="SA-1GB-7D",
            supplier_package_code="PKG-SA", plan_type="fixed", display_name="1GB",
            data_limit_mb=1000, validity_days=7, retail_amount_minor=399,
            wholesale_amount_minor=200, currency="USD", status="active",
        )

    def _order(self, promo_code=None, email="buyer@example.com"):
        # `create_order` leaves the transaction to its caller; these tests are the caller.
        with transaction.atomic():
            return services.create_order(
                lines=[services.OrderLine(catalog_plan_id=self.plan.id, quantity=1)],
                customer_email=email,
                promo_code=promo_code,
                requested_currency="USD",
            )

    # ---- it does the job ----

    def test_cancels_a_named_unpaid_order(self):
        order = self._order()
        run("--order", str(order.id), "--apply")
        order.refresh_from_db()
        self.assertEqual(order.status, "cancelled")
        self.assertEqual(order.payment_status, "cancelled")
        self.assertEqual(order.fulfillment_status, "cancelled")

    def test_gives_the_promo_use_back(self):
        """The leak this command exists to stop: an abandoned order held its use forever."""
        promo = PromoCode.objects.create(
            code="FIVEUSES", kind="discount", discount_type="percentage_bps",
            discount_value=1000, usage_limit=5, is_active=True,
        )
        order = self._order(promo_code="FIVEUSES")
        self.assertEqual(
            PromoRedemption.objects.filter(promo_code=promo, status="reserved").count(), 1
        )

        run("--order", str(order.id), "--apply")

        self.assertEqual(
            PromoRedemption.objects.filter(promo_code=promo, status="reserved").count(), 0
        )
        self.assertEqual(
            PromoRedemption.objects.filter(promo_code=promo, status="released").count(), 1
        )

    # ---- it refuses ----

    def test_never_cancels_an_order_that_was_paid(self):
        order = self._order()
        Order.objects.filter(pk=order.pk).update(payment_status="paid", status="paid")

        run("--order", str(order.id), "--apply")

        order.refresh_from_db()
        self.assertEqual(order.payment_status, "paid")

    def test_never_cancels_an_order_carrying_a_succeeded_payment(self):
        """The order row can lag; the Stripe-backed payment row is the authority."""
        order = self._order()
        Payment.objects.create(
            order=order, provider="stripe", provider_payment_id="pi_x",
            idempotency_key="idem-succeeded-1",
            amount_minor=order.total_minor, currency=order.currency, status="succeeded",
        )

        run("--order", str(order.id), "--apply")

        order.refresh_from_db()
        self.assertEqual(order.status, "pending_payment")

    def test_never_cancels_an_order_that_already_has_an_esim(self):
        order = self._order()
        EsimProfile.objects.create(
            order_item=order.items.first(), supplier=self.supplier, status="ready",
        )

        run("--order", str(order.id), "--apply")

        order.refresh_from_db()
        self.assertEqual(order.status, "pending_payment")

    # ---- the in-flight payment question ----

    def test_cancels_when_stripe_says_the_card_was_never_entered(self):
        """The ordinary abandoned checkout. Opening the payment page creates an intent,
        so EVERY abandoned order carries a `processing` payment — treating that as
        blocking refused every order this feature exists to clear."""
        order = self._order()
        Payment.objects.create(
            order=order, provider="stripe", provider_payment_id="pi_never_paid",
            idempotency_key="idem-never", amount_minor=order.total_minor,
            currency=order.currency, status="processing",
        )

        run("--order", str(order.id), "--apply")

        order.refresh_from_db()
        self.assertEqual(order.status, "cancelled")

    def test_voids_the_intent_so_an_open_tab_cannot_still_pay(self):
        """Cancelling our row while leaving the intent live lets a stale checkout tab
        pay a cancelled order — real money against nothing to deliver."""
        order = self._order()
        Payment.objects.create(
            order=order, provider="stripe", provider_payment_id="pi_open_tab",
            idempotency_key="idem-open", amount_minor=order.total_minor,
            currency=order.currency, status="processing",
        )

        run("--order", str(order.id), "--apply")

        gateway = stripe_module.get_gateway()
        self.assertEqual(
            gateway.retrieve_payment_intent("pi_open_tab")["status"], "canceled"
        )
        self.assertEqual(Payment.objects.get(order=order).status, "cancelled")

    def test_refuses_when_stripe_says_the_intent_actually_succeeded(self):
        """Our row can say `processing` while the money already moved and the webhook
        was lost — the exact failure the reconciler exists for. Cancelling here would
        void an order that was paid for."""
        order = self._order()
        Payment.objects.create(
            order=order, provider="stripe", provider_payment_id="pi_really_paid",
            idempotency_key="idem-paid", amount_minor=order.total_minor,
            currency=order.currency, status="processing",
        )
        gateway = stripe_module.get_gateway()
        gateway.retrievable["pi_really_paid"] = {
            "id": "pi_really_paid", "status": "succeeded",
            "amount": order.total_minor, "currency": "usd", "metadata": {},
        }

        run("--order", str(order.id), "--apply")

        order.refresh_from_db()
        self.assertEqual(order.status, "pending_payment")

    def test_refuses_when_the_intent_is_still_in_flight(self):
        """An async method (UPI, bank debit) can settle minutes later."""
        order = self._order()
        Payment.objects.create(
            order=order, provider="stripe", provider_payment_id="pi_in_flight",
            idempotency_key="idem-flight", amount_minor=order.total_minor,
            currency=order.currency, status="processing",
        )
        gateway = stripe_module.get_gateway()
        gateway.retrievable["pi_in_flight"] = {
            "id": "pi_in_flight", "status": "processing",
            "amount": order.total_minor, "currency": "usd", "metadata": {},
        }

        run("--order", str(order.id), "--apply")

        order.refresh_from_db()
        self.assertEqual(order.status, "pending_payment")

    def test_refuses_when_stripe_cannot_be_reached(self):
        """Unreachable is not the same as unpaid. Assuming the friendly answer here
        would void orders during any Stripe outage."""
        order = self._order()
        Payment.objects.create(
            order=order, provider="stripe", provider_payment_id="pi_unreachable",
            idempotency_key="idem-unreach", amount_minor=order.total_minor,
            currency=order.currency, status="processing",
        )
        gateway = stripe_module.get_gateway()
        with mock.patch.object(
            type(gateway), "retrieve_payment_intent", side_effect=RuntimeError("network")
        ):
            run("--order", str(order.id), "--apply")

        order.refresh_from_db()
        self.assertEqual(order.status, "pending_payment")

    # ---- it does not write unless told ----

    def test_writes_nothing_without_apply(self):
        order = self._order()
        output = run("--order", str(order.id))
        self.assertIn("WOULD CANCEL", output)
        order.refresh_from_db()
        self.assertEqual(order.status, "pending_payment")

    def test_refuses_to_run_with_no_selection(self):
        """No arguments must not mean 'every unpaid order on the platform'."""
        with self.assertRaises(CommandError):
            run("--apply")

    # ---- age filter ----

    def test_older_than_leaves_recent_orders_alone(self):
        fresh = self._order(email="fresh@example.com")
        stale = self._order(email="stale@example.com")
        Order.objects.filter(pk=stale.pk).update(
            created_at=timezone.now() - timezone.timedelta(hours=48)
        )

        run("--older-than", "24", "--apply")

        fresh.refresh_from_db()
        stale.refresh_from_db()
        self.assertEqual(fresh.status, "pending_payment")
        self.assertEqual(stale.status, "cancelled")

    def test_reports_an_id_that_matched_nothing(self):
        order = self._order()
        Order.objects.filter(pk=order.pk).update(payment_status="paid")
        output = run("--order", str(order.id), "--apply")
        self.assertIn("SKIP", output)
