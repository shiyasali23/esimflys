import json
from datetime import timedelta
from unittest.mock import patch

from django.utils import timezone

from django.test import TestCase, override_settings
from rest_framework.test import APITestCase

from apps.accounts.models import Organization, PartnerCommission
from apps.catalog.models import CatalogPlan, Country, Supplier
from apps.common.exceptions import RefundLimitExceeded
from apps.orders import services as order_services
from apps.orders.models import PromoCode, PromoRedemption
from apps.payments import services as payment_services
from apps.payments.models import Payment, Refund, WebhookEvent
from apps.esims.models import EsimProfile
from apps.payments.stripe import FakeGateway


@override_settings(PAYMENTS_GATEWAY="fake", STRIPE_WEBHOOK_SECRET="whsec_test")
class PaymentsTests(APITestCase):
    def setUp(self):
        self.supplier = Supplier.objects.create(
            code="esim-access", name="eSIM Access", status="active"
        )
        self.country = Country.objects.create(
            iso2="FR", name="France", slug="france", region="Europe", is_active=True
        )
        self.plan = CatalogPlan.objects.create(
            supplier=self.supplier, country=self.country, product_code="FR-5GB-30D",
            supplier_package_code="PKG", plan_type="fixed", display_name="FR 5GB",
            data_limit_mb=5000, validity_days=30, retail_amount_minor=1500,
            wholesale_amount_minor=600, currency="USD", status="active",
        )

    def _order(self, qty=1, promo=None):
        cart, _ = order_services.create_cart(user=None)
        order_services.add_item(cart, product_code="FR-5GB-30D", quantity=qty)
        return order_services.checkout(cart_id=cart.id, customer_email="a@b.com", promo_code=promo)

    def _intent(self, order):
        return self.client.post(
            "/api/v1/payments/payment-intent/", {"order_id": str(order.id)}, format="json"
        )

    def _webhook(self, event, signature=None):
        payload = json.dumps(event)
        signature = signature if signature is not None else FakeGateway().sign(payload)
        return self.client.post(
            "/api/v1/webhooks/stripe/", data=payload,
            content_type="application/json", HTTP_STRIPE_SIGNATURE=signature,
        )

    def _succeeded(self, order, payment, event_id="evt_1", amount=None):
        return {
            "id": event_id,
            "type": "payment_intent.succeeded",
            "data": {
                "object": {
                    "id": payment.provider_payment_id,
                    "amount": order.total_minor if amount is None else amount,
                    "currency": "usd",
                    "metadata": {"order_id": str(order.id)},
                    "status": "succeeded",
                }
            },
        }

    def test_payment_intent_created_from_stored_amount(self):
        order = self._order()
        response = self._intent(order)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["client_secret"])
        payment = Payment.objects.get(order=order)
        self.assertEqual(payment.status, "processing")
        self.assertEqual(payment.amount_minor, 1500)

    def test_intent_is_idempotent_per_order(self):
        order = self._order()
        self._intent(order)
        self._intent(order)
        self.assertEqual(Payment.objects.filter(order=order).count(), 1)

    def test_webhook_success_marks_paid_and_consumes_promo(self):
        PromoCode.objects.create(code="TEN", discount_type="percentage_bps", discount_value=1000)
        order = self._order(promo="TEN")  # 1500 - 150 = 1350
        self._intent(order)
        payment = Payment.objects.get(order=order)
        response = self._webhook(self._succeeded(order, payment))
        self.assertEqual(response.status_code, 200)
        order.refresh_from_db()
        payment.refresh_from_db()
        self.assertEqual(order.payment_status, "paid")
        self.assertEqual(order.status, "paid")
        self.assertEqual(payment.status, "succeeded")
        self.assertEqual(PromoRedemption.objects.get(order=order).status, "consumed")

    def test_duplicate_webhook_is_idempotent(self):
        order = self._order()
        self._intent(order)
        payment = Payment.objects.get(order=order)
        event = self._succeeded(order, payment, event_id="evt_dup")
        self.assertEqual(self._webhook(event).status_code, 200)
        self.assertEqual(self._webhook(event).status_code, 200)
        self.assertEqual(WebhookEvent.objects.filter(external_event_id="evt_dup").count(), 1)
        self.assertEqual(Payment.objects.filter(order=order, status="succeeded").count(), 1)

    def test_invalid_signature_rejected(self):
        order = self._order()
        self._intent(order)
        payment = Payment.objects.get(order=order)
        response = self._webhook(self._succeeded(order, payment), signature="not-a-valid-sig")
        self.assertEqual(response.status_code, 400)
        order.refresh_from_db()
        self.assertEqual(order.payment_status, "pending")

    def test_amount_mismatch_never_marks_paid(self):
        order = self._order()
        self._intent(order)
        payment = Payment.objects.get(order=order)
        response = self._webhook(self._succeeded(order, payment, event_id="evt_mm", amount=999999))
        self.assertEqual(response.status_code, 409)
        order.refresh_from_db()
        self.assertEqual(order.payment_status, "pending")

    def test_zero_total_order_skips_stripe(self):
        PromoCode.objects.create(code="FREE", discount_type="percentage_bps", discount_value=10000)
        order = self._order(promo="FREE")
        self.assertEqual(order.total_minor, 0)
        response = self._intent(order)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data.get("zero_total"))
        order.refresh_from_db()
        self.assertEqual(order.payment_status, "paid")
        self.assertEqual(Payment.objects.filter(order=order).count(), 0)
        self.assertEqual(PromoRedemption.objects.get(order=order).status, "consumed")

    def test_paid_order_rejects_new_intent(self):
        order = self._order()
        self._intent(order)
        payment = Payment.objects.get(order=order)
        self._webhook(self._succeeded(order, payment))
        response = self._intent(order)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["error"]["code"], "payment_already_completed")


class StripeEventShapeTests(TestCase):
    """The real SDK returns a StripeObject, not a dict.

    ``StripeObject`` overrides ``__getattr__`` to resolve keys, so ``event.get(...)``
    raises ``AttributeError: get`` instead of behaving like a dict. That divergence between
    the fake (plain dict) and the real gateway caused every genuine Stripe webhook to 500
    while the whole test suite stayed green. ``construct_event`` now normalises to a plain
    dict; this test locks that in.
    """

    @override_settings(
        PAYMENTS_GATEWAY="stripe", STRIPE_SECRET_KEY="sk_test_x",
        STRIPE_WEBHOOK_SECRET="whsec_x",
    )
    def test_construct_event_returns_a_plain_dict(self):
        from unittest.mock import patch

        import stripe as stripe_sdk

        from apps.payments.stripe import StripeGateway

        payload = json.dumps({
            "id": "evt_1", "type": "payment_intent.succeeded",
            "data": {"object": {"id": "pi_1", "amount": 1699, "currency": "usd",
                                "metadata": {"order_id": "abc"}}},
        }).encode()

        stripe_object = stripe_sdk.Event.construct_from(json.loads(payload), "sk_test_x")
        # Sanity: the raw SDK object is exactly what broke us.
        with self.assertRaises(AttributeError):
            stripe_object.get("data")

        with patch.object(stripe_sdk.Webhook, "construct_event", return_value=stripe_object):
            event = StripeGateway().construct_event(payload, "sig")

        self.assertIsInstance(event, dict)
        self.assertEqual(event.get("id"), "evt_1")                       # .get() works
        self.assertEqual(event["data"]["object"].get("metadata"), {"order_id": "abc"})
        self.assertIsInstance(event["data"]["object"], dict)             # nested too


@override_settings(PAYMENTS_GATEWAY="fake", STRIPE_WEBHOOK_SECRET="whsec_test")
class RefundTests(APITestCase):
    def setUp(self):
        self.supplier = Supplier.objects.create(
            code="esim-access", name="eSIM Access", status="active"
        )
        self.country = Country.objects.create(
            iso2="FR", name="France", slug="france", region="Europe", is_active=True
        )
        self.plan = CatalogPlan.objects.create(
            supplier=self.supplier, country=self.country, product_code="FR-5GB-30D",
            supplier_package_code="PKG", plan_type="fixed", display_name="FR 5GB",
            data_limit_mb=5000, validity_days=30, retail_amount_minor=1000,
            wholesale_amount_minor=400, currency="USD", status="active",
        )

    def _pay(self, order):
        payment_services.create_payment_intent_for_order(order)
        payment = Payment.objects.get(order=order)
        event = {
            "id": f"evt_{order.id}",
            "type": "payment_intent.succeeded",
            "data": {"object": {
                "id": payment.provider_payment_id, "amount": order.total_minor,
                "currency": "usd", "metadata": {"order_id": str(order.id)},
                "status": "succeeded",
            }},
        }
        payload = json.dumps(event)
        self.client.post(
            "/api/v1/webhooks/stripe/", data=payload,
            content_type="application/json", HTTP_STRIPE_SIGNATURE=FakeGateway().sign(payload),
        )
        order.refresh_from_db()
        return payment

    def _paid_order(self, qty=1, promo=None):
        cart, _ = order_services.create_cart(user=None)
        order_services.add_item(cart, product_code="FR-5GB-30D", quantity=qty)
        order = order_services.checkout(cart_id=cart.id, customer_email="a@b.com", promo_code=promo)
        return order, self._pay(order)

    def test_full_refund_marks_order_refunded(self):
        order, payment = self._paid_order(qty=2)  # total 2000, two items @1000
        allocations = [{"order_item_id": i.id, "amount_minor": 1000} for i in order.items.all()]
        refund = payment_services.create_refund(payment=payment, allocations=allocations)
        self.assertEqual(refund.status, "succeeded")
        order.refresh_from_db()
        payment.refresh_from_db()
        self.assertEqual(order.status, "refunded")
        self.assertEqual(order.payment_status, "refunded")
        self.assertEqual(payment.status, "refunded")

    def test_partial_refund_marks_partially_refunded(self):
        order, payment = self._paid_order(qty=2)
        item = order.items.first()
        refund = payment_services.create_refund(
            payment=payment, allocations=[{"order_item_id": item.id, "amount_minor": 1000}]
        )
        self.assertEqual(refund.status, "succeeded")
        order.refresh_from_db()
        self.assertEqual(order.status, "partially_refunded")

    def test_refund_cannot_exceed_item_amount(self):
        order, payment = self._paid_order(qty=2)
        item = order.items.first()
        with self.assertRaises(RefundLimitExceeded):
            payment_services.create_refund(
                payment=payment, allocations=[{"order_item_id": item.id, "amount_minor": 1500}]
            )

    def test_refund_reverses_agency_commission(self):
        org = Organization.objects.create(
            name="Agency", organization_type="travel_agency",
            billing_email="a@agency.com", status="active",
        )
        PromoCode.objects.create(
            code="AG", organization=org, discount_type="percentage_bps", discount_value=0,
            commission_type="percentage_bps", commission_value=1000,
        )
        order, payment = self._paid_order(qty=1, promo="AG")  # subtotal 1000, commission 100
        commission = PartnerCommission.objects.get(order=order)
        self.assertEqual(commission.commission_minor, 100)
        item = order.items.first()
        payment_services.create_refund(
            payment=payment, allocations=[{"order_item_id": item.id, "amount_minor": 1000}]
        )
        commission.refresh_from_db()
        self.assertEqual(commission.reversed_minor, 100)
        self.assertEqual(commission.status, "reversed")


@override_settings(PAYMENTS_GATEWAY="fake", STRIPE_WEBHOOK_SECRET="whsec_test", SUPPLIER_GATEWAY="fake")
class PaymentReconciliationTests(APITestCase):
    """The safety net for a webhook that never arrives.

    Two real charges were taken and never delivered because every
    `payment_intent.succeeded` delivery was rejected with a 400 — the configured secret
    belonged to a different endpoint. Nothing recovered them, because the webhook was the
    only path from paid to provisioned. These assertions describe the path that now is.
    """

    def setUp(self):
        self.supplier = Supplier.objects.create(
            code="esim-access", name="eSIM Access", status="active"
        )
        self.country = Country.objects.create(
            iso2="FR", name="France", slug="france", region="Europe", is_active=True
        )
        self.plan = CatalogPlan.objects.create(
            supplier=self.supplier, country=self.country, product_code="FR-5GB-30D",
            supplier_package_code="PKG", plan_type="fixed", display_name="FR 5GB",
            data_limit_mb=5000, validity_days=30, retail_amount_minor=1500,
            wholesale_amount_minor=600, currency="USD", status="active",
        )
        FakeGateway.retrievable = {}
        self.addCleanup(lambda: FakeGateway.retrievable.clear())

    def _stuck_order(self, *, minutes_ago=30):
        """An order that paid at Stripe but whose webhook never landed."""
        cart, _ = order_services.create_cart(user=None)
        order_services.add_item(cart, product_code="FR-5GB-30D", quantity=1)
        order = order_services.checkout(cart_id=cart.id, customer_email="a@b.com")
        self.client.post(
            "/api/v1/payments/payment-intent/", {"order_id": str(order.id)}, format="json"
        )
        payment = Payment.objects.get(order=order)
        # `created_at` is auto_now_add, so age it with an UPDATE rather than a save().
        Payment.objects.filter(pk=payment.pk).update(
            created_at=timezone.now() - timedelta(minutes=minutes_ago)
        )
        return order, payment

    def _stripe_says_paid(self, order, payment, **overrides):
        FakeGateway.retrievable[payment.provider_payment_id] = {
            "id": payment.provider_payment_id,
            "status": "succeeded",
            "amount": order.total_minor,
            "currency": "usd",
            "metadata": {"order_id": str(order.id)},
            **overrides,
        }

    def test_rescues_an_order_whose_webhook_never_arrived(self):
        order, payment = self._stuck_order()
        self._stripe_says_paid(order, payment)

        self.assertEqual(payment_services.reconcile_stuck_payments(), 1)

        order.refresh_from_db()
        payment.refresh_from_db()
        self.assertEqual(order.payment_status, "paid")
        self.assertEqual(order.status, "paid")
        self.assertEqual(payment.status, "succeeded")
        self.assertIsNotNone(payment.paid_at)

    def test_leaves_a_genuinely_unpaid_order_alone(self):
        """The default FakeGateway answer is `requires_payment_method`.

        Reconciling on anything but `succeeded` would mark unpaid orders paid and buy
        eSIMs nobody paid for — strictly worse than the bug it exists to fix.
        """
        order, payment = self._stuck_order()

        self.assertEqual(payment_services.reconcile_stuck_payments(), 0)

        order.refresh_from_db()
        payment.refresh_from_db()
        self.assertEqual(order.payment_status, "pending")
        # Asserting the payment is untouched, not merely that the order stayed pending.
        # [MUTATION-TESTED] deleting the `status != "succeeded"` guard still left the order
        # pending — the unpaid intent reports amount 0, so it failed one step later as a
        # MISMATCH instead and quarantined a payment that was simply not paid yet. The
        # order-level assertion alone could not tell those two apart.
        self.assertEqual(payment.status, "processing")
        self.assertIsNone(payment.failure_code)

    def test_ignores_payments_too_recent_to_be_suspicious(self):
        """A healthy webhook arrives in seconds. Racing it buys nothing."""
        order, payment = self._stuck_order(minutes_ago=1)
        self._stripe_says_paid(order, payment)

        self.assertEqual(payment_services.reconcile_stuck_payments(older_than_minutes=10), 0)

        order.refresh_from_db()
        self.assertEqual(order.payment_status, "pending")

    def test_running_twice_provisions_once(self):
        order, payment = self._stuck_order()
        self._stripe_says_paid(order, payment)

        payment_services.reconcile_stuck_payments()
        before = EsimProfile.objects.filter(order_item__order=order).count()
        # Second pass finds nothing: the order is no longer `payment_status=pending`.
        self.assertEqual(payment_services.reconcile_stuck_payments(), 0)

        self.assertEqual(EsimProfile.objects.filter(order_item__order=order).count(), before)
        self.assertEqual(Payment.objects.filter(order=order, status="succeeded").count(), 1)

    def test_a_late_webhook_after_reconciliation_changes_nothing(self):
        """The real race. Stripe retries for days, so the delivery may still land."""
        order, payment = self._stuck_order()
        self._stripe_says_paid(order, payment)
        payment_services.reconcile_stuck_payments()

        event = {
            "id": "evt_late",
            "type": "payment_intent.succeeded",
            "data": {"object": {
                "id": payment.provider_payment_id,
                "amount": order.total_minor,
                "currency": "usd",
                "metadata": {"order_id": str(order.id)},
                "status": "succeeded",
            }},
        }
        payload = json.dumps(event)
        response = self.client.post(
            "/api/v1/webhooks/stripe/", payload, content_type="application/json",
            HTTP_STRIPE_SIGNATURE=FakeGateway().sign(payload),
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(EsimProfile.objects.filter(order_item__order=order).count(), 1)
        self.assertEqual(Payment.objects.filter(order=order, status="succeeded").count(), 1)

    def test_a_mismatched_amount_quarantines_the_payment_and_pays_nothing(self):
        """Stripe reporting a different amount than we recorded is never reconciled.

        The quarantine write has to survive: `_handle_succeeded` raises inside a
        transaction, so it is applied after the rollback, exactly as the webhook path does.
        """
        order, payment = self._stuck_order()
        self._stripe_says_paid(order, payment, amount=order.total_minor + 500)

        self.assertEqual(payment_services.reconcile_stuck_payments(), 0)

        order.refresh_from_db()
        payment.refresh_from_db()
        self.assertEqual(order.payment_status, "pending")
        self.assertEqual(payment.status, "failed")
        self.assertEqual(payment.failure_code, "reconciliation_mismatch")

    def test_one_broken_payment_does_not_strand_the_others(self):
        """Isolation. A batch is only as useful as its worst member is harmless."""
        bad_order, bad_payment = self._stuck_order()
        good_order, good_payment = self._stuck_order()
        self._stripe_says_paid(bad_order, bad_payment, amount=bad_order.total_minor + 999)
        self._stripe_says_paid(good_order, good_payment)

        self.assertEqual(payment_services.reconcile_stuck_payments(), 1)

        good_order.refresh_from_db()
        bad_order.refresh_from_db()
        self.assertEqual(good_order.payment_status, "paid")
        self.assertEqual(bad_order.payment_status, "pending")

    def test_a_stripe_outage_leaves_everything_retryable(self):
        """An unreachable Stripe must not consume or fail the payment."""
        order, payment = self._stuck_order()

        def boom(_intent_id):
            raise RuntimeError("stripe unreachable")

        with patch.object(FakeGateway, "retrieve_payment_intent", boom):
            self.assertEqual(payment_services.reconcile_stuck_payments(), 0)

        order.refresh_from_db()
        payment.refresh_from_db()
        self.assertEqual(order.payment_status, "pending")
        self.assertEqual(payment.status, "processing")

    def test_a_crash_while_settling_one_order_does_not_strand_the_next(self):
        """Isolation around `_handle_succeeded`, not just around the Stripe call.

        [MUTATION-TESTED] narrowing that `except Exception` to a type nothing raises kept
        the suite green, because every existing test failed in the gateway call instead —
        which a different `except` already covers. This is the only test that reaches the
        second one.
        """
        first_order, first_payment = self._stuck_order()
        second_order, second_payment = self._stuck_order()
        self._stripe_says_paid(first_order, first_payment)
        self._stripe_says_paid(second_order, second_payment)

        real = payment_services._handle_succeeded
        seen = []

        def explode_once(intent):
            seen.append(intent["id"])
            if len(seen) == 1:
                raise RuntimeError("database hiccup mid-settlement")
            return real(intent)

        with patch.object(payment_services, "_handle_succeeded", explode_once):
            reconciled = payment_services.reconcile_stuck_payments()

        self.assertEqual(reconciled, 1)
        first_order.refresh_from_db()
        second_order.refresh_from_db()
        self.assertEqual(first_order.payment_status, "pending")   # retried next pass
        self.assertEqual(second_order.payment_status, "paid")     # unaffected

    def test_never_delivers_an_order_that_was_paid_then_refunded(self):
        """A refund does NOT change a PaymentIntent's status — it stays "succeeded".

        So `status == "succeeded"` alone is not proof the money is still ours. Without
        this check, a charge refunded by hand in the dashboard would be reconciled and an
        eSIM bought and delivered for free. The two orders stranded by the webhook outage
        are precisely that shape: paid, possibly refunded, never delivered.
        """
        order, payment = self._stuck_order()
        self._stripe_says_paid(order, payment, refunded=True, amount_refunded=order.total_minor)

        self.assertEqual(payment_services.reconcile_stuck_payments(), 0)

        order.refresh_from_db()
        self.assertEqual(order.payment_status, "pending")
        self.assertEqual(EsimProfile.objects.filter(order_item__order=order).count(), 0)

    def test_a_partial_refund_also_blocks_delivery(self):
        """Any refunded amount at all. Partial refunds are still money going back."""
        order, payment = self._stuck_order()
        self._stripe_says_paid(order, payment, amount_refunded=1)

        self.assertEqual(payment_services.reconcile_stuck_payments(), 0)

        order.refresh_from_db()
        self.assertEqual(order.payment_status, "pending")

    def test_does_not_re_ask_stripe_about_an_order_already_settled(self):
        """The `order__payment_status="pending"` filter, which is about cost not safety.

        A settled order with a stale `processing` payment is harmless — `_handle_succeeded`
        would see `paid` and return — but without the filter it would be re-queried on
        every pass, for ever, one Stripe API call at a time. Asserted by counting calls,
        because the observable state is identical either way.
        """
        order, payment = self._stuck_order()
        self._stripe_says_paid(order, payment)
        payment_services.reconcile_stuck_payments()
        order.refresh_from_db()
        self.assertEqual(order.payment_status, "paid")

        # Put the payment back to `processing` so only the order filter can exclude it.
        Payment.objects.filter(pk=payment.pk).update(status="processing")

        calls = []
        real = FakeGateway.retrieve_payment_intent

        def counting(self_, intent_id):
            calls.append(intent_id)
            return real(self_, intent_id)

        with patch.object(FakeGateway, "retrieve_payment_intent", counting):
            payment_services.reconcile_stuck_payments()

        self.assertEqual(calls, [])

    def test_limit_bounds_the_stripe_calls_per_pass(self):
        """A backlog drains over several passes rather than tripping rate limits."""
        for _ in range(3):
            order, payment = self._stuck_order()
            self._stripe_says_paid(order, payment)

        self.assertEqual(payment_services.reconcile_stuck_payments(limit=2), 2)
        self.assertEqual(payment_services.reconcile_stuck_payments(limit=2), 1)
