"""Cart-free checkout.

The point of these is equivalence: an order created directly must be indistinguishable
from one created through a cart, because both go through the same `create_order`. If the
two ever diverge, refunds, commissions and reports diverge with them.
"""

import json

from django.test import TestCase, override_settings
from rest_framework.test import APITestCase

from apps.catalog.models import CatalogPlan, Country, Supplier
from apps.common.exceptions import Conflict, PlanUnavailable
from apps.orders import services
from apps.orders.models import Order, PromoCode, PromoRedemption


def _catalogue():
    supplier = Supplier.objects.create(code="s", name="S", status="active")
    country = Country.objects.create(
        iso2="TR", name="Turkey", slug="turkey", region="Europe", is_active=True
    )
    CatalogPlan.objects.create(
        supplier=supplier, country=country, product_code="TUR-1GB-7D-V1",
        supplier_package_code="PKG", plan_type="fixed", display_name="Turkey 1 GB",
        data_limit_mb=1000, validity_days=7, retail_amount_minor=699,
        wholesale_amount_minor=46, currency="USD", status="active",
    )


class DirectVsCartEquivalenceTests(TestCase):
    """Same inputs, same order. This is the guarantee that makes the cart removable."""

    def setUp(self):
        _catalogue()

    def _via_cart(self, qty=1, promo=None):
        cart, _ = services.create_cart(user=None)
        services.add_item(cart, product_code="TUR-1GB-7D-V1", quantity=qty)
        return services.checkout(
            cart_id=cart.id, customer_email="a@b.com", promo_code=promo
        )

    def _direct(self, qty=1, promo=None, **kw):
        return services.checkout_direct(
            items=[{"product_code": "TUR-1GB-7D-V1", "quantity": qty}],
            customer_email="a@b.com", promo_code=promo, **kw
        )

    def _money(self, order):
        return {
            "currency": order.currency,
            "subtotal": order.subtotal_minor,
            "discount": order.discount_minor,
            "tax": order.tax_minor,
            "total": order.total_minor,
            "base_currency": order.base_currency,
            "base_subtotal": order.base_subtotal_minor,
            "base_total": order.base_total_minor,
            "fx_rate": order.fx_rate_used,
            "items": sorted(
                (i.product_code, i.unit_amount_minor, i.base_unit_amount_minor,
                 i.wholesale_amount_minor, i.currency)
                for i in order.items.all()
            ),
        }

    def test_single_item_orders_are_identical(self):
        self.assertEqual(self._money(self._via_cart()), self._money(self._direct()))

    def test_multi_unit_orders_are_identical(self):
        self.assertEqual(self._money(self._via_cart(qty=3)), self._money(self._direct(qty=3)))

    def test_discounted_orders_are_identical(self):
        PromoCode.objects.create(
            code="SAVE10", discount_type="percentage_bps", discount_value=1000
        )
        a = self._money(self._via_cart(promo="SAVE10"))
        b = self._money(self._direct(promo="SAVE10"))
        self.assertEqual(a, b)
        self.assertGreater(a["discount"], 0, "the test must actually exercise a discount")

    @override_settings(FX_RATES={"INR": "83.2"})
    def test_inr_orders_are_identical(self):
        cart, _ = services.create_cart(user=None, currency="INR")
        services.add_item(cart, product_code="TUR-1GB-7D-V1", quantity=1)
        via_cart = services.checkout(cart_id=cart.id, customer_email="a@b.com")
        direct = self._direct(currency="INR")
        self.assertEqual(self._money(via_cart), self._money(direct))
        self.assertEqual(direct.currency, "INR")

    def test_a_promo_redemption_is_reserved_either_way(self):
        PromoCode.objects.create(
            code="ONCE", discount_type="percentage_bps", discount_value=1000
        )
        order = self._direct(promo="ONCE")
        self.assertEqual(PromoRedemption.objects.get(order=order).status, "reserved")


class DirectCheckoutRulesTests(TestCase):
    def setUp(self):
        _catalogue()

    def test_prices_come_from_the_catalogue_not_the_request(self):
        """A client names the product; it can never name the price."""
        order = services.checkout_direct(
            items=[{"product_code": "TUR-1GB-7D-V1", "quantity": 1}],
            customer_email="a@b.com",
        )
        self.assertEqual(order.total_minor, 699)

    def test_a_paused_plan_is_refused(self):
        CatalogPlan.objects.update(status="paused")
        with self.assertRaises(PlanUnavailable):
            services.checkout_direct(
                items=[{"product_code": "TUR-1GB-7D-V1", "quantity": 1}],
                customer_email="a@b.com",
            )

    def test_an_unknown_product_is_refused(self):
        with self.assertRaises(PlanUnavailable):
            services.checkout_direct(
                items=[{"product_code": "NOPE", "quantity": 1}], customer_email="a@b.com"
            )

    def test_the_unit_cap_still_applies(self):
        with self.assertRaises(Conflict) as ctx:
            services.checkout_direct(
                items=[{"product_code": "TUR-1GB-7D-V1",
                        "quantity": services.MAX_CART_UNITS + 1}],
                customer_email="a@b.com",
            )
        self.assertEqual(ctx.exception.error_code, "cart_limit_exceeded")

    def test_an_empty_item_list_is_refused(self):
        with self.assertRaises(Conflict):
            services.checkout_direct(items=[], customer_email="a@b.com")


class IdempotencyTests(TestCase):
    """The guard that replaces consuming a cart."""

    def setUp(self):
        _catalogue()

    def _buy(self, key=None):
        return services.checkout_direct(
            items=[{"product_code": "TUR-1GB-7D-V1", "quantity": 1}],
            customer_email="a@b.com", idempotency_key=key,
        )

    def test_a_retry_returns_the_original_order(self):
        first = self._buy("key-1")
        second = self._buy("key-1")
        self.assertEqual(first.id, second.id)
        self.assertEqual(Order.objects.count(), 1)

    def test_the_customer_keeps_an_order_number_on_retry(self):
        """The cart's guard answered 409 with nothing to quote at support."""
        first = self._buy("key-2")
        self.assertEqual(self._buy("key-2").order_number, first.order_number)

    def test_a_different_key_creates_a_different_order(self):
        self.assertNotEqual(self._buy("key-a").id, self._buy("key-b").id)
        self.assertEqual(Order.objects.count(), 2)

    def test_without_a_key_every_call_is_a_new_order(self):
        self.assertNotEqual(self._buy().id, self._buy().id)

    def test_a_retry_does_not_double_reserve_a_promo(self):
        PromoCode.objects.create(
            code="ONCE", discount_type="percentage_bps", discount_value=1000,
            usage_limit=1,
        )
        services.checkout_direct(
            items=[{"product_code": "TUR-1GB-7D-V1", "quantity": 1}],
            customer_email="a@b.com", promo_code="ONCE", idempotency_key="k",
        )
        services.checkout_direct(
            items=[{"product_code": "TUR-1GB-7D-V1", "quantity": 1}],
            customer_email="a@b.com", promo_code="ONCE", idempotency_key="k",
        )
        self.assertEqual(PromoRedemption.objects.count(), 1)


class DirectCheckoutEndpointTests(APITestCase):
    def setUp(self):
        _catalogue()

    def test_one_request_produces_an_order(self):
        response = self.client.post(
            "/api/v1/checkout/direct/",
            {"items": [{"product_code": "TUR-1GB-7D-V1", "quantity": 1}],
             "customer_email": "a@b.com"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["total_minor"], 699)
        self.assertTrue(response.data["order_number"])

    def test_the_header_key_is_honoured(self):
        body = {"items": [{"product_code": "TUR-1GB-7D-V1", "quantity": 1}],
                "customer_email": "a@b.com"}
        a = self.client.post("/api/v1/checkout/direct/", body, format="json",
                             HTTP_IDEMPOTENCY_KEY="abc")
        b = self.client.post("/api/v1/checkout/direct/", body, format="json",
                             HTTP_IDEMPOTENCY_KEY="abc")
        self.assertEqual(a.data["id"], b.data["id"])
        self.assertEqual(Order.objects.count(), 1)

    def test_a_guest_must_supply_an_email(self):
        response = self.client.post(
            "/api/v1/checkout/direct/",
            {"items": [{"product_code": "TUR-1GB-7D-V1", "quantity": 1}]},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("customer_email", response.data["error"]["fields"])

    def test_no_cart_row_is_created(self):
        from apps.orders.models import Cart

        self.client.post(
            "/api/v1/checkout/direct/",
            {"items": [{"product_code": "TUR-1GB-7D-V1", "quantity": 1}],
             "customer_email": "a@b.com"},
            format="json",
        )
        self.assertEqual(Cart.objects.count(), 0)


class EveryOrderPathWritesBaseAmountsTests(TestCase):
    """base_* is what commissions and reports read.

    A NULL there does not fail loudly — it silently drops the order into the legacy
    pre-multi-currency branch, which computes commission from a different figure. This
    asserts it for *every* way an order can be created, so a new path cannot forget.
    """

    def setUp(self):
        _catalogue()

    def _assert_base_written(self, order):
        self.assertIsNotNone(order.base_currency, "base_currency missing")
        self.assertIsNotNone(order.base_subtotal_minor, "base_subtotal_minor missing")
        self.assertIsNotNone(order.base_total_minor, "base_total_minor missing")
        self.assertIsNotNone(order.fx_rate_used, "fx_rate_used missing")
        for item in order.items.all():
            self.assertIsNotNone(
                item.base_unit_amount_minor, "base_unit_amount_minor missing on item"
            )

    def test_cart_checkout(self):
        cart, _ = services.create_cart(user=None)
        services.add_item(cart, product_code="TUR-1GB-7D-V1", quantity=1)
        self._assert_base_written(
            services.checkout(cart_id=cart.id, customer_email="a@b.com")
        )

    def test_direct_checkout(self):
        self._assert_base_written(
            services.checkout_direct(
                items=[{"product_code": "TUR-1GB-7D-V1", "quantity": 1}],
                customer_email="a@b.com",
            )
        )

    def test_topup_order(self):
        """The path that was missing them — a top-up is an order like any other."""
        from apps.accounts.models import User
        from apps.catalog.models import TopupProduct
        from apps.esims import services as esim_services
        from apps.esims.models import EsimProfile

        user = User.objects.create_user(email="t@b.com", password="pw-123456789")
        cart, _ = services.create_cart(user=user)
        services.add_item(cart, product_code="TUR-1GB-7D-V1", quantity=1)
        order = services.checkout(cart_id=cart.id, customer_email=user.email, user=user)
        esim_services.enqueue_provisioning_for_order(order)
        while esim_services.claim_and_process_one():
            pass
        profile = EsimProfile.objects.get(order_item__order=order)

        plan = CatalogPlan.objects.get(product_code="TUR-1GB-7D-V1")
        TopupProduct.objects.create(
            supplier=plan.supplier, product_code="TOP-1GB", name="Top-up 1 GB",
            supplier_package_code="TPKG", data_amount_mb=1000, validity_days=7,
            retail_amount_minor=499, wholesale_amount_minor=60, currency="USD",
            status="active",
        )
        topup_order = esim_services.create_topup_order(
            user=user, esim_profile_id=profile.id, topup_product_code="TOP-1GB"
        )
        self._assert_base_written(topup_order)
        self.assertEqual(topup_order.base_total_minor, 499)
