import json

from django.test import override_settings
from rest_framework.test import APITestCase

from apps.accounts.models import Organization, PartnerCommission
from apps.catalog.models import CatalogPlan, Country, Supplier
from apps.common.exceptions import RefundLimitExceeded
from apps.orders import services as order_services
from apps.orders.models import PromoCode, PromoRedemption
from apps.payments import services as payment_services
from apps.payments.models import Payment, Refund, WebhookEvent
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
