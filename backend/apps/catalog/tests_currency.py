"""Multi-currency pricing: minor-unit arithmetic, FX freshness, and the rates endpoint.

Phase 1 of the multi-currency design. Nothing here changes what a customer is charged yet —
these lock the arithmetic down before checkout is allowed to use it, because every bug in
this file is a mis-charge.
"""

from datetime import timedelta
from decimal import Decimal

from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.catalog import fx
from apps.catalog.models import FxRate
from apps.common.currency import (
    BASE_CURRENCY,
    UnsupportedCurrency,
    convert,
    convert_discount,
    decimals_for,
    from_minor_units,
    is_supported,
    to_minor_units,
)


class MinorUnitTests(TestCase):
    def test_two_decimal_currencies_scale_by_100(self):
        self.assertEqual(to_minor_units("6.99", "USD"), 699)
        self.assertEqual(to_minor_units("599", "INR"), 59900)

    def test_zero_decimal_currency_is_not_scaled(self):
        """The 100x bug. ¥700 is 700, not 70000."""
        self.assertEqual(decimals_for("JPY"), 0)
        self.assertEqual(to_minor_units("700", "JPY"), 700)
        self.assertEqual(from_minor_units(700, "JPY"), Decimal(700))

    def test_round_trips(self):
        for amount, currency in (("6.99", "USD"), ("599", "INR"), ("1140", "JPY")):
            minor = to_minor_units(amount, currency)
            self.assertEqual(from_minor_units(minor, currency), Decimal(amount))

    def test_unsupported_currency_is_refused_not_guessed(self):
        self.assertFalse(is_supported("XYZ"))
        with self.assertRaises(UnsupportedCurrency):
            to_minor_units("1.00", "XYZ")


class ConversionTests(TestCase):
    RATE = Decimal("83.2")          # INR per USD
    WHOLESALE_USD = Decimal("0.46")

    def test_base_currency_is_returned_untouched(self):
        self.assertEqual(convert(699, to_currency="USD", rate=Decimal(1)), 699)

    def test_produces_a_clean_local_price(self):
        minor = convert(699, to_currency="INR", rate=self.RATE)
        self.assertEqual(from_minor_units(minor, "INR"), Decimal("599"))

    def test_never_prices_below_the_unbuffered_fx_value(self):
        """Charm rounding may dip into the buffer but must not cross the true FX value."""
        for rate in ("60", "70", "83.2", "95", "110", "125"):
            rate = Decimal(rate)
            minor = convert(699, to_currency="INR", rate=rate)
            received_usd = from_minor_units(minor, "INR") / rate
            self.assertGreaterEqual(
                received_usd, Decimal("6.99") * Decimal("0.98"),
                f"rate {rate} priced below the FX floor",
            )
            self.assertGreater(received_usd, self.WHOLESALE_USD)

    def test_price_rises_as_the_local_currency_weakens(self):
        weak = convert(699, to_currency="INR", rate=Decimal("110"))
        strong = convert(699, to_currency="INR", rate=Decimal("70"))
        self.assertGreater(weak, strong)

    def test_zero_decimal_conversion_stays_whole(self):
        minor = convert(699, to_currency="JPY", rate=Decimal("157"))
        self.assertEqual(minor % 10, 0)          # rounded to the nearest ¥10
        self.assertLess(minor, 5000)             # sanity: not a 100x blow-up

    def test_a_full_value_discount_can_never_exceed_the_subtotal(self):
        """The order_discount_le_subtotal constraint is a database check.

        Rounding down is not sufficient on its own: the subtotal is charm-rounded down to
        a clean ₹599 while the discount is not, so an uncapped full-value discount lands a
        paisa above it and the insert fails.
        """
        subtotal = convert(699, to_currency="INR", rate=self.RATE)
        discount = convert_discount(
            699, to_currency="INR", rate=self.RATE, max_minor=subtotal
        )
        self.assertLessEqual(discount, subtotal)

    def test_a_partial_discount_converts_proportionally(self):
        subtotal = convert(699, to_currency="INR", rate=self.RATE)
        discount = convert_discount(
            100, to_currency="INR", rate=self.RATE, max_minor=subtotal
        )
        self.assertLess(discount, subtotal)
        self.assertGreater(discount, 0)

    def test_a_discount_is_never_negative(self):
        self.assertEqual(
            convert_discount(0, to_currency="INR", rate=self.RATE, max_minor=59900), 0
        )


class FxRateSourceTests(TestCase):
    """Rates come from settings; a stored FxRate row wins if one exists."""

    @override_settings(FX_RATES={"INR": "88"})
    def test_configured_rate_is_used(self):
        self.assertEqual(fx.latest_rate("INR"), Decimal("88"))
        self.assertTrue(fx.is_supported_for_charging("INR"))

    def test_base_currency_needs_no_rate(self):
        self.assertEqual(fx.latest_rate("USD"), Decimal(1))
        self.assertTrue(fx.is_supported_for_charging("USD"))

    @override_settings(FX_RATES={})
    def test_an_unconfigured_currency_cannot_be_charged(self):
        """No rate means the currency is simply not offered, never guessed."""
        self.assertIsNone(fx.latest_rate("INR"))
        self.assertFalse(fx.is_supported_for_charging("INR"))

    @override_settings(FX_RATES={"INR": "88"})
    def test_a_stored_rate_overrides_settings(self):
        """So an automated feed can be introduced later without touching callers."""
        FxRate.objects.create(
            base_currency="USD", quote_currency="INR", rate=Decimal("83.2"),
            source="test", fetched_at=timezone.now(),
        )
        self.assertEqual(fx.latest_rate("INR"), Decimal("83.2"))

    @override_settings(FX_RATES={"INR": "88"})
    def test_current_rates_lists_what_can_be_charged(self):
        rates = fx.current_rates()
        self.assertEqual(rates["USD"], Decimal(1))
        self.assertIn("INR", rates)


class FxRateEndpointTests(APITestCase):
    def setUp(self):
        # The endpoint caches; without this a previous test's table leaks into this one.
        cache.clear()

    @override_settings(FX_RATES={"INR": "88"})
    def test_lists_the_chargeable_currencies(self):
        body = self.client.get("/api/v1/catalog/rates/").json()
        self.assertEqual(body["base"], BASE_CURRENCY)
        self.assertIn("USD", body["rates"])
        self.assertIn("INR", body["rates"])

    @override_settings(FX_RATES={}, FX_BUFFER="1.05")
    def test_exposes_the_buffer_so_display_and_charge_agree(self):
        body = self.client.get("/api/v1/catalog/rates/").json()
        self.assertEqual(body["buffer"], "1.05")
        self.assertEqual(list(body["rates"]), ["USD"])


@override_settings(FX_RATES={"INR": "83.2"}, PAYMENTS_GATEWAY="fake",
                   STRIPE_WEBHOOK_SECRET="whsec_test")
class InrCheckoutTests(TestCase):
    """Phase 2: an order actually denominated in the buyer's currency.

    This is what unlocks UPI — Stripe derives the offered payment methods from the
    PaymentIntent's currency, and the intent takes its currency from the order.
    """

    def setUp(self):
        from apps.catalog.models import CatalogPlan, Country, Supplier

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

    def _checkout(self, currency, **kwargs):
        from apps.orders import services as order_services

        cart, _ = order_services.create_cart(user=None, currency=currency)
        order_services.add_item(cart, product_code="TUR-1GB-7D-V1", quantity=1)
        return order_services.checkout(
            cart_id=cart.id, customer_email="a@b.com", **kwargs
        )

    def test_an_inr_cart_produces_an_inr_order(self):
        order = self._checkout("INR")
        self.assertEqual(order.currency, "INR")
        self.assertEqual(from_minor_units(order.total_minor, "INR"), Decimal("599"))

    def test_the_usd_base_is_stored_alongside(self):
        """Commissions and reports read these; without them totals are unsummable."""
        order = self._checkout("INR")
        self.assertEqual(order.base_currency, "USD")
        self.assertEqual(order.base_subtotal_minor, 699)
        self.assertEqual(order.base_total_minor, 699)

    def test_the_rate_is_snapshotted_on_the_order(self):
        """A refund weeks later must reverse at the rate actually used, not today's."""
        order = self._checkout("INR")
        self.assertEqual(order.fx_rate_used, Decimal("83.2"))

    def test_order_items_carry_both_amounts(self):
        order = self._checkout("INR")
        item = order.items.first()
        self.assertEqual(item.currency, "INR")
        self.assertEqual(item.base_unit_amount_minor, 699)
        self.assertGreater(item.unit_amount_minor, item.base_unit_amount_minor)
        # Wholesale is what the supplier charges us and is always USD.
        self.assertEqual(item.wholesale_amount_minor, 46)

    def test_the_database_balance_constraint_holds_in_inr(self):
        order = self._checkout("INR")
        self.assertEqual(
            order.total_minor,
            order.subtotal_minor - order.discount_minor + order.tax_minor,
        )

    def test_usd_is_unchanged(self):
        order = self._checkout("USD")
        self.assertEqual(order.currency, "USD")
        self.assertEqual(order.total_minor, 699)
        self.assertEqual(order.fx_rate_used, Decimal(1))

    @override_settings(FX_RATES={})
    def test_an_unconfigured_currency_falls_back_to_usd(self):
        """Never fail the checkout over a missing rate — charge in the base currency."""
        order = self._checkout("INR")
        self.assertEqual(order.currency, "USD")
        self.assertEqual(order.total_minor, 699)

    def test_the_payment_intent_is_created_in_the_order_currency(self):
        """The whole point: an INR intent is what makes Stripe offer UPI."""
        from apps.payments import services as payment_services
        from apps.payments.models import Payment

        order = self._checkout("INR")
        payment_services.create_payment_intent_for_order(order)
        payment = Payment.objects.get(order=order)
        self.assertEqual(payment.currency, "INR")
        self.assertEqual(payment.amount_minor, order.total_minor)


@override_settings(FX_RATES={"INR": "83.2"})
class StripeMinimumTests(TestCase):
    """Stripe refuses tiny charges: measured live, INR is rejected at ₹35, accepted at ₹40."""

    def setUp(self):
        from apps.catalog.models import CatalogPlan, Country, Supplier

        supplier = Supplier.objects.create(code="s", name="S", status="active")
        country = Country.objects.create(
            iso2="MO", name="Macao", slug="macao", region="Asia", is_active=True
        )
        # A deliberately tiny plan: $0.20 converts to about ₹17, under the floor.
        CatalogPlan.objects.create(
            supplier=supplier, country=country, product_code="TINY",
            supplier_package_code="PKG", plan_type="fixed", display_name="Tiny",
            data_limit_mb=100, validity_days=1, retail_amount_minor=20,
            wholesale_amount_minor=5, currency="USD", status="active",
        )

    def test_a_charge_below_the_minimum_falls_back_to_usd(self):
        """Better a USD charge than a raw provider error after the customer committed."""
        from apps.orders import services as order_services

        cart, _ = order_services.create_cart(user=None, currency="INR")
        order_services.add_item(cart, product_code="TINY", quantity=1)
        order = order_services.checkout(cart_id=cart.id, customer_email="a@b.com")
        self.assertEqual(order.currency, "USD")
        self.assertEqual(order.total_minor, 20)
