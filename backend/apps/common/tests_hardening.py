"""Regression tests for the audit-driven hardening pass.

Each test pins one specific defect that was found by reading the code and reproduced here
first. They are grouped in one module because they cut across apps; the thing they share is
that every one of them passed silently before the fix.
"""

import json
from pathlib import Path
from unittest.mock import patch

from django.conf import settings
from django.contrib.auth.models import Group
from django.core.exceptions import ImproperlyConfigured
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import Organization, User
from apps.accounts.services import create_commission_for_order
from apps.catalog.models import CatalogPlan, Country, Supplier
from apps.common.exceptions import Conflict
from apps.esims import services as esim_services
from apps.esims.models import SupplierEvent
from apps.orders import services as order_services
from apps.orders.models import PromoCode, PromoRedemption
from apps.payments import services as payment_services
from apps.payments.models import Payment, Refund, WebhookEvent
from apps.payments.stripe import FakeGateway


def _catalogue():
    supplier = Supplier.objects.create(code="s", name="S", status="active")
    country = Country.objects.create(
        iso2="FR", name="France", slug="france", region="Europe", is_active=True
    )
    plan = CatalogPlan.objects.create(
        supplier=supplier, country=country, product_code="FR-5GB-30D",
        supplier_package_code="PKG", plan_type="fixed", display_name="FR 5GB",
        data_limit_mb=5000, validity_days=30, retail_amount_minor=1000,
        wholesale_amount_minor=400, currency="USD", status="active",
    )
    return supplier, country, plan


class DockerBuildContextTests(TestCase):
    """F-01: `COPY . .` with no .dockerignore bakes .env into an image layer."""

    def test_dockerignore_excludes_secrets_and_virtualenv(self):
        backend = Path(settings.BASE_DIR)
        dockerignore = backend / ".dockerignore"
        self.assertTrue(dockerignore.exists(), ".dockerignore is required — Docker ignores .gitignore")
        patterns = {
            line.strip()
            for line in dockerignore.read_text().splitlines()
            if line.strip() and not line.startswith("#")
        }
        for required in (".env", ".env.*", ".venv", ".git"):
            self.assertIn(required, patterns)

    def test_env_example_carries_no_real_secret(self):
        text = (Path(settings.BASE_DIR) / ".env.example").read_text()
        for marker in ("sk_test_", "sk_live_", "pk_test_", "pk_live_", "whsec_", "GOCSPX"):
            self.assertNotIn(marker, text, f"{marker} value committed in .env.example")


class GatewayConfigurationTests(TestCase):
    """F-08: both factories returned the fake provider for any unrecognised name."""

    @override_settings(PAYMENTS_GATEWAY="strpe")
    def test_misspelled_payments_gateway_raises(self):
        from apps.payments.stripe import get_gateway

        with self.assertRaises(ImproperlyConfigured):
            get_gateway()

    @override_settings(SUPPLIER_GATEWAY="esim_acess")
    def test_misspelled_supplier_gateway_raises(self):
        from apps.esims.supplier import get_supplier_gateway

        with self.assertRaises(ImproperlyConfigured):
            get_supplier_gateway()

    def test_holding_supplier_credentials_does_not_arm_the_real_gateway(self):
        """The supplier has no sandbox: every real call spends wallet money."""
        from apps.esims.supplier import FakeSupplier, get_supplier_gateway

        with override_settings(SUPPLIER_GATEWAY="fake", ESIM_SUPPLIER_API_KEY="a-real-key"):
            self.assertIsInstance(get_supplier_gateway(), FakeSupplier)


class EncryptionKeyRingTests(TestCase):
    """F-13: rotating the key version orphaned every existing ciphertext."""

    def test_retired_keys_stay_available_for_decryption(self):
        from cryptography.fernet import Fernet

        from apps.common import encryption

        keys = dict(settings.FIELD_ENCRYPTION_KEYS)
        v1 = keys[settings.FIELD_ENCRYPTION_KEY_VERSION]
        ciphertext, written_version = encryption.encrypt("LPA:1$smdp.example.com$SECRET")
        self.assertEqual(written_version, 1)

        # Rotate to v2 while keeping v1 in the ring, exactly as the settings contract allows.
        with override_settings(
            FIELD_ENCRYPTION_KEYS={1: v1, 2: Fernet.generate_key().decode()},
            FIELD_ENCRYPTION_KEY_VERSION=2,
        ):
            self.assertEqual(
                encryption.decrypt(ciphertext, version=1),
                "LPA:1$smdp.example.com$SECRET",
            )


@override_settings(PAYMENTS_GATEWAY="fake", STRIPE_WEBHOOK_SECRET="whsec_test")
class RefundIdempotencyTests(APITestCase):
    """F-02: a random key per call meant a retry after a failure refunded twice."""

    def setUp(self):
        _catalogue()

    def _paid_order(self, qty=1):
        cart, _ = order_services.create_cart(user=None)
        order_services.add_item(cart, product_code="FR-5GB-30D", quantity=qty)
        order = order_services.checkout(cart_id=cart.id, customer_email="a@b.com")
        payment_services.create_payment_intent_for_order(order)
        payment = Payment.objects.get(order=order)
        event = {
            "id": f"evt_{order.id}", "type": "payment_intent.succeeded",
            "data": {"object": {
                "id": payment.provider_payment_id, "amount": order.total_minor,
                "currency": "usd", "metadata": {"order_id": str(order.id)},
                "status": "succeeded",
            }},
        }
        payload = json.dumps(event)
        self.client.post(
            "/api/v1/webhooks/stripe/", data=payload, content_type="application/json",
            HTTP_STRIPE_SIGNATURE=FakeGateway().sign(payload),
        )
        order.refresh_from_db()
        return order, payment

    def test_a_retry_after_a_crash_reuses_the_provider_key(self):
        """The exact scenario that could refund a customer twice.

        Stripe accepts the refund, then the local transaction dies before commit. The local
        rows roll back, so the operator retries. With a random key per call the retry looked
        like a brand-new refund to Stripe and paid out again; the key must be identical so
        Stripe's own idempotency collapses the two into one.
        """
        order, payment = self._paid_order()
        item = order.items.first()
        allocations = [{"order_item_id": item.id, "amount_minor": 400}]

        keys = []
        real_create_refund = FakeGateway.create_refund

        def capture(gateway_self, **kwargs):
            keys.append(kwargs["idempotency_key"])
            return real_create_refund(gateway_self, **kwargs)

        with patch.object(FakeGateway, "create_refund", capture):
            with patch.object(
                payment_services, "_apply_successful_refund",
                side_effect=RuntimeError("connection lost before commit"),
            ):
                with self.assertRaises(RuntimeError):
                    payment_services.create_refund(payment=payment, allocations=allocations)

            self.assertEqual(
                Refund.objects.filter(payment=payment).count(), 0,
                "the failed attempt must leave no local trace — that is what makes it a retry",
            )
            payment_services.create_refund(payment=payment, allocations=allocations)

        self.assertEqual(len(keys), 2)
        self.assertEqual(
            keys[0], keys[1],
            "the retry presented a different key, so Stripe would refund a second time",
        )
        self.assertEqual(Refund.objects.filter(payment=payment).count(), 1)

    def test_a_deliberate_second_refund_of_the_same_amount_still_works(self):
        """The stable key must not become a permanent lock on repeating an amount."""
        order, payment = self._paid_order(qty=2)
        items = list(order.items.all())

        payment_services.create_refund(
            payment=payment, allocations=[{"order_item_id": items[0].id, "amount_minor": 400}]
        )
        second = payment_services.create_refund(
            payment=payment, allocations=[{"order_item_id": items[1].id, "amount_minor": 400}]
        )

        self.assertEqual(Refund.objects.filter(payment=payment).count(), 2)
        self.assertEqual(second.status, "succeeded")


@override_settings(PAYMENTS_GATEWAY="fake", STRIPE_WEBHOOK_SECRET="whsec_test")
class ReconciliationQuarantineTests(APITestCase):
    """F-19: the failure state was written inside the transaction that then rolled back."""

    def setUp(self):
        _catalogue()

    def test_a_mismatched_event_leaves_the_payment_visibly_failed(self):
        cart, _ = order_services.create_cart(user=None)
        order_services.add_item(cart, product_code="FR-5GB-30D", quantity=1)
        order = order_services.checkout(cart_id=cart.id, customer_email="a@b.com")
        payment_services.create_payment_intent_for_order(order)
        payment = Payment.objects.get(order=order)
        self.assertEqual(payment.status, "processing")

        # Signed correctly, but the amount does not match the stored order.
        payload = json.dumps({
            "id": "evt_mismatch", "type": "payment_intent.succeeded",
            "data": {"object": {
                "id": payment.provider_payment_id, "amount": 999999,
                "currency": "usd", "metadata": {"order_id": str(order.id)},
            }},
        })
        response = self.client.post(
            "/api/v1/webhooks/stripe/", data=payload, content_type="application/json",
            HTTP_STRIPE_SIGNATURE=FakeGateway().sign(payload),
        )
        self.assertEqual(response.status_code, 409)

        payment.refresh_from_db()
        order.refresh_from_db()
        # The whole point: previously this stayed "processing" because the save was
        # rolled back by the raise, so nothing downstream could see the bad payment.
        self.assertEqual(payment.status, "failed")
        self.assertEqual(payment.failure_code, "reconciliation_mismatch")
        # And the order must still not be paid on an unreconciled event.
        self.assertEqual(order.payment_status, "pending")
        self.assertEqual(
            WebhookEvent.objects.get(external_event_id="evt_mismatch").status, "failed"
        )

    def test_a_later_good_event_is_not_blocked_by_the_quarantine(self):
        """Quarantine must not become a permanent lock on a recoverable intent."""
        cart, _ = order_services.create_cart(user=None)
        order_services.add_item(cart, product_code="FR-5GB-30D", quantity=1)
        order = order_services.checkout(cart_id=cart.id, customer_email="a@b.com")
        payment_services.create_payment_intent_for_order(order)
        payment = Payment.objects.get(order=order)

        def deliver(event_id, amount):
            payload = json.dumps({
                "id": event_id, "type": "payment_intent.succeeded",
                "data": {"object": {
                    "id": payment.provider_payment_id, "amount": amount,
                    "currency": "usd", "metadata": {"order_id": str(order.id)},
                }},
            })
            return self.client.post(
                "/api/v1/webhooks/stripe/", data=payload, content_type="application/json",
                HTTP_STRIPE_SIGNATURE=FakeGateway().sign(payload),
            )

        self.assertEqual(deliver("evt_bad", 999999).status_code, 409)
        self.assertEqual(deliver("evt_good", order.total_minor).status_code, 200)

        order.refresh_from_db()
        payment.refresh_from_db()
        self.assertEqual(order.payment_status, "paid")
        self.assertEqual(payment.status, "succeeded")


@override_settings(PAYMENTS_GATEWAY="fake", STRIPE_WEBHOOK_SECRET="whsec_test")
class WebhookAbuseTests(APITestCase):
    """F-24: every invalid signature wrote a durable row to the primary database."""

    def test_invalid_signatures_do_not_grow_the_database(self):
        before = WebhookEvent.objects.count()
        for _ in range(5):
            response = self.client.post(
                "/api/v1/webhooks/stripe/", data=json.dumps({"id": "evt", "type": "x"}),
                content_type="application/json", HTTP_STRIPE_SIGNATURE="forged",
            )
            self.assertEqual(response.status_code, 400)
        self.assertEqual(WebhookEvent.objects.count(), before)


@override_settings(PAYMENTS_GATEWAY="fake", STRIPE_WEBHOOK_SECRET="whsec_test")
class PromoLedgerTests(APITestCase):
    """F-04: a failed-then-successful intent kept the discount but freed the redemption."""

    def setUp(self):
        _catalogue()

    def test_failed_then_successful_intent_still_consumes_the_promo(self):
        PromoCode.objects.create(
            code="TEN", discount_type="percentage_bps", discount_value=1000, usage_limit=1
        )
        cart, _ = order_services.create_cart(user=None)
        order_services.add_item(cart, product_code="FR-5GB-30D", quantity=1)
        order = order_services.checkout(
            cart_id=cart.id, customer_email="a@b.com", promo_code="TEN"
        )
        payment_services.create_payment_intent_for_order(order)
        payment = Payment.objects.get(order=order)

        def deliver(event_type, event_id):
            payload = json.dumps({
                "id": event_id, "type": event_type,
                "data": {"object": {
                    "id": payment.provider_payment_id, "amount": order.total_minor,
                    "currency": "usd", "metadata": {"order_id": str(order.id)},
                }},
            })
            return self.client.post(
                "/api/v1/webhooks/stripe/", data=payload, content_type="application/json",
                HTTP_STRIPE_SIGNATURE=FakeGateway().sign(payload),
            )

        deliver("payment_intent.payment_failed", "evt_fail")
        self.assertEqual(PromoRedemption.objects.get(order=order).status, "released")

        # Stripe allows the same intent to succeed later with another payment method.
        deliver("payment_intent.succeeded", "evt_ok")

        order.refresh_from_db()
        self.assertEqual(order.payment_status, "paid")
        self.assertEqual(
            PromoRedemption.objects.get(order=order).status, "consumed",
            "the order kept its discount, so the redemption must count against the limit",
        )


class CartBoundsTests(TestCase):
    """F-07: one request could expand into an unbounded number of rows and supplier jobs."""

    def setUp(self):
        _catalogue()

    def test_aggregate_cart_units_are_capped(self):
        cart, _ = order_services.create_cart(user=None)
        with self.assertRaises(Conflict) as ctx:
            order_services.add_item(
                cart, product_code="FR-5GB-30D",
                quantity=order_services.MAX_CART_UNITS + 1,
            )
        self.assertEqual(ctx.exception.error_code, "cart_limit_exceeded")

    def test_checkout_rejects_a_cart_that_bypassed_the_cap(self):
        cart, _ = order_services.create_cart(user=None)
        order_services.add_item(cart, product_code="FR-5GB-30D", quantity=1)
        # Simulate a cart built before the cap existed.
        cart.items.all().update(quantity=order_services.MAX_CART_UNITS + 5)
        with self.assertRaises(Conflict):
            order_services.checkout(cart_id=cart.id, customer_email="a@b.com")


class WorkerResilienceTests(TestCase):
    """F-06: one poisoned job halted the worker; a crash stranded a claim forever."""

    def setUp(self):
        _, _, self.plan = _catalogue()
        cart, _ = order_services.create_cart(user=None)
        order_services.add_item(cart, product_code="FR-5GB-30D", quantity=1)
        self.order = order_services.checkout(cart_id=cart.id, customer_email="a@b.com")
        self.order.payment_status = "paid"
        self.order.status = "paid"
        self.order.save(update_fields=["payment_status", "status"])
        esim_services.enqueue_provisioning_for_order(self.order)

    def test_an_unexpected_exception_does_not_escape_the_worker(self):
        with patch.object(
            esim_services, "_process_provision", side_effect=RuntimeError("boom")
        ):
            # Before the fix this propagated out of the worker's infinite loop.
            esim_services.claim_and_process_one()

        event = SupplierEvent.objects.first()
        self.assertNotEqual(event.status, "processing")
        self.assertIn("RuntimeError", event.error_message or "")

    def test_a_stale_claim_is_returned_to_the_queue(self):
        event = SupplierEvent.objects.first()
        SupplierEvent.objects.filter(pk=event.pk).update(
            status="processing",
            locked_at=timezone.now()
            - timezone.timedelta(seconds=esim_services.STALE_LEASE_SECONDS + 60),
        )

        self.assertEqual(esim_services.reclaim_stale_events(), 1)
        event.refresh_from_db()
        self.assertEqual(event.status, "retrying")

    def test_a_fresh_claim_is_left_alone(self):
        SupplierEvent.objects.all().update(status="processing", locked_at=timezone.now())
        self.assertEqual(esim_services.reclaim_stale_events(), 0)


class AllauthSurfaceTests(TestCase):
    """F-03: allauth's own account views bypassed the platform-issued credential rule."""

    def test_account_management_routes_are_not_served(self):
        for path in (
            "/accounts/signup/",
            "/accounts/password/reset/",
            "/accounts/password/change/",
            "/accounts/email/",
        ):
            self.assertEqual(self.client.get(path).status_code, 404, path)

    def test_google_oauth_entry_point_still_works(self):
        response = self.client.get("/accounts/google/login/")
        self.assertEqual(response.status_code, 302)
        self.assertIn("accounts.google.com", response["Location"])


class OpsAuthorizationTests(APITestCase):
    """F-09: a read-only role held the capability guarding a money-spending retry."""

    def setUp(self):
        _, _, plan = _catalogue()
        self.readonly = User.objects.create_user(
            email="ro@example.com", password="pw-123456789", is_staff=True
        )
        self.readonly.groups.add(Group.objects.get_or_create(name="readonly_admin")[0])
        self.ops = User.objects.create_user(
            email="ops@example.com", password="pw-123456789", is_staff=True
        )
        self.ops.groups.add(Group.objects.get_or_create(name="platform_admin")[0])

        cart, _ = order_services.create_cart(user=None)
        order_services.add_item(cart, product_code="FR-5GB-30D", quantity=1)
        order = order_services.checkout(cart_id=cart.id, customer_email="a@b.com")
        order.payment_status = "paid"
        order.status = "paid"
        order.save(update_fields=["payment_status", "status"])
        esim_services.enqueue_provisioning_for_order(order)
        self.event = SupplierEvent.objects.first()
        SupplierEvent.objects.filter(pk=self.event.pk).update(status="manual_review")

    def test_readonly_may_list_but_not_retry(self):
        self.client.force_authenticate(self.readonly)
        self.assertEqual(self.client.get("/api/v1/admin/supplier-events/").status_code, 200)
        self.assertEqual(
            self.client.post(f"/api/v1/admin/supplier-events/{self.event.id}/retry/").status_code,
            403,
        )

    def test_an_operations_role_may_retry(self):
        self.client.force_authenticate(self.ops)
        response = self.client.post(
            f"/api/v1/admin/supplier-events/{self.event.id}/retry/"
        )
        self.assertEqual(response.status_code, 200)


class AgencyMembershipPolicyTests(TestCase):
    """F-10: any historical membership permanently changed how an account could log in."""

    def test_only_an_active_membership_brands_an_account(self):
        from apps.accounts import services as account_services
        from apps.accounts.models import OrganizationMember

        org = Organization.objects.create(
            name="A", organization_type="travel_agency",
            billing_email="a@a.com", status="active",
        )
        customer = User.objects.create_user(email="c@example.com", password="pw-123456789")
        membership = OrganizationMember.objects.create(
            organization=org, user=customer, role="viewer", status="active"
        )
        self.assertTrue(account_services.is_agency_account(user=customer))

        membership.status = "disabled"
        membership.save(update_fields=["status"])
        self.assertFalse(
            account_services.is_agency_account(user=customer),
            "removing someone from an agency must restore their normal login",
        )


@override_settings(PAYMENTS_GATEWAY="fake", STRIPE_WEBHOOK_SECRET="whsec_test")
class CommissionReversalTests(APITestCase):
    """A full refund must reverse the whole commission, discount or not.

    Accrual is computed on the post-discount amount, so reversal has to divide by the same
    post-discount figure. Dividing by the pre-discount subtotal under-reverses by exactly
    the discount ratio, and the leftover stays `pending` — which is inside
    APPROVABLE_COMMISSION_STATES, so it is still payable. Real money leaves.
    """

    def setUp(self):
        _catalogue()
        self.org = Organization.objects.create(
            name="Agency", organization_type="travel_agency",
            billing_email="a@agency.com", status="active",
        )

    def _paid_order(self, *, promo_code=None):
        cart, _ = order_services.create_cart(user=None)
        order_services.add_item(cart, product_code="FR-5GB-30D", quantity=10)  # 10 x 1000
        order = order_services.checkout(
            cart_id=cart.id, customer_email="a@b.com", promo_code=promo_code
        )
        payment_services.create_payment_intent_for_order(order)
        payment = Payment.objects.get(order=order)
        payload = json.dumps({
            "id": f"evt_{order.id}", "type": "payment_intent.succeeded",
            "data": {"object": {
                "id": payment.provider_payment_id, "amount": order.total_minor,
                "currency": order.currency.lower(),
                "metadata": {"order_id": str(order.id)},
            }},
        })
        self.client.post("/api/v1/webhooks/stripe/", data=payload,
                         content_type="application/json",
                         HTTP_STRIPE_SIGNATURE=FakeGateway().sign(payload))
        order.refresh_from_db()
        return order, payment

    def test_full_refund_of_a_discounted_order_reverses_all_commission(self):
        PromoCode.objects.create(
            code="AG20", kind="tracking", organization=self.org,
            discount_type="percentage_bps", discount_value=0,
            commission_type="percentage_bps", commission_value=2000,
        )
        # A separate platform discount, so subtotal != total.
        PromoCode.objects.create(
            code="SAVE20", discount_type="percentage_bps", discount_value=2000,
        )
        order, payment = self._paid_order(promo_code="SAVE20")
        self.assertGreater(order.discount_minor, 0, "test needs a discounted order")

        # Attribute the sale to the agency so a commission exists.
        order.referring_organization = self.org
        order.promo_code = PromoCode.objects.get(code="AG20")
        order.save(update_fields=["referring_organization", "promo_code"])
        commission = create_commission_for_order(order)
        self.assertIsNotNone(commission)

        # Give the customer back everything they actually paid. That is the discounted
        # total, not the sum of list prices — refunding the latter exceeds the refundable
        # balance and is refused, correctly.
        items = list(order.items.all())
        share = order.total_minor // len(items)
        allocations = [{"order_item_id": i.id, "amount_minor": share} for i in items]
        self.assertEqual(sum(a["amount_minor"] for a in allocations), order.total_minor)
        payment_services.create_refund(payment=payment, allocations=allocations)

        commission.refresh_from_db()
        self.assertEqual(
            commission.reversed_minor, commission.commission_minor,
            "a fully refunded order must leave no payable commission",
        )
        self.assertEqual(commission.status, "reversed")


@override_settings(PAYMENTS_GATEWAY="fake", STRIPE_WEBHOOK_SECRET="whsec_test")
class AsyncRefundTests(APITestCase):
    """A refund the gateway completes later must still finalise locally.

    FakeGateway always returns "succeeded", so the asynchronous branch is unreachable
    without patching it — which is precisely why the gap survived: no test could see it.
    """

    def setUp(self):
        _catalogue()

    def _paid(self):
        cart, _ = order_services.create_cart(user=None)
        order_services.add_item(cart, product_code="FR-5GB-30D", quantity=1)
        order = order_services.checkout(cart_id=cart.id, customer_email="a@b.com")
        payment_services.create_payment_intent_for_order(order)
        payment = Payment.objects.get(order=order)
        payload = json.dumps({
            "id": f"evt_{order.id}", "type": "payment_intent.succeeded",
            "data": {"object": {
                "id": payment.provider_payment_id, "amount": order.total_minor,
                "currency": "usd", "metadata": {"order_id": str(order.id)},
            }},
        })
        self.client.post("/api/v1/webhooks/stripe/", data=payload,
                         content_type="application/json",
                         HTTP_STRIPE_SIGNATURE=FakeGateway().sign(payload))
        order.refresh_from_db()
        return order, payment

    def _deliver(self, event_type, obj, eid):
        payload = json.dumps({"id": eid, "type": event_type, "data": {"object": obj}})
        return self.client.post("/api/v1/webhooks/stripe/", data=payload,
                                content_type="application/json",
                                HTTP_STRIPE_SIGNATURE=FakeGateway().sign(payload))

    def test_a_pending_refund_is_finalised_by_the_webhook(self):
        order, payment = self._paid()
        item = order.items.first()

        with patch.object(FakeGateway, "create_refund",
                          lambda s, **kw: {"id": "re_async_1", "status": "pending"}):
            refund = payment_services.create_refund(
                payment=payment,
                allocations=[{"order_item_id": item.id, "amount_minor": order.total_minor}],
            )
        self.assertEqual(refund.status, "processing")
        order.refresh_from_db()
        self.assertEqual(order.payment_status, "paid", "not refunded yet — correct")

        # Stripe finishes the refund later and tells us.
        response = self._deliver("refund.updated",
                                 {"id": "re_async_1", "status": "succeeded"}, "evt_ru")
        self.assertEqual(response.status_code, 200)

        refund.refresh_from_db(); order.refresh_from_db()
        self.assertEqual(refund.status, "succeeded")
        self.assertIsNotNone(refund.completed_at)
        self.assertEqual(order.payment_status, "refunded")

    def test_a_failed_refund_is_marked_failed(self):
        order, payment = self._paid()
        item = order.items.first()
        with patch.object(FakeGateway, "create_refund",
                          lambda s, **kw: {"id": "re_async_2", "status": "pending"}):
            refund = payment_services.create_refund(
                payment=payment,
                allocations=[{"order_item_id": item.id, "amount_minor": 400}],
            )
        self._deliver("refund.updated", {"id": "re_async_2", "status": "failed"}, "evt_rf")
        refund.refresh_from_db(); order.refresh_from_db()
        self.assertEqual(refund.status, "failed")
        self.assertEqual(order.payment_status, "paid", "a failed refund must not refund the order")

    def test_an_unhandled_event_is_not_silently_absorbed(self):
        """A dispute must be logged loudly, not answered 200 and forgotten."""
        with self.assertLogs("apps.payments.services", level="ERROR") as logs:
            self._deliver("charge.dispute.created", {"id": "dp_1"}, "evt_dp")
        self.assertTrue(any("Unhandled Stripe event" in m for m in logs.output))
