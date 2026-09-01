import json

from django.conf import settings
from django.core import mail
from django.test import TestCase, override_settings
from rest_framework.test import APITestCase

from apps.administration.models import AuditEvent

from apps.accounts.models import User
from apps.catalog.models import CatalogPlan, Country, Supplier
from apps.common.exceptions import Conflict, PlanUnavailable, PromoUsageExceeded
from apps.esims import services as esim_services
from apps.esims.models import EsimProfile
from apps.common.exceptions import PromoInvalid
from apps.accounts.models import Organization
from apps.accounts.services import create_agency_tracking_code
from apps.orders import services
from apps.orders.models import Cart, Notification, Order, OrderItem, PromoCode, PromoRedemption
from apps.orders.notifications import queue_notification, send_pending_notifications


def make_plan(country, supplier, code, retail, validity=30, status="active"):
    return CatalogPlan.objects.create(
        supplier=supplier, country=country, product_code=code,
        supplier_package_code=f"PKG-{code}", plan_type="fixed", display_name=code,
        data_limit_mb=5000, validity_days=validity, retail_amount_minor=retail,
        wholesale_amount_minor=retail // 2, currency="USD", status=status,
    )


class CheckoutServiceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.supplier = Supplier.objects.create(code="esim-access", name="eSIM Access", status="active")
        cls.country = Country.objects.create(
            iso2="FR", name="France", slug="france", region="Europe", is_active=True
        )
        cls.plan = make_plan(cls.country, cls.supplier, "FR-5GB-30D", 1500)

    def _guest_cart_with(self, plan, qty):
        cart, _ = services.create_cart(user=None)
        services.add_item(cart, product_code=plan.product_code, quantity=qty)
        return cart

    # -- promo preview ------------------------------------------------------------------

    def _items(self, qty=2):
        return [{"product_code": self.plan.product_code, "quantity": qty}]

    def test_preview_matches_the_order_it_predicts(self):
        """The figure shown and the figure charged must be the same number.

        The preview reimplements `create_order`'s arithmetic — price in USD, discount in
        USD, resolve the charge currency from the DISCOUNTED base, convert, cap the
        converted discount at the converted subtotal. Any step done differently is a
        customer quoted one total and billed another, which is the whole reason this
        assertion compares against a real order rather than hard-coded numbers.
        """
        PromoCode.objects.create(
            code="PREVIEW20", discount_type="percentage_bps", discount_value=2000,
        )
        preview = services.preview_direct_promo(
            items=self._items(), promo_code="preview20", customer_email="a@b.com"
        )
        order = services.checkout_direct(
            items=self._items(), customer_email="a@b.com", promo_code="preview20"
        )
        self.assertEqual(preview["subtotal_minor"], order.subtotal_minor)
        self.assertEqual(preview["discount_minor"], order.discount_minor)
        self.assertEqual(preview["total_minor"], order.total_minor)
        self.assertEqual(preview["currency"], order.currency)

    def test_a_tracking_code_previews_at_full_price(self):
        """An agency referral attributes a sale; it never reduces one.

        The database forbids a tracking code from carrying a discount
        (`promo_tracking_has_no_discount`). This asserts the preview agrees, so the
        checkout can never show a referral as money off — the customer pays list price
        and the agency earns commission on it.
        """
        org = Organization.objects.create(
            name="Desert Tours", organization_type="travel_agency", status="active",
        )
        promo = create_agency_tracking_code(org, code="DESERTTOURS", commission_bps=2000)

        preview = services.preview_direct_promo(
            items=self._items(), promo_code="deserttours", customer_email="a@b.com"
        )

        self.assertEqual(preview["kind"], "tracking")
        self.assertEqual(preview["discount_minor"], 0)
        self.assertEqual(preview["total_minor"], preview["subtotal_minor"])
        self.assertEqual(promo.discount_value, 0)

    def test_a_tracking_code_attributes_the_order_to_its_agency(self):
        """The whole point of the code: the order must carry the referring agency."""
        org = Organization.objects.create(
            name="Desert Tours", organization_type="travel_agency", status="active",
        )
        create_agency_tracking_code(org, code="DESERTTOURS2", commission_bps=2000)

        order = services.checkout_direct(
            items=self._items(), customer_email="a@b.com", promo_code="DESERTTOURS2"
        )

        self.assertEqual(order.referring_organization_id, org.id)
        self.assertEqual(order.discount_minor, 0)
        self.assertEqual(order.total_minor, order.subtotal_minor)

    def test_preview_reports_the_kind_for_a_discount_code_too(self):
        PromoCode.objects.create(
            code="REALDISCOUNT", discount_type="percentage_bps", discount_value=1000,
        )
        preview = services.preview_direct_promo(
            items=self._items(), promo_code="REALDISCOUNT", customer_email="a@b.com"
        )
        self.assertEqual(preview["kind"], "discount")
        self.assertGreater(preview["discount_minor"], 0)

    def test_preview_does_not_consume_a_usage_slot(self):
        """Previewing must be free. It uses `_validate_promo`, never `_reserve_promo`.

        A shopper who types a code, reconsiders and retypes it would otherwise burn two
        uses of a limited code — and could exhaust it without ever buying anything.
        """
        PromoCode.objects.create(
            code="ONESHOT", discount_type="percentage_bps", discount_value=5000, usage_limit=1,
        )
        for _ in range(3):
            services.preview_direct_promo(
                items=self._items(), promo_code="ONESHOT", customer_email="a@b.com"
            )
        self.assertEqual(PromoRedemption.objects.count(), 0)

        order = services.checkout_direct(
            items=self._items(), customer_email="a@b.com", promo_code="ONESHOT"
        )
        self.assertEqual(order.discount_minor, order.subtotal_minor // 2)

    def test_preview_rejects_an_unknown_code(self):
        with self.assertRaises(PromoInvalid):
            services.preview_direct_promo(
                items=self._items(), promo_code="NOPE", customer_email="a@b.com"
            )

    def test_preview_prices_a_full_discount_to_zero(self):
        """The 100%% case, which is what makes a zero-total order settle without Stripe."""
        PromoCode.objects.create(
            code="ALLFREE", discount_type="percentage_bps", discount_value=10000,
        )
        preview = services.preview_direct_promo(
            items=self._items(), promo_code="ALLFREE", customer_email="a@b.com"
        )
        self.assertEqual(preview["total_minor"], 0)
        self.assertEqual(preview["discount_minor"], preview["subtotal_minor"])

    def test_quantity_expands_into_individual_order_items(self):
        cart = self._guest_cart_with(self.plan, 3)
        order = services.checkout(cart_id=cart.id, customer_email="a@b.com")
        self.assertEqual(order.items.count(), 3)
        self.assertEqual(order.subtotal_minor, 4500)
        self.assertEqual(order.total_minor, 4500)
        self.assertTrue(order.order_number.startswith("ESF-"))
        self.assertEqual(order.status, "pending_payment")

    def test_checkout_uses_current_db_price_not_cart_price(self):
        cart = self._guest_cart_with(self.plan, 1)
        CatalogPlan.objects.filter(pk=self.plan.pk).update(retail_amount_minor=9999)
        order = services.checkout(cart_id=cart.id, customer_email="a@b.com")
        self.assertEqual(order.subtotal_minor, 9999)
        self.assertEqual(order.items.first().unit_amount_minor, 9999)

    def test_paused_plan_cannot_be_added(self):
        paused = make_plan(self.country, self.supplier, "FR-PAUSED", 800, status="paused")
        cart, _ = services.create_cart(user=None)
        with self.assertRaises(PlanUnavailable):
            services.add_item(cart, product_code=paused.product_code, quantity=1)

    def test_paused_plan_blocks_checkout(self):
        cart = self._guest_cart_with(self.plan, 1)
        CatalogPlan.objects.filter(pk=self.plan.pk).update(status="paused")
        with self.assertRaises(PlanUnavailable):
            services.checkout(cart_id=cart.id, customer_email="a@b.com")

    def test_duplicate_checkout_does_not_duplicate_order(self):
        cart = self._guest_cart_with(self.plan, 1)
        services.checkout(cart_id=cart.id, customer_email="a@b.com")
        with self.assertRaises(Conflict):
            services.checkout(cart_id=cart.id, customer_email="a@b.com")
        self.assertEqual(Order.objects.count(), 1)

    def test_empty_cart_checkout_conflict(self):
        cart, _ = services.create_cart(user=None)
        with self.assertRaises(Conflict):
            services.checkout(cart_id=cart.id, customer_email="a@b.com")

    def test_snapshot_is_immutable_after_plan_change(self):
        cart = self._guest_cart_with(self.plan, 1)
        order = services.checkout(cart_id=cart.id, customer_email="a@b.com")
        CatalogPlan.objects.filter(pk=self.plan.pk).update(
            display_name="CHANGED", retail_amount_minor=1
        )
        item = order.items.first()
        item.refresh_from_db()
        self.assertEqual(item.product_name, "FR-5GB-30D")
        self.assertEqual(item.unit_amount_minor, 1500)

    def test_percentage_promo_discount_and_reservation(self):
        PromoCode.objects.create(
            code="SAVE20", discount_type="percentage_bps", discount_value=2000,
        )
        cart = self._guest_cart_with(self.plan, 2)  # subtotal 3000
        order = services.checkout(cart_id=cart.id, customer_email="a@b.com", promo_code="save20")
        self.assertEqual(order.discount_minor, 600)  # 20% of 3000
        self.assertEqual(order.total_minor, 2400)
        self.assertEqual(order.promo_code_snapshot, "SAVE20")
        redemption = PromoRedemption.objects.get(order=order)
        self.assertEqual(redemption.status, "reserved")

    def test_fixed_discount_cannot_exceed_subtotal(self):
        PromoCode.objects.create(
            code="BIG", discount_type="fixed", discount_value=999999, discount_currency="USD",
        )
        cart = self._guest_cart_with(self.plan, 1)  # subtotal 1500
        order = services.checkout(cart_id=cart.id, customer_email="a@b.com", promo_code="BIG")
        self.assertEqual(order.discount_minor, 1500)
        self.assertEqual(order.total_minor, 0)

    def test_promo_usage_limit_enforced(self):
        PromoCode.objects.create(
            code="ONCE", discount_type="fixed", discount_value=100,
            discount_currency="USD", usage_limit=1,
        )
        c1 = self._guest_cart_with(self.plan, 1)
        services.checkout(cart_id=c1.id, customer_email="a@b.com", promo_code="ONCE")
        c2 = self._guest_cart_with(self.plan, 1)
        with self.assertRaises(PromoUsageExceeded):
            services.checkout(cart_id=c2.id, customer_email="c@d.com", promo_code="ONCE")


class CartCheckoutAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.supplier = Supplier.objects.create(code="esim-access", name="eSIM Access", status="active")
        cls.country = Country.objects.create(
            iso2="FR", name="France", slug="france", region="Europe", is_active=True
        )
        cls.plan = make_plan(cls.country, cls.supplier, "FR-5GB-30D", 1500)

    def test_guest_cart_token_flow_and_checkout(self):
        add = self.client.post(
            "/api/v1/cart/items/", {"product_code": "FR-5GB-30D", "quantity": 2}, format="json"
        )
        self.assertEqual(add.status_code, 201)
        token = add["X-Cart-Token"]
        self.assertTrue(token)
        self.assertEqual(add.data["item_count"], 2)
        self.assertEqual(add.data["subtotal_minor"], 3000)

        checkout = self.client.post(
            "/api/v1/checkout/", {"customer_email": "guest@example.com"},
            format="json", HTTP_X_CART_TOKEN=token,
        )
        self.assertEqual(checkout.status_code, 201)
        self.assertEqual(checkout.data["total_minor"], 3000)
        self.assertEqual(len(checkout.data["items"]), 2)
        order = Order.objects.get(order_number=checkout.data["order_number"])
        self.assertIsNone(order.user_id)

    def test_guest_order_item_has_no_wholesale_field(self):
        add = self.client.post(
            "/api/v1/cart/items/", {"product_code": "FR-5GB-30D"}, format="json"
        )
        token = add["X-Cart-Token"]
        checkout = self.client.post(
            "/api/v1/checkout/", {"customer_email": "guest@example.com"},
            format="json", HTTP_X_CART_TOKEN=token,
        )
        self.assertNotIn("wholesale_amount_minor", checkout.data["items"][0])
        self.assertNotIn("supplier_package_code", checkout.data["items"][0])

    def test_checkout_requires_email_for_guest(self):
        add = self.client.post(
            "/api/v1/cart/items/", {"product_code": "FR-5GB-30D"}, format="json"
        )
        token = add["X-Cart-Token"]
        response = self.client.post(
            "/api/v1/checkout/", {}, format="json", HTTP_X_CART_TOKEN=token
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"]["code"], "validation_error")

    def test_authenticated_order_list_scoped_to_user(self):
        user = User.objects.create_user(email="owner@example.com", password="pw-123456789")
        other = User.objects.create_user(email="other@example.com", password="pw-123456789")
        cart, _ = services.create_cart(user=other)
        services.add_item(cart, product_code="FR-5GB-30D", quantity=1)
        services.checkout(cart_id=cart.id, customer_email="other@example.com", user=other)

        self.client.force_authenticate(user)
        response = self.client.get("/api/v1/orders/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 0)


@override_settings(SUPPLIER_GATEWAY="fake")
class GuestLookupTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.supplier = Supplier.objects.create(
            code="esim-access", name="eSIM Access", status="active"
        )
        cls.country = Country.objects.create(
            iso2="FR", name="France", slug="france", region="Europe", is_active=True
        )
        cls.plan = make_plan(cls.country, cls.supplier, "FR-5GB-30D", 1500)

    def _guest_order(self):
        cart, _ = services.create_cart(user=None)
        services.add_item(cart, product_code="FR-5GB-30D", quantity=1)
        return services.checkout(cart_id=cart.id, customer_email="guest@example.com")

    def test_lookup_returns_order_for_matching_email(self):
        order = self._guest_order()
        response = self.client.post(
            "/api/v1/orders/lookup/",
            {"order_number": order.order_number, "email": "guest@example.com"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["order"]["order_number"], order.order_number)
        self.assertIn("esims", response.data)

    def test_lookup_wrong_email_returns_404(self):
        order = self._guest_order()
        response = self.client.post(
            "/api/v1/orders/lookup/",
            {"order_number": order.order_number, "email": "wrong@example.com"},
            format="json",
        )
        self.assertEqual(response.status_code, 404)

    def test_lookup_is_throttled(self):
        """Guest lookup returns decrypted credentials, so it must be rate limited."""
        from apps.orders.views import OrderLookupView

        self.assertEqual(OrderLookupView.throttle_scope, "lookup")
        self.assertIn("lookup", settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"])

    def test_successful_lookup_is_audited(self):
        order = self._guest_order()
        self.client.post(
            "/api/v1/orders/lookup/",
            {"order_number": order.order_number, "email": "guest@example.com"},
            format="json",
        )
        event = AuditEvent.objects.get(action="order.credentials_viewed")
        self.assertEqual(event.object_id, order.id)
        self.assertEqual(event.context["order_number"], order.order_number)

    def test_failed_lookup_is_audited(self):
        self.client.post(
            "/api/v1/orders/lookup/",
            {"order_number": "ESF-DOESNOTEXIST", "email": "nobody@example.com"},
            format="json",
        )
        self.assertTrue(AuditEvent.objects.filter(action="order.lookup_failed").exists())

    def test_lookup_audit_contains_no_credentials(self):
        order = self._guest_order()
        esim_services.enqueue_provisioning_for_order(order)
        while esim_services.claim_and_process_one():
            pass
        profile = EsimProfile.objects.get(order_item__order=order)
        credentials = esim_services.decrypt_credentials(profile)

        self.client.post(
            "/api/v1/orders/lookup/",
            {"order_number": order.order_number, "email": "guest@example.com"},
            format="json",
        )
        blob = json.dumps(
            list(AuditEvent.objects.values("changes", "context", "object_repr"))
        )
        for secret in credentials.values():
            self.assertNotIn(secret, blob)


@override_settings(SUPPLIER_GATEWAY="fake")
class NotificationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.supplier = Supplier.objects.create(
            code="esim-access", name="eSIM Access", status="active"
        )
        cls.country = Country.objects.create(
            iso2="FR", name="France", slug="france", region="Europe", is_active=True
        )
        cls.plan = make_plan(cls.country, cls.supplier, "FR-5GB-30D", 1500)

    def test_queue_and_send(self):
        queue_notification(
            template_code="order-confirmation", recipient="a@b.com", idempotency_key="k1"
        )
        self.assertEqual(send_pending_notifications(), 1)
        notification = Notification.objects.get(idempotency_key="k1")
        self.assertEqual(notification.status, "sent")
        self.assertEqual(len(mail.outbox), 1)

    def test_queue_is_idempotent(self):
        queue_notification(
            template_code="order-confirmation", recipient="a@b.com", idempotency_key="dup"
        )
        queue_notification(
            template_code="order-confirmation", recipient="a@b.com", idempotency_key="dup"
        )
        self.assertEqual(Notification.objects.filter(idempotency_key="dup").count(), 1)

    @override_settings(EMAIL_INCLUDE_ACTIVATION=False)
    def test_esim_ready_email_excludes_secrets_when_withholding_is_configured(self):
        """The withholding branch, kept reachable and kept tested.

        `EMAIL_INCLUDE_ACTIVATION` now defaults to True, because a traveller has no
        mobile data until the eSIM works and cannot reach a login screen to fetch the
        code. This test pins the OFF branch so turning it back off is one env var and
        still provably withholds both the activation code and the QR payload.
        """
        cart, _ = services.create_cart(user=None)
        services.add_item(cart, product_code="FR-5GB-30D", quantity=1)
        order = services.checkout(cart_id=cart.id, customer_email="a@b.com")
        esim_services.enqueue_provisioning_for_order(order)
        while esim_services.claim_and_process_one():
            pass
        send_pending_notifications()

        profile = EsimProfile.objects.get(order_item__order=order)
        credentials = esim_services.decrypt_credentials(profile)
        bodies = "\n".join(message.body for message in mail.outbox)
        self.assertTrue(
            Notification.objects.filter(template_code="esim-ready", status="sent").exists()
        )
        self.assertNotIn(credentials["activation_code"], bodies)
        self.assertNotIn(credentials["qr_payload"], bodies)

    @override_settings(EMAIL_INCLUDE_ACTIVATION=True)
    def test_esim_ready_email_carries_the_activation_code_by_default(self):
        """The shipped default. Without this the customer is told to sign in to a site
        they cannot load, because the eSIM they are installing IS their internet."""
        cart, _ = services.create_cart(user=None)
        services.add_item(cart, product_code="FR-5GB-30D", quantity=1)
        order = services.checkout(cart_id=cart.id, customer_email="a@b.com")
        esim_services.enqueue_provisioning_for_order(order)
        while esim_services.claim_and_process_one():
            pass
        send_pending_notifications()

        profile = EsimProfile.objects.get(order_item__order=order)
        credentials = esim_services.decrypt_credentials(profile)
        bodies = "\n".join(
            message.body + "\n".join(c for c, _ in message.alternatives)
            for message in mail.outbox
        )
        self.assertIn(credentials["activation_code"], bodies)
